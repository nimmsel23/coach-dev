"""
Fitness Agent TUI — Rich-basierte interaktive Terminal-UI
"""
from __future__ import annotations

import sys
import json
import yaml
import os
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

if __package__ in {None, ""}:
    package_root = Path(__file__).resolve().parent.parent
    if str(package_root) not in sys.path:
        sys.path.insert(0, str(package_root))
    __package__ = "catalog"

from rich import box
from rich.columns import Columns
from rich.console import Console
from rich.panel import Panel
from rich.prompt import Confirm, Prompt
from rich.table import Table
from rich.text import Text

from fitness.catalog.core.paths import DATA_DIR, runtime_root
from fitness.catalog.core.rich_utils import console
from fitness.catalog.core.yaml_utils import load_yaml


# ─── Layout helpers ────────────────────────────────────────────────────────

_LOGO = "[bold green]FITNESS AGENT[/bold green]"


def _header(screen: str, sub: str = "") -> None:
    console.clear()
    line = Text()
    line.append("  ◆ ", style="bold green")
    line.append("FITNESS AGENT", style="bold white")
    line.append("  /  ", style="dim")
    line.append(screen, style="bold cyan")
    if sub:
        line.append(f"  —  {sub}", style="dim")
    console.print(line)
    console.print("─" * min(console.width, 80), style="dim green")
    console.print()


def _nav(**items: str) -> None:
    parts = [f"[bold green]{k}[/bold green] [dim]{v}[/dim]" for k, v in items.items()]
    console.print("  " + "   ".join(parts))
    console.print()


def _pause() -> None:
    try:
        Prompt.ask("  [dim]↵ weiter[/dim]", default="")
    except (EOFError, KeyboardInterrupt):
        pass


# ─── Dashboard ─────────────────────────────────────────────────────────────

def screen_dashboard() -> str:
    _header("Dashboard")

    # Exercise index stats
    try:
        from fitness.catalog.core.resolver import build_exercise_index
        idx = build_exercise_index()
        by_source: dict[str, int] = {}
        for ex in idx:
            s = getattr(ex, "source", None) or "unknown"
            by_source[s] = by_source.get(s, 0) + 1

        t = Table(box=box.SIMPLE, show_header=True, header_style="bold green",
                  title="Exercise Index", title_style="bold")
        t.add_column("Quelle", style="bold")
        t.add_column("Exercises", justify="right")
        for src, cnt in sorted(by_source.items(), key=lambda x: -x[1]):
            t.add_row(src, str(cnt))
        t.add_row("[dim]Total[/dim]", f"[bold]{len(idx)}[/bold]")
        console.print(t)
    except Exception as exc:
        console.print(f"[red]Index-Fehler: {exc}[/red]")

    # Inbox status — scannt exercises/, exercises/inbox/ UND inbox/ (Fallback,
    # falls irgendein Schreiber weiterhin an einen anderen Ort abgelegt hat)
    unreviewed = _find_inbox_files()
    # Pro-User-Runtime-Inbox (~/.aos/fitness/users/<uid>/inbox/*.json) - vorher
    # hartcodiert auf einen einzigen User ("default"), jetzt ueber alle User.
    pending_jsons = list((runtime_root() / "users").glob("*/inbox/*.json"))

    if unreviewed or pending_jsons:
        t2 = Table(box=box.SIMPLE, show_header=False, title="Inbox", title_style="bold yellow")
        t2.add_column("State", style="yellow")
        t2.add_column("", justify="right")
        if pending_jsons:
            t2.add_row("new  (warten auf Gemini)", str(len(pending_jsons)))
        if unreviewed:
            t2.add_row("unreviewed  (warten auf Review)", f"[bold yellow]{len(unreviewed)}[/bold yellow]")
        console.print(t2)
    else:
        console.print(Panel("[green]Inbox leer[/green]", title="Inbox", border_style="dim"))

    console.print()
    _nav(**{"1": "Inbox", "2": "Browser", "3": "Plan", "4": "Lesson", "5": "History", "q": "Quit"})

    choice = Prompt.ask("  [bold]>[/bold]", choices=["1", "2", "3", "4", "5", "q"], default="q")
    return {"1": "inbox", "2": "browser", "3": "plan", "4": "lesson", "5": "history", "q": "quit"}[choice]


# ─── Inbox ─────────────────────────────────────────────────────────────────

def _inbox_dirs() -> list[Path]:
    """Kandidaten-Ordner fuer Inbox-Drafts, in dieser Reihenfolge geprueft:
    kb/exercises/, kb/exercises/inbox/, kb/inbox/ — mehrere Schreiber im
    Code haben ueber Zeit an unterschiedliche Orte geschrieben, hier robust
    alle drei abdecken statt sich auf einen einzigen zu verlassen."""
    return [DATA_DIR / "exercises", DATA_DIR / "exercises" / "inbox", DATA_DIR / "inbox"]


