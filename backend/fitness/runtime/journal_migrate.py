"""Einmal-Migration: `journal/YYYY-MM-DD.md` (Marker-Blöcke + Freitext)
-> `journal/YYYY-MM-DD.entries.jsonl` (die neue SOT).

Idempotent (überspringt Tage, deren `.entries.jsonl` schon existiert) und
nicht-destruktiv: die alte `.md` wird nach `.md.premigration` **verschoben**
(kein Überschreiben, kein Löschen), danach frisch aus der JSONL gerendert.

NICHT automatisch beim Import ausgeführt. Start:

    # Dry-run (zeigt nur, was passieren würde) für die aktive UID:
    python -m fitness.runtime.journal_migrate run

    # tatsächlich migrieren, eine UID:
    python -m fitness.runtime.journal_migrate run --uid <uid> --apply

    # alle Runtime-User + der Legacy-Sammelordner:
    python -m fitness.runtime.journal_migrate run --all-users --apply

    # einzelnes Datum / erneut erzwingen:
    python -m fitness.runtime.journal_migrate run --uid <uid> --date 2026-09-01 --apply --force

Auch erreichbar als `fitness user-data migrate-journal run ...`.
"""

from __future__ import annotations

import re
import shutil
from pathlib import Path
from typing import Optional

import typer
from rich.console import Console
from typing_extensions import Annotated

from fitness.catalog.core.paths import runtime_root
from fitness.runtime.journal_store import dump_entries, entries_path, normalize_entry, render_md
from fitness.runtime.session_store import runtime_users_dir

app = typer.Typer(help="Einmal-Migration journal/*.md -> journal/*.entries.jsonl")
console = Console()


@app.callback()
def _cb() -> None:
    """Kein-Op-Callback: hält die `run`-Subcommand-Struktur auch beim direkten
    `python -m fitness.runtime.journal_migrate run` (Typer würde ein
    Ein-Kommando-App sonst auf argument-los kollabieren)."""

_MARKER_RE = re.compile(r"^<!--\s*(fsid|fshr|fshid|fssn|entry):(.+?)\s*-->\s*$")
_SOURCE_MAP = {
    "fsid": "journal",
    "fshr": "habit_records",
    "fshid": "habit_journals",
    "fssn": "session_note",
}
_KNOWN_SOURCES = {"journal", "habit_records", "habit_journals", "freetext", "session_note"}


def parse_md(text: str, date: str) -> list[dict]:
    """Zerlegt eine Legacy-`.md` in Einträge.

    - Text vor dem ersten Marker (falls nicht nur Whitespace) -> ein
      `freetext-<date>`-Eintrag.
    - Jeder `<!-- fsid|fshr|fshid|fssn:<id> -->`-Block -> ein Eintrag mit
      stabiler id und passender `source`. `ts` wird auf einen Sortier-Sentinel
      (`0000-00-00T00:00:<lfd>`) gesetzt, damit die historische Reihenfolge
      **vor** allen echten (ISO-)Zeitstempeln erhalten bleibt.
    - `<!-- entry:<source>:<id> -->` (neues Renderer-Format) wird zerlegt;
      `<!-- entry:<id> -->` (altes Format eines früheren Migrations-Laufs)
      fällt auf source `journal` bzw. `session_note` bei `session-`-Präfix
      zurück.

    Identität ist `(source, id)` — derselbe Marker-Wert unter `fshr` **und**
    `fshid` sind zwei getrennte Einträge, nicht einer.
    """
    lines = text.split("\n")
    i = 0
    while i < len(lines) and not _MARKER_RE.match(lines[i]):
        i += 1
    lead = "\n".join(lines[:i]).strip("\n").strip()

    entries: list[dict] = []
    if lead:
        entries.append({"id": f"freetext-{date}", "source": "freetext", "ts": "", "body": lead})

    order = 0
    cur: tuple[str, str] | None = None
    body_lines: list[str] = []

    def flush() -> None:
        nonlocal cur, body_lines, order
        if cur is None:
            return
        kind, ident = cur
        body = "\n".join(body_lines).strip("\n")
        if kind == "entry":
            prefix, sep, rest = ident.partition(":")
            if sep and prefix in _KNOWN_SOURCES:  # neues <source>:<id>-Format
                source, ident = prefix, rest
                ts_value = "" if source in ("journal", "freetext") else f"0000-00-00T00:00:{order:05d}"
            else:  # altes <id>-only-Format
                source = "session_note" if ident.startswith("session-") else "journal"
                ts_value = ""
        else:
            source = _SOURCE_MAP[kind]
            ts_value = f"0000-00-00T00:00:{order:05d}"
        entries.append({"id": ident, "source": source, "ts": ts_value, "body": body})
        order += 1
        cur, body_lines = None, []

    for line in lines[i:]:
        m = _MARKER_RE.match(line)
        if m:
            flush()
            cur, body_lines = (m.group(1), m.group(2)), []
        elif cur is not None:
            body_lines.append(line)
    flush()

    # letzter Eintrag je (source, id) gewinnt, Reihenfolge bleibt erhalten
    dedup: dict[tuple[str, str], dict] = {}
    for e in entries:
        dedup[(e["source"], e["id"])] = e
    return list(dedup.values())


