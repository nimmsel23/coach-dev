"""Vault-Utils — Obsidian MD lesen, Tags extrahieren, Frontmatter aktualisieren."""
from __future__ import annotations

import os
import re
import subprocess
from datetime import date
from pathlib import Path

import yaml

VAULT_ROOT = Path(
    os.environ.get(
        "ANATOMY_KB_VAULT",
        str(Path.home() / "Dokumente/Vitaltrainer/Dipl.HealthPersonalTrainer/Übungen"),
    )
)


def strip_wikilinks(text: str) -> str:
    """[[Link|Display]] → Display, [[Link]] → Link"""
    text = re.sub(r"\[\[([^\]|]+)\|([^\]]+)\]\]", r"\2", text)
    text = re.sub(r"\[\[([^\]]+)\]\]", r"\1", text)
    return text


def extract_tags(raw_md: str) -> list[str]:
    """Tags aus YAML-Frontmatter + Inline-Hashtags."""
    tags: set[str] = set()
    if raw_md.startswith("---"):
        end = raw_md.find("---", 3)
        if end != -1:
            try:
                fm = yaml.safe_load(raw_md[3:end]) or {}
                for t in fm.get("tags", []):
                    tags.add(str(t).lstrip("#").lower().strip())
            except Exception:
                pass
    for tag in re.findall(r"(?<!\w)#([a-zA-ZÄäÖöÜüß][\w\-äöüÄÖÜß]+)", raw_md):
        tags.add(tag.lower())
    return sorted(t for t in tags if t and len(t) > 1)


def find_file(query: str) -> Path | None:
    """Fuzzy-Suche im Vault via fzf."""
    if not VAULT_ROOT.exists():
        return None
    all_md = list(VAULT_ROOT.rglob("*.md"))
    if not all_md:
        return None
    names = [str(p.relative_to(VAULT_ROOT)) for p in all_md]
    result = subprocess.run(
        ["fzf", "--prompt", f"Vault: ", "--height=50%", "--border",
         "--query", query, "--select-1", "--exit-0"],
        input="\n".join(names), text=True, capture_output=True,
    )
    chosen = result.stdout.strip()
    return (VAULT_ROOT / chosen) if chosen else None


def update_frontmatter(md_path: Path, exercise_id: str, fields: list[str]) -> None:
    """Fügt anatomy_kb-Block ins YAML-Frontmatter der MD-Notiz ein."""
    for enc in ("utf-8", "latin-1", "cp1252"):
        try:
            raw = md_path.read_text(encoding=enc)
            break
        except UnicodeDecodeError:
            continue
    else:
        raw = md_path.read_bytes().decode("utf-8", errors="replace")
    today = date.today().isoformat()

    kb_entry = {
        "exercise_id": exercise_id,
        "ingested": today,
        "fields": fields,
    }

    if raw.startswith("---"):
        end = raw.find("---", 3)
        if end != -1:
            frontmatter_str = raw[3:end]
            try:
                fm = yaml.safe_load(frontmatter_str) or {}
            except Exception:
                fm = {}
            fm["anatomy_kb"] = kb_entry
            new_fm = yaml.dump(fm, allow_unicode=True, default_flow_style=False, sort_keys=False)
            updated = f"---\n{new_fm}---{raw[end + 3:]}"
            md_path.write_text(updated)
            return

    new_fm = yaml.dump({"anatomy_kb": kb_entry}, allow_unicode=True,
                       default_flow_style=False, sort_keys=False)
    md_path.write_text(f"---\n{new_fm}---\n\n{raw}")
