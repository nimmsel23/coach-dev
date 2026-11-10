#!/usr/bin/env python3
"""CI / fallback enrichment for inbox/*.yml (data-only fitness KB repo).

Primary path remains coach-sync on the laptop. This script is the cloud fallback:
enrich one (or N) inbox drafts in place, never promote into exercises/.

Usage:
  python3 scripts/enrich_inbox.py --list
  python3 scripts/enrich_inbox.py --file inbox/foo.yml
  python3 scripts/enrich_inbox.py --limit 1
  python3 scripts/enrich_inbox.py --limit 1 --dry-run
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

try:
    import yaml
except ImportError:
    print("PyYAML required: pip install pyyaml", file=sys.stderr)
    sys.exit(2)

ROOT = Path(__file__).resolve().parents[1]
INBOX = ROOT / "inbox"
MUSCLE_INDEX = ROOT / "muscle_index.yml"
BUCKETS = ("chest", "back", "shoulders", "arms", "abs", "legs", "glutes")
CATEGORIES = ("push", "pull", "squat", "lunge", "gait", "twist", "carry")

PROMPT = """You are an expert fitness coach and biomechanics expert.
I have a basic exercise entry from a bulk import that needs professional "Expert Tier" enrichment.

CRITICAL: "german" and "english" are BOTH MANDATORY, independent fields.
"display_name" mirrors "german" by convention (UI default).

CRITICAL: primary_muscles, secondary_muscles, and stabilizers must use the
current catalog vocabulary. Prefer fine anatomical IDs when confident.

CRITICAL: "category" is one of: push, pull, squat, lunge, gait, twist, carry.
Do NOT use body regions as category. Put joint actions into "movements" (list).

Allowed coarse muscle buckets:
{muscle_bucket_list}

Allowed fine anatomical IDs:
{muscle_detail_list}

Existing Data (Wiki Layer):
{existing_json}
{feedback_section}
Your task:
1. Keep exercise_id, wger_id, yuhonas_id, external_ids, origin.
2. Verify category + muscles.
3. Generate HIGH-QUALITY coaching_notes and common_errors in GERMAN (flat string arrays).
4. Capture biomechanical details in movements as a list.
{feedback_instruction}