def _find_inbox_files() -> list[Path]:
    files: list[Path] = []
    for d in _inbox_dirs():
        files.extend(d.glob("inbox_*.yml"))
    return files


def _fmt_dt(value: str | None) -> str:
    if not value:
        return ""
    text = str(value)
    if "." in text:
        text = text.split(".", 1)[0]
    return text.replace("T", " ").replace("+00:00", "Z")


def _file_mtime(f: Path) -> str:
    try:
        return datetime.fromtimestamp(f.stat().st_mtime, tz=timezone.utc).astimezone().isoformat(timespec="seconds")
    except OSError:
        return ""


def _metadata_value(doc: dict, ex: dict, key: str) -> str:
    return str(ex.get(key) or doc.get(key) or "")


def _source_ref_summary(ex: dict) -> str:
    refs: list[str] = []
    if ex.get("wger_id"):
        refs.append(f"wger:{ex['wger_id']}")
    if ex.get("yuhonas_id"):
        refs.append(f"yuhonas:{ex['yuhonas_id']}")
    external = ex.get("external_ids")
    if isinstance(external, dict):
        for source, values in external.items():
            if isinstance(values, list):
                refs.extend(f"{source}:{value}" for value in values)
            elif values:
                refs.append(f"{source}:{values}")
    return ", ".join(str(ref) for ref in refs)


def _role_counts(ex: dict) -> str:
    return " / ".join(
        f"{label}:{len(ex.get(field) or [])}"
        for label, field in [
            ("P", "primary_muscles"),
            ("S", "secondary_muscles"),
            ("Stab", "stabilizers"),
        ]
    )


def _review_flags(f: Path, doc: dict, ex: dict) -> list[str]:
    flags: list[str] = []
    ex_id = str(ex.get("exercise_id") or ex.get("id") or f.stem)
    if ex_id.startswith(("wger_", "yuhonas_")):
        flags.append("raw external id")
    muscles = [
        str(item)
        for field in ("primary_muscles", "secondary_muscles", "stabilizers")
        for item in (ex.get(field) or [])
    ]
    bucket_like = [m for m in muscles if m and not m[:1].isdigit()]
    if bucket_like:
        flags.append("bucket muscles")
    if "Proactively generated" in str(doc.get("description") or ""):
        flags.append("proactive draft")
    try:
        from fitness.catalog.agent.inbox_actions import is_inbox_tombstoned
        if is_inbox_tombstoned(f, ex):
            flags.append("tombstoned")
    except Exception:
        pass
    return flags


def screen_inbox() -> str:
    files = sorted(_find_inbox_files())

    _header("Inbox", f"{len(files)} unreviewed")

    if not files:
        console.print(Panel("[green]Inbox leer — nichts zu reviewen.[/green]", border_style="dim"))
        console.print()
        _nav(**{"g": "Graveyard", "b": "zurück"})
        choice = Prompt.ask("  [bold]>[/bold]", choices=["g", "b"], default="b")
        return "graveyard" if choice == "g" else "dashboard"

    t = Table(box=box.SIMPLE, show_header=True, header_style="bold")
    t.add_column("#", style="dim", width=4)
    t.add_column("Datei", style="cyan", no_wrap=True)
    t.add_column("Name")
    t.add_column("Alter", style="dim")
    t.add_column("Quelle", style="dim")
    t.add_column("Muskeln", style="dim")
    t.add_column("Flags", style="yellow")

    items: list[tuple[Path, str]] = []
    for i, f in enumerate(files, 1):
        try:
            doc = load_yaml(f)
            ex = (doc.get("exercises") or [{}])[0]
            name = ex.get("display_name") or ex.get("german") or ex.get("name") or ""
            muscles = ", ".join((ex.get("primary_muscles") or [])[:3])
            created = _metadata_value(doc, ex, "enriched_at") or _metadata_value(doc, ex, "generated_at") or _file_mtime(f)
            source = _source_ref_summary(ex) or str(ex.get("source") or "")
            flags = ", ".join(_review_flags(f, doc, ex))
        except Exception:
            name = ""
            muscles = ""
            created = ""
            source = ""
            flags = "load error"
        label = f.stem.replace("inbox_", "").replace("_", " ")
        items.append((f, label))
        t.add_row(str(i), f.stem, name or label, _fmt_dt(created), source, muscles, flags)

    console.print(t)
    console.print()
    _nav(**{f"1–{len(items)}": "Detail öffnen", "g": "Graveyard", "b": "zurück"})

    choices = [str(i) for i in range(1, len(items) + 1)] + ["g", "b"]
    choice = Prompt.ask("  [bold]>[/bold]", choices=choices, default="b")

    if choice == "b":
        return "dashboard"
    if choice == "g":
        return "graveyard"

    return _inbox_detail(files[int(choice) - 1])


