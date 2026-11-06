from __future__ import annotations

from typing import Any

from fitness.catalog.core.resolver import build_exercise_index
from fitness.catalog.core.source_merge import _entries_from_file, find_source_entries


def list_inbox_merge_candidates() -> dict[str, dict[str, Any]]:
    """Fuer jeden Inbox-Draft ohne bereits verlinkten wger/yuhonas-Treffer:
    liefert einen Fuzzy-Kandidaten (Score zwischen CANDIDATE_MIN_SCORE und
    AUTO_MATCH_MIN_SCORE, siehe source_merge.py), falls einer existiert.

    Reiner Hinweis fuer den Coach ("koennte dieselbe Uebung sein wie X in
    wger/yuhonas") — verlinkt/schreibt nichts, ersetzt keine bestehende
    Anzeige. Manuelle Bestaetigung bleibt `attach-sources --apply` bzw. ein
    spaeterer expliziter Merge-Schritt."""
    wger_entries = _entries_from_file("unreviewed_wger.yml")
    yuhonas_entries = _entries_from_file("unreviewed_yuhonas.yml")

    out: dict[str, dict[str, Any]] = {}
    for record in build_exercise_index():
        if record.source != "inbox":
            continue
        found = find_source_entries(
            record.display_name,
            record.exercise_id,
            record=record,
            wger_entries=wger_entries,
            yuhonas_entries=yuhonas_entries,
        )
        candidates: dict[str, Any] = {}
        for source_key in ("wger", "yuhonas"):
            entry = found.get(f"{source_key}_candidate")
            score = found.get(f"{source_key}_candidate_score")
            if not entry:
                continue
            candidates[source_key] = {
                "id": entry.get(f"{source_key}_id"),
                "display_name": entry.get("display_name") or entry.get("german") or entry.get("english"),
                "score": score,
            }
        if candidates:
            out[record.exercise_id] = candidates
    return out
