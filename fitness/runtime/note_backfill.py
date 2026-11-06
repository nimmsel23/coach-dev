from __future__ import annotations

import asyncio
import json
import subprocess
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

from loguru import logger

from fitness.runtime.session_store import iter_session_files

SESSION_FIX_PROMPT = """Oeffne die Datei {path} (Read-Tool) -- eine Fitness-Trainings-Session-JSON.

Schlage Korrekturen vor anhand der bereits geloggten Fakten in der Datei selbst
(nichts erfinden, nur ableiten was eindeutig aus den vorhandenen Daten hervorgeht):

1. In exercises[].setsArray[]: wenn ein Set-Eintrag `reps` leer/0/null hat, aber
   das `note`-Feld der zugehoerigen Uebung echte Wiederholungen und/oder Gewicht
   als Freitext nennt (z.B. "90-80kg", "16 bis 10kg", "ca. 40 Schritte", "8kg
   jeweils"), leite die daraus erkennbaren Werte ab (reps als int, weight als
   float). Bei einem Gewichts-Bereich (Dropset, z.B. "90-80kg") nimm das ERSTE
   (hoechste) Gewicht als `weight`. Wenn aus der Note weder reps noch weight
   zweifelsfrei hervorgehen, schlage fuer dieses Set nichts vor.

2. Wenn das Top-Level-Feld `block` leer oder "?" ist: leite den Trainingsblock
   (z.B. "Push", "Pull", "Legs", "Upper", "Full Body") aus den in `exercises[]`
   gelisteten Uebungsnamen ab -- du siehst die komplette Uebungsliste der
   Session, das ist eindeutig genug (z.B. nur Bankdruecken/Trizeps-Uebungen ->
   "Push"; Kreuzheben+Rudern+Klimmzug -> "Pull"; Mix aus Ober- und Unterkoerper
   -> "Full Body"). Nur vorschlagen wenn die Uebungen eine klare Zuordnung
   erlauben.

3. Trainingsmethodik dieses Nutzers ist vereinbarungsgemaess HIT + Dropsets +
   RestPause -- also Training bis nahe an das Muskelversagen. Wenn `effort`
   (RPE) exakt 5 ist, ist das ein nie beruehrter UI-Default, kein echter Wert.
   Zaehle in den `note`-Feldern die Dropset-/RestPause-Stufen (z.B. "90-80kg"
   = 2 Stufen, "16 bis 10kg" = mehrstufig, "50-30kg" = 2 Stufen). Leite daraus
   einen RPE-Wert 8-10 ab: mehr/tiefere Stufen -> naeher an 10. Nur vorschlagen
   wenn mindestens eine Uebung erkennbare Dropset-/RestPause-Stufen in der Note
   hat -- sonst effort unveraendert lassen (kein Rateswert ohne Beleg).

`date`, sonstige Metadaten NICHT anfassen -- dafuer gibt es keine Grundlage.

Du bearbeitest die Datei NICHT selbst -- gib NUR ein JSON-Objekt zurueck, keine
Erklaerung davor/danach:
{{
  "block": <neuer Block-String oder null>,
  "effort": <int 8-10 oder null>,
  "effort_reasoning": <kurzer String der die Dropset/RestPause-Belege nennt, oder null>,
  "set_patches": [
    {{"exercise_index": <int>, "set_index": <int>, "reps": <int oder null>, "weight": <float oder null>}}
  ]
}}
Leere Liste/null wenn nichts vorzuschlagen ist.
"""


@dataclass
class SessionFixResult:
    user_id: str
    session_file: str
    applied: bool
    summary: str


def _ask_claude_for_session_patch(session_file: Path) -> dict:
    prompt = SESSION_FIX_PROMPT.format(path=session_file)
    result = subprocess.run(
        [
            "claude", "-p", "--model", "haiku",
            "--allowedTools", "Read",
            "--permission-mode", "default",
            "--output-format", "json",
        ],
        input=prompt,
        capture_output=True,
        text=True,
        timeout=180,
    )
    if result.returncode != 0:
        raise RuntimeError(f"claude CLI failed: {result.stderr.strip()}")
    outer = json.loads(result.stdout)
    text = outer.get("result", outer.get("response", ""))
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end < 0:
        raise ValueError(f"no JSON object in claude response: {text!r}")
    return json.loads(text[start : end + 1])