_EDITABLE_SCALAR_FIELDS = ["display_name", "german", "english", "category", "movement_pattern", "type"]
_EDITABLE_LIST_FIELDS = ["primary_muscles", "secondary_muscles", "stabilizers", "coaching_notes", "common_errors", "aliases"]


def _save_exercise_to_file(f: Path, ex: dict[str, Any]) -> None:
    """Schreibt eine bearbeitete Uebung zurueck in ihre Datei — findet den
    passenden Eintrag in `doc["exercises"]` per exercise_id (Dateien koennen
    mehrere Eintraege enthalten, z.B. unreviewed_*.yml), ersetzt NUR den,
    Rest der Datei bleibt unangetastet. .bak vorher (Repo-Konvention)."""
    doc = load_yaml(f)
    exercises = doc.get("exercises") or []
    ex_id = ex.get("exercise_id") or ex.get("id")
    replaced = False
    for i, entry in enumerate(exercises):
        if isinstance(entry, dict) and (entry.get("exercise_id") or entry.get("id")) == ex_id:
            exercises[i] = ex
            replaced = True
            break
    if not replaced:
        exercises.append(ex)
    doc["exercises"] = exercises
    f.with_suffix(".yml.bak").write_text(f.read_text(encoding="utf-8"), encoding="utf-8")
    f.write_text(yaml.safe_dump(doc, allow_unicode=True, sort_keys=False), encoding="utf-8")


def _edit_list_field(ex: dict[str, Any], field: str) -> None:
    items = list(ex.get(field) or [])
    while True:
        _header("Feld bearbeiten", field)
        if items:
            for i, item in enumerate(items, 1):
                console.print(f"  [dim]{i:2}[/dim]  {item}")
        else:
            console.print("  [dim](leer)[/dim]")
        console.print()
        _nav(**{"a": "hinzufuegen", "1-n": "loeschen (Nummer)", "b": "fertig"})
        choice = Prompt.ask("  [bold]>[/bold]", default="b")
        if choice == "b":
            break
        if choice == "a":
            new_item = Prompt.ask("  neuer Eintrag")
            if new_item.strip():
                items.append(new_item.strip())
            continue
        if choice.isdigit() and 1 <= int(choice) <= len(items):
            removed = items.pop(int(choice) - 1)
            console.print(f"  [yellow]entfernt:[/yellow] {removed}")
    ex[field] = items


def _edit_exercise_interactive(f: Path, ex: dict[str, Any]) -> dict[str, Any]:
    """Strukturierter Feld-Editor (Rich Prompt-Menue) — Ergaenzung zum
    reinen `$EDITOR`-Aufruf: fuer schnelle, gezielte Aenderungen an einzelnen
    Feldern statt der ganzen Rohdatei. Funktioniert identisch fuer Inbox-
    Drafts UND Expert-Exercises (kb/exercises/*.yml), da beide dieselbe
    {name, description, exercises:[...]}-Wrapper-Struktur nutzen."""
    ex = dict(ex)
    while True:
        _header("Bearbeiten", ex.get("display_name") or ex.get("exercise_id") or f.stem)
        table = Table(box=box.SIMPLE, show_header=False)
        table.add_column("Nr", style="dim", width=4)
        table.add_column("Feld", style="cyan")
        table.add_column("Wert", style="bold")
        options: dict[str, str] = {}
        n = 1
        for field in _EDITABLE_SCALAR_FIELDS:
            table.add_row(str(n), field, str(ex.get(field) or ""))
            options[str(n)] = field
            n += 1
        for field in _EDITABLE_LIST_FIELDS:
            val = ex.get(field) or []
            table.add_row(str(n), field, f"[dim]{len(val)} Eintraege[/dim]")
            options[str(n)] = field
            n += 1
        console.print(table)
        console.print()
        _nav(**{f"1-{n - 1}": "Feld waehlen", "s": "speichern", "q": "verwerfen"})
        choice = Prompt.ask("  [bold]>[/bold]", default="q")
        if choice == "q":
            return {}
        if choice == "s":
            _save_exercise_to_file(f, ex)
            console.print(f"  [green]✓ Gespeichert:[/green] {f.name}")
            _pause()
            return ex
        field = options.get(choice)
        if not field:
            continue
        if field in _EDITABLE_LIST_FIELDS:
            _edit_list_field(ex, field)
        else:
            current = str(ex.get(field) or "")
            new_value = Prompt.ask(f"  {field}", default=current)
            if new_value != current:
                ex[field] = new_value