Return a JSON object with the full enriched exercise (single exercise object, not wrapped).
Do not include markdown fences.
"""


def _load_yaml(path: Path):
    return yaml.safe_load(path.read_text(encoding="utf-8")) or {}


def _dump_yaml(data) -> str:
    return yaml.safe_dump(data, sort_keys=False, allow_unicode=True, width=88)


def muscle_vocab() -> tuple[str, str]:
    buckets = []
    for name in BUCKETS:
        p = ROOT / "muscles" / f"{name}.yml"
        if p.exists():
            buckets.append(name)
    details: list[str] = []
    if MUSCLE_INDEX.exists():
        idx = _load_yaml(MUSCLE_INDEX)
        muscles = idx.get("muscles") or {}
        if isinstance(muscles, dict):
            details = sorted(str(k) for k in muscles.keys())
    return ", ".join(buckets) or "(none)", ", ".join(details[:400]) or "(none)"


def list_inbox() -> list[Path]:
    return sorted(INBOX.glob("inbox_*.yml")) + sorted(
        p for p in INBOX.glob("*.yml") if not p.name.startswith("inbox_") and p.name != ".gitkeep"
    )


def pick_files(file: str | None, limit: int) -> list[Path]:
    if file:
        path = Path(file)
        if not path.is_absolute():
            path = ROOT / path
        if not path.exists():
            raise SystemExit(f"file not found: {path}")
        return [path]
    files = list_inbox()
    if not files:
        raise SystemExit("inbox/ is empty")
    return files[: max(1, limit)]


def exercise_from_doc(doc: dict) -> tuple[dict, str]:
    """Return (exercise_dict, container_mode) where mode is 'list' or 'root'."""
    if isinstance(doc.get("exercises"), list) and doc["exercises"]:
        ex = doc["exercises"][0]
        if not isinstance(ex, dict):
            raise SystemExit("exercises[0] is not a mapping")
        return ex, "list"
    return doc, "root"


def extract_json_object(text: str) -> dict | None:
    text = text.strip()
    fence = re.search(r"```(?:json)?\s*(\{.*\})\s*```", text, re.DOTALL)
    if fence:
        text = fence.group(1)
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end < 0:
        return None
    try:
        data = json.loads(text[start : end + 1])
    except json.JSONDecodeError:
        return None
    return data if isinstance(data, dict) else None


def call_gemini(prompt: str, api_key: str, model: str) -> str:
    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{model}:generateContent?key={api_key}"
    )
    body = json.dumps({
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.3},
    }).encode("utf-8")
    req = urllib.request.Request(
        url, data=body, headers={"Content-Type": "application/json"}, method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=90) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        err = e.read().decode("utf-8", errors="replace")
        raise SystemExit(f"Gemini HTTP {e.code}: {err[:500]}") from e
    parts = (
        payload.get("candidates") or [{}]
    )[0].get("content", {}).get("parts") or []
    text = "".join(p.get("text", "") for p in parts if isinstance(p, dict))
    if not text.strip():
        raise SystemExit(f"empty Gemini response: {json.dumps(payload)[:400]}")
    return text


def merge_enrichment(base: dict, enriched: dict) -> dict:
    out = dict(base)
    # Preserve identity / provenance always.
    for key in (
        "exercise_id", "id", "wger_id", "yuhonas_id", "external_ids", "origin",
        "source", "schema_version",
    ):
        if key in base:
            out[key] = base[key]
    for key, value in enriched.items():
        if key in ("exercise_id", "id", "wger_id", "yuhonas_id", "external_ids", "origin"):
            continue
        out[key] = value
    if out.get("german") and not out.get("display_name"):
        out["display_name"] = out["german"]
    if out.get("category") and out["category"] not in CATEGORIES:
        # keep model suggestion but leave a marker for coach review
        out.setdefault("tags", [])
        if isinstance(out["tags"], list) and "category_review" not in out["tags"]:
            out["tags"] = list(out["tags"]) + ["category_review"]
    out["enriched_at"] = datetime.now(timezone.utc).isoformat()
    out.setdefault("tags", [])
    if isinstance(out["tags"], list) and "ci_enrichment" not in out["tags"]:
        out["tags"] = list(out["tags"]) + ["ci_enrichment"]
    return out


def enrich_file(path: Path, *, api_key: str, model: str, feedback: str | None, dry_run: bool) -> Path:
    doc = _load_yaml(path)
    if not isinstance(doc, dict):
        raise SystemExit(f"{path}: root must be a mapping")
    ex, mode = exercise_from_doc(doc)
    buckets, details = muscle_vocab()
    feedback_section = ""
    feedback_instruction = ""
    if feedback:
        feedback_section = f'\nCoach Feedback:\n"{feedback}"\n'
        feedback_instruction = (
            "5. Honour coach feedback; do not reuse criticised wording.\n"
        )
    prompt = PROMPT.format(
        muscle_bucket_list=buckets,
        muscle_detail_list=details,
        existing_json=json.dumps(ex, indent=2, ensure_ascii=False),
        feedback_section=feedback_section,
        feedback_instruction=feedback_instruction,
    )
    raw = call_gemini(prompt, api_key, model)
    parsed = extract_json_object(raw)
    if not parsed:
        raise SystemExit(f"{path}: could not parse Gemini JSON")
    # If model wrapped under exercises: [...]
    if "exercises" in parsed and isinstance(parsed["exercises"], list) and parsed["exercises"]:
        parsed = parsed["exercises"][0]
    merged = merge_enrichment(ex, parsed)
    if mode == "list":
        doc["exercises"][0] = merged
        doc["enriched_at"] = merged["enriched_at"]
        if not doc.get("description"):
            name = merged.get("german") or merged.get("display_name") or path.stem
            doc["description"] = f"CI enrichment for: {name}"
    else:
        doc = merged
    if dry_run:
        print(f"DRY-RUN {path.relative_to(ROOT)} → would write {len(_dump_yaml(doc))} bytes")
        return path
    path.write_text(_dump_yaml(doc), encoding="utf-8")
    print(f"enriched {path.relative_to(ROOT)}")
    return path


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--list", action="store_true", help="list inbox files and exit")
    ap.add_argument("--file", help="inbox path relative to repo root")
    ap.add_argument("--limit", type=int, default=1, help="max files when --file omitted")
    ap.add_argument("--feedback", default="", help="optional coach feedback")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--model", default=os.environ.get("GEMINI_MODEL", "gemini-2.5-flash"))
    args = ap.parse_args()

    if args.list:
        for p in list_inbox():
            print(p.relative_to(ROOT))
        return 0

    api_key = (os.environ.get("GEMINI_API_KEY") or "").strip().strip("'\"")
    if args.dry_run and not api_key:
        files = pick_files(args.file, args.limit)
        for path in files:
            print(f"DRY-RUN {path.relative_to(ROOT)} (no GEMINI_API_KEY — skip model call)")
        print("ENRICHED_FILES=" + ",".join(str(p.relative_to(ROOT)) for p in files))
        return 0
    if not api_key:
        raise SystemExit("GEMINI_API_KEY missing")

    written: list[Path] = []
    for path in pick_files(args.file, args.limit):
        written.append(
            enrich_file(
                path,
                api_key=api_key,
                model=args.model,
                feedback=args.feedback or None,
                dry_run=args.dry_run,
            )
        )
    # Machine-readable summary for Actions
    print("ENRICHED_FILES=" + ",".join(str(p.relative_to(ROOT)) for p in written))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