def migrate_file(md_path: Path, *, apply: bool, force: bool) -> str:
    date = md_path.stem
    jsonl = entries_path(md_path)
    if jsonl.exists() and not force:
        return "skip (entries.jsonl existiert)"

    pre = md_path.with_name(md_path.name + ".premigration")
    source_text_path = pre if (pre.exists() and apply) else md_path
    if not source_text_path.exists():
        return "skip (keine .md)"
    text = source_text_path.read_text(encoding="utf-8")
    if not text.strip():
        return "skip (leer)"
    if "<!-- entry:" in text and "<!-- fsid:" not in text and "<!-- fshr:" not in text \
       and "<!-- fshid:" not in text and not force:
        return "skip (bereits gerendert; --force zum Erzwingen)"

    entries = [normalize_entry(e) for e in parse_md(text, date)]
    if not apply:
        srcs = ", ".join(sorted({e["source"] for e in entries})) or "—"
        return f"DRY-RUN: {len(entries)} Einträge ({srcs})"

    if not pre.exists():
        shutil.move(str(md_path), str(pre))
    dump_entries(jsonl, entries)
    md_path.write_text(render_md(entries), encoding="utf-8")
    return f"migriert: {len(entries)} Einträge -> {jsonl.name} (+ {pre.name})"


def _journal_dirs(uid: Optional[str], all_users: bool) -> list[Path]:
    users = runtime_users_dir()
    dirs: list[Path] = []
    if all_users:
        if users.exists():
            dirs += [p / "journal" for p in sorted(users.iterdir()) if p.is_dir()]
        legacy = runtime_root() / "journal"
        if legacy.exists():
            dirs.append(legacy)
        return dirs
    if uid:
        return [users / uid / "journal"]
    active = Path.home() / ".aos" / "users" / ".active-uid"
    if active.exists() and active.read_text().strip():
        return [users / active.read_text().strip() / "journal"]
    raise typer.BadParameter("weder --uid noch --all-users, und keine ~/.aos/users/.active-uid gefunden")


@app.command()
def run(
    uid: Annotated[Optional[str], typer.Option(help="Runtime user id / Firebase uid")] = None,
    date: Annotated[Optional[str], typer.Option(help="Nur dieses eine Datum (YYYY-MM-DD)")] = None,
    all_users: Annotated[bool, typer.Option("--all-users", help="Alle Runtime-User + Legacy-Sammelordner")] = False,
    apply: Annotated[bool, typer.Option("--apply", help="Tatsächlich schreiben. Default ist Dry-run.")] = False,
    force: Annotated[bool, typer.Option("--force", help="Auch Tage mit vorhandener entries.jsonl / bereits gerenderte .md neu erzeugen")] = False,
):
    """Migriert die betroffenen `journal/*.md`. Ohne --apply nur Vorschau."""
    total = 0
    for jdir in _journal_dirs(uid, all_users):
        if not jdir.exists():
            console.print(f"[dim]{jdir} — nicht vorhanden, übersprungen[/dim]")
            continue
        files = [jdir / f"{date}.md"] if date else sorted(jdir.glob("*.md"))
        for md_path in files:
            if not md_path.exists():
                continue
            total += 1
            console.print(f"{md_path}: {migrate_file(md_path, apply=apply, force=force)}")
    console.print(f"[bold]{'APPLY' if apply else 'DRY-RUN'}[/bold] — {total} .md-Datei(en) betrachtet")


if __name__ == "__main__":
    app()