def _inbox_detail(f: Path) -> str:
    _header("Inbox Detail", f.stem)

    try:
        doc = load_yaml(f)
        ex = (doc.get("exercises") or [{}])[0]
    except Exception as exc:
        console.print(f"[red]Ladefehler: {exc}[/red]")
        _pause()
        return "inbox"

    name = ex.get("display_name") or ex.get("german") or ex.get("name") or f.stem

    # Main fields
    scalar_fields = ["exercise_id", "category", "type", "movement_pattern", "source"]
    list_fields = ["equipment", "movements", "primary_muscles", "secondary_muscles", "stabilizers"]

    meta_lines = [
        f"[dim]{'file':22}[/dim] {f}",
        f"[dim]{'file_mtime':22}[/dim] {_fmt_dt(_file_mtime(f))}",
    ]
    for key in ["generated_at", "enriched_at", "approved_at", "queued_at"]:
        val = _metadata_value(doc, ex, key)
        if val:
            meta_lines.append(f"[dim]{key:22}[/dim] {_fmt_dt(val)}")
    source_refs = _source_ref_summary(ex)
    if source_refs:
        meta_lines.append(f"[dim]{'source_refs':22}[/dim] {source_refs}")
    flags = _review_flags(f, doc, ex)
    if flags:
        meta_lines.append(f"[dim]{'review_flags':22}[/dim] [yellow]{', '.join(flags)}[/yellow]")
    if doc.get("description"):
        meta_lines.append(f"[dim]{'description':22}[/dim] {doc['description']}")

    console.print(Panel(
        "\n".join(meta_lines),
        title="Draft Metadata",
        border_style="yellow dim" if flags else "dim",
    ))

    lines = [f"[dim]{'role_counts':22}[/dim] {_role_counts(ex)}"]
    for field in scalar_fields:
        val = ex.get(field)
        if val:
            lines.append(f"[dim]{field:22}[/dim] [bold]{val}[/bold]")
    for field in list_fields:
        val = ex.get(field)
        if val and isinstance(val, list):
            lines.append(f"[dim]{field:22}[/dim] {', '.join(str(v) for v in val)}")

    console.print(Panel(
        "\n".join(lines) if lines else "[dim]keine Felder[/dim]",
        title=f"[bold cyan]{name}[/bold cyan]",
        border_style="cyan",
    ))

    for field, title in [("aliases", "Aliases"), ("search_aliases", "Search Aliases")]:
        val = ex.get(field)
        if val and isinstance(val, list):
            console.print(Panel(
                "\n".join(f"• {item}" for item in val),
                title=title,
                border_style="magenta dim" if field == "search_aliases" else "blue dim",
            ))

    if ex.get("coaching_notes"):
        console.print(Panel(
            "\n".join(f"• {n}" for n in ex["coaching_notes"]),
            title="Coaching Notes", border_style="green dim",
        ))

    if ex.get("common_errors"):
        console.print(Panel(
            "\n".join(f"• {e}" for e in ex["common_errors"]),
            title="Common Errors", border_style="red dim",
        ))

    console.print()
    _nav(**{"a": "Approve → expert", "e": "Bearbeiten (Felder)", "x": "Bearbeiten ($EDITOR, Rohdatei)", "r": "Neu anreichern (Gemini)", "f": "Feedback geben", "c": "Agent Chat", "d": "Löschen", "b": "zurück"})
    choice = Prompt.ask("  [bold]>[/bold]", choices=["a", "e", "x", "r", "f", "c", "d", "b"], default="b")

    if choice == "a":
        _approve(f, ex)
    elif choice == "e":
        _edit_exercise_interactive(f, ex)
        return _inbox_detail(f)
    elif choice == "x":
        editor = os.environ.get("EDITOR", "nano")
        subprocess.call([editor, str(f)])
        return _inbox_detail(f)
    elif choice == "r":
        _reenrich(f, ex, name)
        return _inbox_detail(f)
    elif choice == "f":
        _feedback_reenrich(f, ex, name)
        return _inbox_detail(f)
    elif choice == "c":
        _exercise_agent_chat(context_title=f"Inbox Draft {f.stem}", source=str(f), exercise=ex)
        return _inbox_detail(f)
    elif choice == "d":
        if Confirm.ask(f"  [red]Wirklich löschen: {f.name}?[/red]"):
            from fitness.catalog.agent.inbox_actions import delete_inbox_entry
            delete_inbox_entry(f, ex)
            console.print(f"  [green]✓ Gelöscht[/green]")
            _pause()

    return "inbox"


