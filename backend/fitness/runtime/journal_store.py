"""JSONL-basiertes Journal-SOT + deterministischer Markdown-Renderer.

`journal/YYYY-MM-DD.entries.jsonl` ist ab jetzt die **Quelle der Wahrheit**
für Tages-Journale: eine JSON-Zeile pro Eintrag. Die bisherige
`journal/YYYY-MM-DD.md` ist ein **reines Derivat**, das nach jeder Änderung
komplett aus der JSONL neu gerendert wird (`render_md`).

Damit fällt:
  * **Edit**   = Zeile in der JSONL ersetzen (`upsert_entry` mit gleicher id)
  * **Delete** = Zeile entfernen (`delete_entry`)
und das fragile Marker-Kommentar-Parsing der `.md` im Schreibpfad entfällt.

Eintrags-Schema (alle Felder Strings ausser `meta`):
  id      – stabil; = bisheriger Marker-Wert (fsid/fshr/fshid/fssn =
            Firestore-doc-id) bzw. `freetext-<date>` für den Freitext-Block.
  source  – journal | habit_records | habit_journals | freetext | session_note

Eintrags-**Identität** ist das Paar ``(source, id)``, nicht die `id` allein:
dieselbe Firestore-doc-id kommt über verschiedene Subkollektionen (z.B.
`habitRecords` **und** `habitJournals`, beide `<habitid>_<date>`) vor —
würde nur die `id` zählen, überschrieben die Einträge sich gegenseitig.
Der `.md`-Marker ist entsprechend ``<!-- entry:<source>:<id> -->``.
  ts      – ISO-8601-Zeitstempel oder "" (Sortierschlüssel; "" sortiert zuerst)
  body    – gerenderter Text des Blocks (mehrzeilig erlaubt)
  meta    – optionales dict, nur geschrieben wenn nicht leer

Die Node-Portierung `journal-store.mjs` (Repo-Root) implementiert
`renderMd`/`upsertEntry` mit **identischer** Sortier- und Formatregel, sodass
beide Seiten dieselbe `.md` byte-identisch erzeugen. Wer eine Regel hier
ändert, muss sie dort mitziehen.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

__all__ = [
    "ENTRY_SOURCES",
    "entries_path",
    "normalize_entry",
    "load_entries",
    "dump_entries",
    "render_md",
    "upsert_entry",
    "delete_entry",
    "freetext_body",
]

ENTRY_SOURCES = {"journal", "habit_records", "habit_journals", "freetext", "session_note"}


def entries_path(md_path: Path) -> Path:
    """`.../journal/2026-09-09.md` -> `.../journal/2026-09-09.entries.jsonl`.

    Akzeptiert auch, wenn schon der `.entries.jsonl`-Pfad übergeben wird.
    """
    md_path = Path(md_path)
    if md_path.name.endswith(".entries.jsonl"):
        return md_path
    return md_path.with_suffix(".entries.jsonl")


def md_path_for(jsonl_path: Path) -> Path:
    jsonl_path = Path(jsonl_path)
    if jsonl_path.name.endswith(".entries.jsonl"):
        return jsonl_path.with_name(jsonl_path.name[: -len(".entries.jsonl")] + ".md")
    return jsonl_path.with_suffix(".md")


def normalize_entry(entry: dict[str, Any]) -> dict[str, Any]:
    out: dict[str, Any] = {
        "id": str(entry.get("id") or "").strip(),
        "source": str(entry.get("source") or "freetext").strip(),
        "ts": str(entry.get("ts") or ""),
        "body": str(entry.get("body") if entry.get("body") is not None else ""),
    }
    meta = entry.get("meta")
    if isinstance(meta, dict) and meta:
        out["meta"] = meta
    return out


def _entry_key(entry: dict[str, Any]) -> tuple[str, str, str]:
    return (str(entry.get("ts") or ""), str(entry.get("source") or ""), str(entry.get("id") or ""))


def _identity(entry: dict[str, Any]) -> tuple[str, str]:
    """Eindeutige Identität eines Eintrags: (source, id)."""
    return (str(entry.get("source") or ""), str(entry.get("id") or ""))


def _atomic_write(path: Path, data: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f"{path.name}.tmp.{os.getpid()}")
    tmp.write_text(data, encoding="utf-8")
    os.replace(tmp, path)


def load_entries(jsonl_path: Path) -> list[dict[str, Any]]:
    jsonl_path = entries_path(jsonl_path)
    if not jsonl_path.exists():
        return []
    entries: list[dict[str, Any]] = []
    for line in jsonl_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            obj = json.loads(line)
        except Exception:
            continue
        if isinstance(obj, dict) and obj.get("id"):
            entries.append(normalize_entry(obj))
    return entries


def dump_entries(jsonl_path: Path, entries: list[dict[str, Any]]) -> None:
    """Schreibt die JSONL in Einfüge-Reihenfolge (nicht sortiert — Sortierung
    ist nur eine Render-Angelegenheit). Atomar (tmp + os.replace)."""
    jsonl_path = entries_path(jsonl_path)
    lines = [
        json.dumps(normalize_entry(e), ensure_ascii=False, separators=(",", ":"))
        for e in entries
    ]
    _atomic_write(jsonl_path, ("\n".join(lines) + "\n") if lines else "")


def render_md(entries: list[dict[str, Any]]) -> str:
    """Deterministisch: stabile Sortierung nach (ts, id), ein Block je Eintrag.

    Block =  ``<!-- entry:<id> -->\\n<body ohne trailing \\n>\\n``
    Blöcke werden mit ``\\n`` verbunden -> eine Leerzeile Abstand, Datei endet
    mit ``\\n``. Leere Liste -> "".
    """
    blocks: list[str] = []
    for e in sorted(entries, key=_entry_key):
        body = str(e.get("body") or "").rstrip("\n")
        blocks.append(f"<!-- entry:{e.get('source')}:{e.get('id')} -->\n{body}\n")
    return "\n".join(blocks)


def _render_sidecar(jsonl_path: Path, entries: list[dict[str, Any]]) -> None:
    dump_entries(jsonl_path, entries)
    _atomic_write(md_path_for(jsonl_path), render_md(entries))


def upsert_entry(md_or_jsonl_path: Path, entry: dict[str, Any]) -> bool:
    """Fügt `entry` in die Tages-JSONL ein bzw. ersetzt den Eintrag gleicher
    `id`. Rendert danach die `.md` neu.

    Idempotent: identischer Eintrag (source/ts/body/meta unverändert) -> kein
    Schreibvorgang, Rückgabe ``False``. Sonst ``True``.
    """
    jsonl_path = entries_path(md_or_jsonl_path)
    norm = normalize_entry(entry)
    if not norm["id"]:
        return False
    entries = load_entries(jsonl_path)
    for i, existing in enumerate(entries):
        if _identity(existing) == _identity(norm):
            if existing == norm:
                return False
            entries[i] = norm
            break
    else:
        entries.append(norm)
    _render_sidecar(jsonl_path, entries)
    return True


def delete_entry(md_or_jsonl_path: Path, entry_id: str, source: str | None = None) -> bool:
    """Entfernt Einträge mit `entry_id` (und, wenn angegeben, `source`),
    rendert die `.md` neu. Rückgabe ``True`` wenn etwas entfernt wurde."""
    jsonl_path = entries_path(md_or_jsonl_path)
    entries = load_entries(jsonl_path)
    kept = [
        e for e in entries
        if not (e.get("id") == entry_id and (source is None or e.get("source") == source))
    ]
    if len(kept) == len(entries):
        return False
    _render_sidecar(jsonl_path, kept)
    return True


def freetext_body(md_or_jsonl_path: Path, entry_id: str | None = None) -> str:
    """Body des Freitext-Eintrags (für die editierbare Journal-Textarea).

    Mit `entry_id` genau dieser; sonst der erste Eintrag mit
    ``source == "freetext"``. Leerer String, wenn keiner existiert.
    """
    entries = load_entries(md_or_jsonl_path)
    if entry_id is not None:
        for e in entries:
            if e.get("id") == entry_id:
                return str(e.get("body") or "")
    for e in entries:
        if e.get("source") == "freetext":
            return str(e.get("body") or "")
    return ""