def _apply_session_patch(session_file: Path, patch: dict) -> str:
    data = json.loads(session_file.read_text(encoding="utf-8"))
    changes: list[str] = []

    new_block = patch.get("block")
    if new_block and _block_missing(data.get("block")):
        data["block"] = new_block
        changes.append(f"block -> {new_block}")

    new_effort = patch.get("effort")
    if new_effort is not None and data.get("effort") == 5:
        try:
            new_effort = int(new_effort)
        except (TypeError, ValueError):
            new_effort = None
        if new_effort is not None and 8 <= new_effort <= 10:
            data["effort"] = new_effort
            data["effort_inferred"] = True
            data["effort_inferred_reasoning"] = patch.get("effort_reasoning") or ""
            changes.append(f"effort -> {new_effort} (inferred: {patch.get('effort_reasoning')})")

    for set_patch in patch.get("set_patches") or []:
        try:
            ex_idx, set_idx = int(set_patch["exercise_index"]), int(set_patch["set_index"])
            s = data["exercises"][ex_idx]["setsArray"][set_idx]
        except (KeyError, IndexError, TypeError, ValueError):
            continue
        if not _reps_missing(s.get("reps")):
            continue
        new_reps, new_weight = set_patch.get("reps"), set_patch.get("weight")
        if new_reps is None and new_weight is None:
            continue
        if new_reps is not None:
            s["reps"] = new_reps
        if new_weight is not None:
            s["weight"] = new_weight
        name = data["exercises"][ex_idx].get("name", ex_idx)
        changes.append(f"{name}[{set_idx}] -> reps={new_reps} weight={new_weight}")

    if not changes:
        return "keine Aenderung noetig"

    backup = session_file.with_suffix(session_file.suffix + ".bak")
    if not backup.exists():
        backup.write_text(session_file.read_text(encoding="utf-8"), encoding="utf-8")
    session_file.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    return "; ".join(changes)


def _reps_missing(value: Any) -> bool:
    return value in ("", None, 0)


def _block_missing(value: Any) -> bool:
    return str(value or "").strip() in ("", "?")


def find_sessions_needing_fix(
    *,
    user_id: str | None = None,
    min_age_minutes: int = 60,
) -> list[Path]:
    """Find session files with empty/0 reps despite a note, or a missing/placeholder block."""
    cutoff = datetime.utcnow() - timedelta(minutes=min_age_minutes)
    candidates: list[Path] = []

    for _uid, session_file in iter_session_files(user_id):
        try:
            data = json.loads(session_file.read_text(encoding="utf-8"))
        except Exception:
            continue
        if not isinstance(data, dict):
            continue
        saved_at = data.get("saved_at")
        if saved_at:
            try:
                if datetime.fromisoformat(saved_at.replace("Z", "+00:00")).replace(tzinfo=None) > cutoff:
                    continue
            except ValueError:
                pass

        exercises = data.get("exercises", [])
        needs_fix = _block_missing(data.get("block")) and bool(exercises)
        if not needs_fix:
            for exercise in exercises:
                if not isinstance(exercise, dict):
                    continue
                note = str(exercise.get("note") or exercise.get("notes") or "").strip()
                sets_array = exercise.get("setsArray")
                if note and isinstance(sets_array, list) and any(
                    isinstance(s, dict) and _reps_missing(s.get("reps")) for s in sets_array
                ):
                    needs_fix = True
                    break
        if needs_fix:
            candidates.append(session_file)
    return candidates


def fix_sessions(
    *,
    user_id: str | None = None,
    apply: bool = False,
    min_age_minutes: int = 60,
) -> list[SessionFixResult]:
    """Have Haiku read each candidate session file and propose reps/weight/block fixes;
    this process applies them (with a .bak backup) -- Haiku never edits the file itself."""
    candidates = find_sessions_needing_fix(user_id=user_id, min_age_minutes=min_age_minutes)
    results: list[SessionFixResult] = []
    for session_file in candidates:
        user_id_for_file = session_file.parent.parent.name
        try:
            patch = _ask_claude_for_session_patch(session_file)
            summary = _apply_session_patch(session_file, patch) if apply else _describe_session_patch(patch)
        except Exception as e:
            summary = f"FEHLER: {e}"
        results.append(
            SessionFixResult(
                user_id=user_id_for_file,
                session_file=str(session_file),
                applied=apply,
                summary=summary,
            )
        )
    return results


def _describe_session_patch(patch: dict) -> str:
    parts = []
    if patch.get("block"):
        parts.append(f"block -> {patch['block']}")
    for sp in patch.get("set_patches") or []:
        parts.append(f"exercise[{sp.get('exercise_index')}].setsArray[{sp.get('set_index')}] -> reps={sp.get('reps')} weight={sp.get('weight')}")
    return "; ".join(parts) if parts else "keine Aenderung noetig"


def find_suspect_default_effort(*, user_id: str | None = None, default_value: int = 5) -> list[dict[str, Any]]:
    """Flag (never patch) sessions whose `effort` sits at the UI's untouched default.

    Bei HIT/Dropset/RestPause-Training (vereinbarte Trainingsmethodik) ist ein
    durchgaengiger RPE von 5 fachlich unplausibel -- vermutlich wurde das
    Effort-Feld nie bewusst gesetzt, weil es in der UI zu versteckt war. Ein
    echter Wert laesst sich nachtraeglich nicht rekonstruieren, deshalb wird
    hier nur informativ geflaggt statt automatisch korrigiert.
    """
    suspects: list[dict[str, Any]] = []

    for uid, session_file in iter_session_files(user_id):
        try:
            data = json.loads(session_file.read_text(encoding="utf-8"))
        except Exception:
            continue
        if not isinstance(data, dict):
            continue
        if data.get("effort") == default_value and data.get("exercises"):
            suspects.append(
                {
                    "user_id": uid,
                    "session_file": str(session_file),
                    "date": str(data.get("date") or session_file.stem),
                    "effort": default_value,
                    "note": "vermutlich nie gesetzt (UI-Default) -- nicht automatisch korrigiert",
                }
            )
    return suspects


def dataclass_payload(items: list[Any]) -> list[dict[str, Any]]:
    return [asdict(item) for item in items]