def _reenrich(f: Path, ex: dict, name: str, feedback: str | None = None) -> None:
    """Jagt einen bestehenden Inbox-Draft nochmal frisch durch Gemini (+ Haiku-
    Gegenpruefung) — Interactive-Wrapper um reenrich_inbox_entry() aus
    agent/inbox_actions.py (dort liegt die geteilte Logik mit der CLI).
    """
    from fitness.catalog.agent.inbox_actions import reenrich_inbox_entry

    prompt_label = "Mit Feedback neu anreichern" if feedback else "Bestehenden Draft ueberschreiben und neu anreichern"
    if not Confirm.ask(f"  [yellow]{prompt_label}: {name}?[/yellow]"):
        return

    console.print("  [dim]Frage Gemini an…[/dim]")
    try:
        result = reenrich_inbox_entry(f, ex, name, feedback=feedback)
    except RuntimeError as exc:
        console.print(f"  [red]{exc} — Draft unveraendert.[/red]")
        _pause()
        return

    review_provider = result.get("review_provider")
    if review_provider:
        console.print(f"  [green]✓ {str(review_provider).capitalize()}-Review angewendet[/green]")
    else:
        console.print("  [dim]Haiku/Codex-Review nicht verfuegbar — behalte Gemini-Ergebnis[/dim]")

    console.print(f"  [green]✓ Neu angereichert: {f.name}[/green]")
    _pause()


def _feedback_reenrich(f: Path, ex: dict, name: str) -> None:
    """Fragt den Coach nach freiem Text-Feedback zum Draft (z.B. "bequem und
    Polster passen mir nicht") und schickt es direkt an Gemini, statt die
    Formulierung manuell im Editor zu aendern.
    """
    console.print()
    feedback = Prompt.ask("  [bold]Was stoert dich am aktuellen Entwurf?[/bold]")
    if not feedback.strip():
        console.print("  [dim]Kein Feedback eingegeben — abgebrochen.[/dim]")
        _pause()
        return
    _reenrich(f, ex, name, feedback=feedback.strip())


def _approve(f: Path, ex: dict) -> None:
    from fitness.catalog.agent.inbox_actions import approve_inbox_entry

    try:
        ex_id = approve_inbox_entry(f, ex)
    except ValueError as exc:
        console.print(f"  [red]Fehler: {exc}[/red]")
        _pause()
        return

    console.print(f"  [green]✓ Approved → {ex_id}.yml[/green]")
    _pause()


def _exercise_agent_chat(*, context_title: str, source: str, exercise: Any) -> None:
    from fitness.catalog.agent.chat import call_exercise_agent_chat, exercise_to_chat_dict

    history: list[tuple[str, str]] = []
    ex_doc = exercise_to_chat_dict(exercise)
    while True:
        _header("Agent Chat", context_title)
        if history:
            for question, answer in history[-4:]:
                console.print(Panel(Text(question), title="Coach", border_style="green dim"))
                console.print(Panel(Text(answer), title="Agent", border_style="cyan dim"))
        console.print("[dim]Leer, q oder b beendet den Chat. Der Chat speichert nichts.[/dim]")
        try:
            question = Prompt.ask("  [bold]Frage[/bold]", default="")
        except (EOFError, KeyboardInterrupt):
            return
        if not question.strip() or question.strip().casefold() in {"q", "b", "back", "zurück", "zurueck"}:
            return
        console.print("  [dim]Frage lokalen Agenten an...[/dim]")
        try:
            result = call_exercise_agent_chat(
                context_title=context_title,
                source=source,
                exercise=ex_doc,
                question=question.strip(),
                history=history,
            )
        except RuntimeError as exc:
            console.print(f"  [red]{exc}[/red]")
            _pause()
            return
        history.append((question.strip(), result.response))
        console.print(Panel(Text(result.response), title=f"Agent ({result.provider})", border_style="cyan"))
        _pause()


# ─── Graveyard ─────────────────────────────────────────────────────────────

def _graveyard_runtime_hits(entry: dict[str, Any]) -> list[str]:
    keys = {str(entry.get("exercise_id") or "")}
    keys.update(str(key).removeprefix("wger:") for key in entry.get("keys", []) or [])
    keys = {key for key in keys if key and not key.startswith("name:")}
    hits: list[str] = []

    users_dir = runtime_root() / "users"
    if not users_dir.exists():
        return hits
    for session_file in users_dir.glob("*/sessions/*.json"):
        try:
            data = json.loads(session_file.read_text(encoding="utf-8"))
        except Exception:
            continue
        for ex in data.get("exercises", []) or []:
            if not isinstance(ex, dict):
                continue
            ex_id = str(ex.get("id") or ex.get("exercise_id") or "")
            if ex_id in keys:
                user_id = session_file.parent.parent.name
                hits.append(f"{session_file.stem} / {user_id[:8]} / {ex.get('name') or ex_id}")
                break
    return hits


def screen_graveyard() -> str:
    from fitness.catalog.agent.inbox_actions import list_inbox_tombstones

    entries = list_inbox_tombstones()
    _header("Graveyard", f"{len(entries)} tombstoned")

    if not entries:
        console.print(Panel("[green]Graveyard leer — keine verworfenen Inbox-Drafts.[/green]", border_style="dim"))
        console.print()
        _nav(**{"b": "zurück"})
        Prompt.ask("  [bold]>[/bold]", choices=["b"], default="b")
        return "dashboard"

    t = Table(box=box.SIMPLE, show_header=True, header_style="bold")
    t.add_column("#", style="dim", width=4)
    t.add_column("ID", style="cyan", no_wrap=True)
    t.add_column("Name")
    t.add_column("Datum", style="dim")
    t.add_column("Runtime", justify="right", style="yellow")
    t.add_column("Grund", style="dim")

    for i, entry in enumerate(entries, 1):
        hits = _graveyard_runtime_hits(entry)
        t.add_row(
            str(i),
            str(entry.get("id") or ""),
            str(entry.get("display_name") or entry.get("exercise_id") or ""),
            _fmt_dt(str(entry.get("created_at") or "")),
            str(len(hits)),
            str(entry.get("reason") or ""),
        )

    console.print(t)
    console.print()
    _nav(**{f"1–{len(entries)}": "Detail öffnen", "b": "zurück"})
    choices = [str(i) for i in range(1, len(entries) + 1)] + ["b"]
    choice = Prompt.ask("  [bold]>[/bold]", choices=choices, default="b")
    if choice == "b":
        return "dashboard"
    return _graveyard_detail(entries[int(choice) - 1])


def _graveyard_detail(entry: dict[str, Any]) -> str:
    _header("Graveyard Detail", str(entry.get("id") or ""))

    lines = [
        f"[dim]{'id':22}[/dim] [bold]{entry.get('id') or ''}[/bold]",
        f"[dim]{'exercise_id':22}[/dim] {entry.get('exercise_id') or ''}",
        f"[dim]{'display_name':22}[/dim] {entry.get('display_name') or ''}",
        f"[dim]{'reason':22}[/dim] {entry.get('reason') or ''}",
        f"[dim]{'created_at':22}[/dim] {_fmt_dt(str(entry.get('created_at') or ''))}",
    ]
    console.print(Panel("\n".join(lines), title="Tombstone", border_style="red dim"))

    keys = entry.get("keys") or []
    if keys:
        console.print(Panel("\n".join(f"• {key}" for key in keys), title="Suppression Keys", border_style="yellow dim"))

    hits = _graveyard_runtime_hits(entry)
    if hits:
        console.print(Panel("\n".join(f"• {hit}" for hit in hits), title="Runtime Session Hits", border_style="green dim"))
    else:
        console.print(Panel("[dim]Keine Runtime-Session-Hits gefunden.[/dim]", title="Runtime Session Hits", border_style="dim"))

    console.print()
    _nav(**{"r": "Restore → Inbox", "b": "zurück"})
    choice = Prompt.ask("  [bold]>[/bold]", choices=["r", "b"], default="b")
    if choice == "r":
        from fitness.catalog.agent.inbox_actions import restore_inbox_tombstone
        if Confirm.ask(f"  [yellow]Tombstone wieder in Inbox herstellen: {entry.get('id')}?[/yellow]"):
            try:
                target = restore_inbox_tombstone(str(entry.get("id") or ""))
            except Exception as exc:
                console.print(f"  [red]Restore fehlgeschlagen: {exc}[/red]")
            else:
                console.print(f"  [green]✓ Wiederhergestellt: {target.name}[/green]")
            _pause()
    return "graveyard"


# ─── Browser ───────────────────────────────────────────────────────────────

def screen_browser() -> str:
    _header("Browser", "Suche im Exercise Index")
    query = Prompt.ask("  [bold]Suche[/bold]", default="")
    if not query.strip():
        return "dashboard"

    _header("Browser", f"'{query}'")

    try:
        from fitness.catalog.core.resolver import build_exercise_index, candidate_texts, normalize_text
        idx = build_exercise_index()
        q = normalize_text(query)
        results = [ex for ex in idx if any(q in normalize_text(t) for t in candidate_texts(ex))]

        displayed = results[:25]
        if not displayed:
            console.print(f"  [yellow]Keine Treffer für '{query}'[/yellow]")
        else:
            t = Table(box=box.SIMPLE, show_header=True, header_style="bold")
            t.add_column("#", width=4, style="dim")
            t.add_column("ID", style="cyan")
            t.add_column("Name", style="bold")
            t.add_column("Source", style="dim")
            t.add_column("Primary", style="dim")

            for i, ex in enumerate(displayed, 1):
                muscles = ", ".join((ex.primary_muscles or [])[:2])
                t.add_row(str(i), ex.exercise_id, ex.display_name or "", ex.source or "", muscles)

            console.print(t)
            if len(results) > 25:
                console.print(f"  [dim]... {len(results) - 25} weitere[/dim]")

            console.print()
            _nav(**{f"1–{len(displayed)}": "Detail öffnen", "s": "neue Suche", "b": "zurück"})
            choices = [str(i) for i in range(1, len(displayed) + 1)] + ["s", "b"]
            choice = Prompt.ask("  [bold]>[/bold]", choices=choices, default="b")
            if choice.isdigit():
                _browser_detail(displayed[int(choice) - 1])
                return "browser"
            return "browser" if choice == "s" else "dashboard"
    except Exception as exc:
        console.print(f"  [red]Fehler: {exc}[/red]")

    console.print()
    _nav(**{"s": "neue Suche", "b": "zurück"})
    choice = Prompt.ask("  [bold]>[/bold]", choices=["s", "b"], default="b")
    return "browser" if choice == "s" else "dashboard"


def _browser_detail(ex: Any) -> None:
    _header("Browser Detail", getattr(ex, "exercise_id", ""))
    lines = [
        f"[dim]{'exercise_id':22}[/dim] [bold]{getattr(ex, 'exercise_id', '')}[/bold]",
        f"[dim]{'display_name':22}[/dim] {getattr(ex, 'display_name', '')}",
        f"[dim]{'source':22}[/dim] {getattr(ex, 'source', '')}",
        f"[dim]{'source_file':22}[/dim] {getattr(ex, 'source_file', '')}",
        f"[dim]{'german':22}[/dim] {getattr(ex, 'german', '')}",
        f"[dim]{'english':22}[/dim] {getattr(ex, 'english', '')}",
        f"[dim]{'category':22}[/dim] {getattr(ex, 'category', '')}",
        f"[dim]{'movement_pattern':22}[/dim] {getattr(ex, 'movement_pattern', '')}",
        f"[dim]{'movements':22}[/dim] {', '.join(getattr(ex, 'movements', []) or [])}",
        f"[dim]{'equipment':22}[/dim] {', '.join(getattr(ex, 'equipment', []) or [])}",
        f"[dim]{'primary_muscles':22}[/dim] {', '.join(getattr(ex, 'primary_muscles', []) or [])}",
        f"[dim]{'secondary_muscles':22}[/dim] {', '.join(getattr(ex, 'secondary_muscles', []) or [])}",
        f"[dim]{'stabilizers':22}[/dim] {', '.join(getattr(ex, 'stabilizers', []) or [])}",
    ]
    console.print(Panel("\n".join(lines), title=getattr(ex, "display_name", "") or "Exercise", border_style="cyan"))

    notes = getattr(ex, "coaching_notes", []) or []
    if notes:
        console.print(Panel("\n".join(f"• {note}" for note in notes), title="Coaching Notes", border_style="green dim"))

    errors = getattr(ex, "common_errors", []) or []
    if errors:
        console.print(Panel("\n".join(f"• {error}" for error in errors), title="Common Errors", border_style="red dim"))

    source_file = getattr(ex, "source_file", "") or ""
    nav_opts = {"c": "Agent Chat", "b": "zurück"}
    if source_file:
        nav_opts = {"e": "Bearbeiten (Felder)", **nav_opts}
    _nav(**nav_opts)
    choice = Prompt.ask("  [bold]>[/bold]", choices=list(nav_opts.keys()), default="b")
    if choice == "c":
        _exercise_agent_chat(
            context_title=f"Catalog Exercise {getattr(ex, 'exercise_id', '')}",
            source=str(source_file),
            exercise=ex,
        )
    elif choice == "e" and source_file:
        # source_file ist nur der Dateiname (z.B. "jefferson_curl.yml") —
        # relativ zu kb/exercises/, wie in build_exercise_index() gesetzt.
        target = DATA_DIR / "exercises" / source_file
        if not target.exists():
            console.print(f"  [red]Datei nicht gefunden: {target}[/red]")
            _pause()
            return
        ex_dict = {
            field: getattr(ex, field, None)
            for field in ["exercise_id", "id", *_EDITABLE_SCALAR_FIELDS, *_EDITABLE_LIST_FIELDS]
            if getattr(ex, field, None) not in (None, "", [])
        }
        _edit_exercise_interactive(target, ex_dict)


# ─── Plan ──────────────────────────────────────────────────────────────────

def screen_plan() -> str:
    _header("Plan Generator", "Regel-basierter Trainingsplan")

    template = Prompt.ask("  [bold]Template[/bold]", default="push_day")
    goal = Prompt.ask("  [bold]Goal[/bold]", default="hypertrophy")

    _header("Plan", f"{template} / {goal}")

    try:
        from fitness.catalog.planner import build_plan
        result = build_plan(template=template, goal=goal)
        blocks = result.blocks if hasattr(result, "blocks") else []

        if not blocks:
            console.print(yaml.dump(result.__dict__, allow_unicode=True, sort_keys=False))
        else:
            for block in blocks:
                t = Table(title=block.get("name", "Block"), box=box.SIMPLE, show_header=True)
                t.add_column("Exercise", style="bold")
                t.add_column("Sets", justify="right")
                t.add_column("Reps", justify="right")
                t.add_column("Hinweis", style="dim")
                for ex in block.get("exercises", []):
                    t.add_row(
                        ex.get("display_name", ex.get("exercise_id", "")),
                        str(ex.get("sets", "")),
                        str(ex.get("reps", "")),
                        ex.get("note", ""),
                    )
                console.print(t)
    except Exception as exc:
        console.print(f"  [red]Fehler: {exc}[/red]")

    console.print()
    _nav(**{"p": "neuer Plan", "b": "zurück"})
    choice = Prompt.ask("  [bold]>[/bold]", choices=["p", "b"], default="b")
    return "plan" if choice == "p" else "dashboard"


# ─── Lesson ────────────────────────────────────────────────────────────────

def screen_lesson() -> str:
    _header("Anatomy Lesson", "Lerneinheit")
    exercise_id = Prompt.ask("  [bold]Exercise ID[/bold]", default="")
    if not exercise_id.strip():
        return "dashboard"

    _header("Lesson", exercise_id)

    try:
        from fitness.catalog.agent.teaching import teach_exercise
        from fitness.catalog.preview import render_markdown
        output = teach_exercise(exercise_id)
        render_markdown(output)
    except Exception as exc:
        console.print(f"  [red]Fehler: {exc}[/red]")

    console.print()
    _nav(**{"l": "neue Lesson", "b": "zurück"})
    choice = Prompt.ask("  [bold]>[/bold]", choices=["l", "b"], default="b")
    return "lesson" if choice == "l" else "dashboard"


# ─── History ───────────────────────────────────────────────────────────────

def screen_history() -> str:
    _header("Training History", "Letzte Einträge")
    exercise = Prompt.ask("  [bold]Exercise[/bold]", default="")
    if not exercise.strip():
        return "dashboard"

    _header("History", exercise)

    try:
        from fitness.catalog.history import read_history
        entries = read_history(exercise, limit=15)

        if not entries:
            console.print(f"  [yellow]Keine Einträge für '{exercise}'[/yellow]")
        else:
            t = Table(box=box.SIMPLE, show_header=True, header_style="bold")
            t.add_column("Datum", style="dim")
            t.add_column("Sets", justify="right")
            t.add_column("Reps", justify="right")
            t.add_column("Gewicht", justify="right", style="bold")
            t.add_column("RPE", justify="right")
            for e in entries:
                t.add_row(
                    str(e.get("date", "")),
                    str(e.get("sets", "")),
                    str(e.get("reps", "")),
                    str(e.get("weight", "")),
                    str(e.get("rpe", "")),
                )
            console.print(t)
    except Exception as exc:
        console.print(f"  [red]Fehler: {exc}[/red]")

    console.print()
    _nav(**{"h": "neue Abfrage", "b": "zurück"})
    choice = Prompt.ask("  [bold]>[/bold]", choices=["h", "b"], default="b")
    return "history" if choice == "h" else "dashboard"


# ─── Router ────────────────────────────────────────────────────────────────

_SCREENS = {
    "dashboard": screen_dashboard,
    "inbox": screen_inbox,
    "graveyard": screen_graveyard,
    "browser": screen_browser,
    "plan": screen_plan,
    "lesson": screen_lesson,
    "history": screen_history,
}


def run_tui(initial_screen: str = "dashboard") -> None:
    screen = initial_screen if initial_screen in _SCREENS else "dashboard"
    while screen != "quit":
        fn = _SCREENS.get(screen, screen_dashboard)
        try:
            screen = fn()
        except KeyboardInterrupt:
            break
        except Exception as exc:
            console.print(f"\n  [red bold]Fehler in '{screen}': {exc}[/red bold]")
            _pause()
            screen = "dashboard"
    console.print("\n  [dim]Tschüss![/dim]\n")
