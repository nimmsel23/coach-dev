"""
fitness.tui.cli — Interaktive Textual TUI App (fitness tui).

Direkter Dateizugriff — kein Server nötig.

Tabs:
  1 Log      DataTable aller Sessions, Enter → Detail-Modal
  2 Woche    7-Tage Streak-Grid
  3 Stats    Split, Cardio, Muskel-Coverage
  4 Sync     Firestore-Service + Klienten-Registry
  5 Clients  Pro-Klient 10-Tage Streak + Session-Details

Keyboard:
  1-5   Tabs       j/k ↓/↑  Navigation
  Enter Detail      r        Reload    q  Beenden
"""
from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import ClassVar

from fitness.muscles import muscle_to_group, muscle_group_label
from textual import work
from textual.app import App, ComposeResult
from textual.binding import Binding
from textual.containers import Container, ScrollableContainer
from textual.screen import ModalScreen
from textual.widgets import (
    DataTable, Footer, Header, Label,
    Static, TabbedContent, TabPane,
    ListView, ListItem,
)

from ..constants import (
    ACTIVITY_EMOJI, ACTIVITY_LABEL, WEEKDAYS_DE,
    block_rich_style, block_ansi_color,
)
from ..data import (
    activity_distance_km,
    activity_minutes,
    classify,
    load_all_clients,
    load_training_days,
    performed_exercises,
    session_activities,
    sync_info,
)


def _session_note(s: dict) -> str:
    """Kurze Notiz-Vorschau für die Log-Tabelle: Session-Notes oder Activity-Notes."""
    note = s.get("notes") or ""
    if not note:
        for a in session_activities(s):
            if a.get("notes"):
                note = a["notes"]
                break
    note = " ".join(note.split())
    if len(note) > 60:
        note = note[:59] + "…"
    return note


def _cardio_meta(s: dict) -> str:
    """z.B. '45min · 12,3km' für Cardio/Add-on-Anzeige."""
    parts = []
    adur = activity_minutes(s)
    if adur:
        parts.append(f"{adur}min")
    adist = activity_distance_km(s)
    if adist:
        km = f"{adist:g}".replace(".", ",")
        parts.append(f"{km}km")
    return " · ".join(parts)

# ── Detail-Modal ──────────────────────────────────────────────────────────────

class DetailModal(ModalScreen):
    BINDINGS = [Binding("escape,enter,q", "dismiss", "Schließen")]
    CSS = """
    DetailModal { align: center middle; }
    DetailModal > Container {
        width: 82; max-height: 90%;
        background: $surface; border: round $primary; padding: 1 2;
    }
    .dt { color: $primary; text-style: bold; margin-bottom: 1; }
    .dm { color: $text-muted; margin-bottom: 1; }
    .de { color: $text; margin-left: 2; }
    .ds { color: $primary-lighten-2; margin-left: 4; }
    .df { color: $warning; margin-top: 1; }
    .dn { color: $text-muted; text-style: italic; margin-top: 1; }
    .dc { color: $text-muted; margin-top: 2; text-align: right; }
    """

    def __init__(self, session: dict) -> None:
        super().__init__()
        self.session = session

    def compose(self) -> ComposeResult:
        s     = self.session
        kind  = classify(s)
        acts  = session_activities(s)
        act   = acts[0] if acts else (s.get("activity") or {})
        exs   = performed_exercises(s)
        block = s.get("block", "")
        eff   = s.get("effort")
        dur   = s.get("duration")
        loc   = s.get("location", "")
        notes = s.get("notes", "")
        d     = s.get("date", "?")
        try:
            dt_s = datetime.strptime(d, "%Y-%m-%d").strftime("%A, %d. %B %Y")
        except Exception:
            dt_s = d

        lines: list[tuple[str, str]] = []

        if kind == "cardio":
            label = " + ".join(
                f"{ACTIVITY_EMOJI.get(a.get('type', '?'), '🏃')} {ACTIVITY_LABEL.get(a.get('type', '?'), a.get('type', '?'))}"
                for a in acts or [act]
            )
            adur = activity_minutes(s)
            adist = activity_distance_km(s)
            lines.append(("dt", f"{label}  —  {dt_s}"))
            if adur:
                lines.append(("dm", f"⏱  {adur} Minuten gesamt"))
            if adist:
                km = f"{adist:g}".replace(".", ",")
                avg = round(adist / (adur / 60), 1) if adur else None
                lines.append(("dm", f"📏  {km} km" + (f"  ·  Ø {avg} km/h".replace(".", ",") if avg else "")))
            notes_addons = [a.get("notes") for a in (acts or [act]) if a.get("notes")]
            for n in notes_addons:
                lines.append(("ds", f"📝 {n}"))
        else:
            style = block_rich_style(block)
            lines.append(("dt", f"💪  {block or '?'}  —  {dt_s}"))
            meta = []
            if eff:  meta.append(f"RPE {eff}/10")
            if dur:  meta.append(f"{dur} min")
            if loc:  meta.append(f"📍 {loc}")
            if meta: lines.append(("dm", "  ·  ".join(meta)))
            if kind == "strength+addon":
                for entry in acts:
                    atype = entry.get("type", "?")
                    adur  = entry.get("duration", "")
                    emoji = ACTIVITY_EMOJI.get(atype, "⚡")
                    label = ACTIVITY_LABEL.get(atype, atype)
                    meta  = _cardio_meta({"_activity_addons": [entry]})
                    lines.append(("df",
                        f"⚡ Add-on: {emoji} {label}"
                        + (f" · {meta}" if meta else "")))
            if exs:
                lines.append(("dm", f"\n{'─'*42}\n{len(exs)} Exercises:\n"))
                for ex in exs:
                    name = ex.get("name", "?")
                    pm   = ", ".join(ex.get("primaryMuscles") or [])
                    note = ex.get("note", "")
                    lines.append(("de", f"▸ {name}  [{pm}]" if pm else f"▸ {name}"))
                    for i, st in enumerate(ex.get("setsArray") or [], 1):
                        r, w = st.get("reps", ""), st.get("weight", "")
                        parts = [p for p in [f"{r} Wdh" if r else None, f"{w} kg" if w else None] if p]
                        if parts:
                            lines.append(("ds", f"  Set {i}: {'  ·  '.join(parts)}"))
                    if note:
                        lines.append(("ds", f"  ↳ {note}"))
        if notes:
            lines.append(("dn", f"\n{notes}"))
        lines.append(("dc", "\n[Esc / Enter schließen]"))

        with Container():
            for cls, text in lines:
                yield Label(text, classes=cls)


# ── User-Switch-Modal ─────────────────────────────────────────────────────────

class SwitchUserModal(ModalScreen):
    BINDINGS = [Binding("escape", "dismiss", "Abbrechen")]
    CSS = """
    SwitchUserModal { align: center middle; }
    SwitchUserModal > Container {
        width: 50; max-height: 80%;
        background: $surface; border: round $primary; padding: 1 2;
    }
    .title { color: $primary; text-style: bold; margin-bottom: 1; }
    ListView {
        background: transparent;
        border: none;
    }
    ListItem {
        padding: 0 1;
    }
    ListItem:focus {
        background: $accent;
        color: $text;
    }
    .dc { color: $text-muted; margin-top: 2; text-align: right; }
    """

    def __init__(self, current_uid: str | None, on_select: callable) -> None:
        super().__init__()
        self.current_uid = current_uid
        self.on_select = on_select

    def compose(self) -> ComposeResult:
        from ..data import load_client_registry
        from ..paths import ACTIVE_UID
        
        # Build options list
        options = []
        # Add Coach
        options.append((ACTIVE_UID, "Coach (Daniel)"))
        
        # Add other clients
        registry = load_client_registry()
        for uid, meta in registry.items():
            if uid != ACTIVE_UID:
                options.append((uid, meta["name"]))
                
        with Container():
            yield Label("User wechseln", classes="title")
            items = []
            for uid, name in options:
                marker = "● " if uid == self.current_uid else "  "
                item = ListItem(Label(f"{marker}{name}"))
                item.user_uid = uid
                items.append(item)
            yield ListView(*items)
            yield Label("[Esc / Abbrechen]", classes="dc")

    def on_list_view_selected(self, event: ListView.Selected) -> None:
        self.on_select(event.item.user_uid)
        self.dismiss()


# ── Tab: Log ──────────────────────────────────────────────────────────────────

class SessionTable(Static):
    """DataTable-Wrapper mit Keyboard-Navigation und Detail-Modal."""
    DEFAULT_CSS = "SessionTable { height: 1fr; }"

    def __init__(self, sessions: list[dict]) -> None:
        super().__init__()
        self._sessions = sessions

    def compose(self) -> ComposeResult:
        table = DataTable(zebra_stripes=True, cursor_type="row")
        table.add_columns("Datum", "Typ", "Block / Aktivität", "Details", "Effort", "Notizen")
        for s in self._sessions:
            self._add_row(table, s)
        yield table

    @staticmethod
    def _add_row(table: DataTable, s: dict) -> None:
        d     = s.get("date", "?")
        kind  = classify(s)
        acts  = session_activities(s)
        act   = acts[0] if acts else (s.get("activity") or {})
        exs   = performed_exercises(s)
        block = s.get("block", "")
        eff   = s.get("effort")

        today = date.today().isoformat()
        yest  = (date.today() - timedelta(days=1)).isoformat()
        date_s = (
            f"[bold bright_magenta]Heute[/]" if d == today
            else f"[dim]Gestern[/]" if d == yest
            else datetime.strptime(d, "%Y-%m-%d").strftime("%a %d.%m")
            if len(d) == 10 else d
        )

        if kind == "cardio":
            meta  = _cardio_meta(s)
            label = " + ".join(
                f"{ACTIVITY_EMOJI.get(a.get('type', '?'), '🏃')} {ACTIVITY_LABEL.get(a.get('type', '?'), a.get('type', '?'))}"
                for a in acts or [act]
            )
            note = _session_note(s)
            table.add_row(
                date_s, "🏃",
                f"[dark_orange]{label}[/]",
                f"[dim]{meta}[/]" if meta else "—",
                "—",
                f"[dim]{note}[/]" if note else "—",
                key=s.get("_stem", d),
            )
        else:
            style = block_rich_style(block)
            names = ", ".join(e.get("name", "?") for e in exs[:3])
            ellipsis = "…" if len(exs) > 3 else ""
            addon = ""
            if kind == "strength+addon":
                meta = _cardio_meta(s)
                icons = "".join(ACTIVITY_EMOJI.get(a.get("type", "?"), "⚡") for a in acts)
                addon = f"  [dark_orange]{icons or '⚡'}{'+' + meta if meta else ''}[/]"
            note = _session_note(s)
            table.add_row(
                date_s, "💪",
                f"[{style}]{block or '?'}[/]",
                f"[dim]{names}{ellipsis}[/]{addon}",
                f"[yellow]{eff}/10[/]" if eff else "—",
                f"[dim]{note}[/]" if note else "—",
                key=s.get("_stem", d),
            )

    def update_sessions(self, sessions: list[dict]) -> None:
        self._sessions = sessions
        try:
            table = self.query_one(DataTable)
            table.clear()
            for s in sessions:
                self._add_row(table, s)
        except Exception:
            pass

    def on_data_table_row_selected(self, event: DataTable.RowSelected) -> None:
        idx = event.cursor_row
        if 0 <= idx < len(self._sessions):
            self.app.push_screen(DetailModal(self._sessions[idx]))


# ── Tab: Woche ────────────────────────────────────────────────────────────────

class WeekView(Static):
    DEFAULT_CSS = "WeekView { padding: 1 2; height: auto; }"

    def __init__(self, sessions: list[dict]) -> None:
        super().__init__()
        self.sessions = sessions

    def render(self) -> str:
        today  = date.today()
        by_date: dict[str, list[dict]] = {}
        for s in self.sessions:
            by_date.setdefault(s["date"], []).append(s)

        lines = []
        for i in range(6, -1, -1):
            d     = (today - timedelta(days=i)).isoformat()
            wd    = WEEKDAYS_DE[(today - timedelta(days=i)).weekday()]
            day_s = by_date.get(d, [])
            is_today = d == today.isoformat()
            prefix = (
                f"[bold bright_magenta]{wd} {d}[/]"
                if is_today else f"[dim]{wd} {d}[/]"
            )
            if not day_s:
                lines.append(f"  {prefix}  [dim]·  Ruhetag[/]")
                continue
            parts = []
            for s in day_s:
                kind = classify(s)
                acts = session_activities(s)
                act  = acts[0] if acts else (s.get("activity") or {})
                exs  = performed_exercises(s)
                if kind == "cardio":
                    meta  = _cardio_meta(s)
                    label = " + ".join(
                        f"{ACTIVITY_EMOJI.get(a.get('type', '?'), '🏃')} {ACTIVITY_LABEL.get(a.get('type', '?'), a.get('type', '?'))}"
                        for a in acts or [act]
                    )
                    parts.append(
                        f"[dark_orange]{label}[/]"
                        + (f" [dim]{meta}[/]" if meta else "")
                    )
                else:
                    block = s.get("block", "?")
                    style = block_rich_style(block)
                    names = ", ".join(e.get("name", "?") for e in exs[:3])
                    addon = ""
                    if kind == "strength+addon":
                        meta = _cardio_meta(s)
                        icons = "".join(ACTIVITY_EMOJI.get(a.get("type", "?"), "⚡") for a in acts)
                        addon = f"  [dark_orange]{icons or '⚡'}{'+' + meta if meta else ''}[/]"
                    parts.append(f"[{style}]● {block}[/]  [dim]{names}[/]{addon}")
            lines.append(f"  {prefix}  " + "  [dim]│[/]  ".join(parts))
        return "\n".join(lines)


# ── Tab: Stats ────────────────────────────────────────────────────────────────

class StatsView(Static):
    DEFAULT_CSS = "StatsView { padding: 1 2; height: auto; }"

    def __init__(self, sessions: list[dict]) -> None:
        super().__init__()
        self.sessions = sessions

    def render(self) -> str:
        strength = [s for s in self.sessions if classify(s) != "cardio"]
        cardio   = [s for s in self.sessions if classify(s) == "cardio"]
        total_ex = sum(
            len(performed_exercises(s))
            for s in strength
        )
        cardio_min = 0
        cardio_km  = 0.0
        for s in cardio:
            cardio_min += activity_minutes(s)
            cardio_km  += activity_distance_km(s)

        block_dist: dict[str, int] = {}
        muscle_freq: dict[str, int] = {}
        for s in strength:
            bl = (s.get("block") or "?").strip()
            block_dist[bl] = block_dist.get(bl, 0) + 1
            for ex in (s.get("exercises") or []):
                if ex.get("done"):
                    for m in (ex.get("primaryMuscles") or []):
                        group = muscle_to_group(m)
                        if group:
                            muscle_freq[group] = muscle_freq.get(group, 0) + 2
                    for m in (ex.get("secondaryMuscles") or []):
                        group = muscle_to_group(m)
                        if group:
                            muscle_freq[group] = muscle_freq.get(group, 0) + 1

        cardio_dist: dict[str, int] = {}
        for s in cardio:
            for act in session_activities(s):
                atype = act.get("type", "?")
                cardio_dist[atype] = cardio_dist.get(atype, 0) + 1

        out = ["[bold]Sessions[/bold]"]
        out.append(
            f"  Kraft:    [bright_magenta]{len(strength)}x[/]"
            f"  ·  [dim]{total_ex} Übungen gesamt[/]"
        )
        km_s = f"{cardio_km:g}".replace(".", ",")
        out.append(
            f"  Cardio-Tage: [dark_orange]{len(cardio)}x[/]"
            + (f"  ·  [dim]{cardio_min} min[/]" if cardio_min else "")
            + (f"  ·  [dim]{km_s} km[/]" if cardio_km else "")
        )

        if block_dist:
            out.append("\n[bold]Split[/bold]")
            mx = max(block_dist.values())
            for bl, cnt in sorted(block_dist.items(), key=lambda x: -x[1]):
                style = block_rich_style(bl)
                bar = "█" * cnt + "░" * max(0, mx - cnt)
                out.append(f"  [{style}]{bl:<14}[/]  [{style}]{bar}[/]  [dim]{cnt}x[/]")

        if cardio_dist:
            out.append("\n[bold]Ausdauer[/bold]")
            for atype, cnt in sorted(cardio_dist.items(), key=lambda x: -x[1]):
                emoji = ACTIVITY_EMOJI.get(atype, "🏃")
                label = ACTIVITY_LABEL.get(atype, atype)
                out.append(f"  {emoji} [dark_orange]{label:<14}[/] [dim]{cnt}x[/]")

        if muscle_freq:
            out.append("\n[bold]Muskel-Coverage[/bold]")
            total = sum(muscle_freq.values())
            mx = max(muscle_freq.values())
            for m, cnt in sorted(muscle_freq.items(), key=lambda x: -x[1])[:8]:
                label = muscle_group_label(m)
                pct = round(cnt / total * 100)
                filled = round(cnt / mx * 14)
                bar = f"[bright_magenta]{'━' * filled}[/][dim]{'╌' * (14 - filled)}[/]"
                out.append(f"  [white]{label:<14}[/]  {bar}  [dim]{pct}%[/]")

        return "\n".join(out)


# ── Tab: Sync ─────────────────────────────────────────────────────────────────

class SyncView(Static):
    DEFAULT_CSS = "SyncView { padding: 1 2; height: auto; }"

    def __init__(self, info: dict) -> None:
        super().__init__()
        self.info = info

    def render(self) -> str:
        i = self.info
        if not i:
            return "[dim]Lade…[/]"
        sc  = "green" if i["state"] == "active" else "red"
        ds  = "[green]● aktiv[/]" if i["daemon_active"] else "[yellow]○ inaktiv (boot-only)[/]"
        age = i.get("newest_age", "?")
        ac  = ("green" if isinstance(age, int) and age < 2
               else "yellow" if isinstance(age, int) and age < 7 else "red")
        last = i["last_run"][:19] if len(i.get("last_run", "")) > 10 else i.get("last_run", "?")

        lines = [
            "[bold]Firestore ↔ Lokal[/bold]\n",
            f"  [dim]Service:[/]       [{sc}]{i['state']} ({i['sub']})[/]",
            f"  [dim]Letzter Run:[/]   [white]{last}[/]",
            f"  [dim]Mirror-Daemon:[/] {ds}",
            "",
            f"  [dim]Pfad:[/]          [white]{i['sdir']}[/]",
            f"  [dim]JSON-Sessions:[/] [bright_magenta]{i['json_count']}[/]",
            f"  [dim]SQLite-Sets:[/]   [dim]{i['sqlite_n']}  (latest: {i['sqlite_latest']})[/]",
            f"  [dim]Neueste:[/]       [{ac}]{i['newest']}[/]  [dim]({age} Tage alt)[/]",
            "",
            "  [dim]→ fitness sync   zum manuellen Pull/Push[/]",
        ]

        # Klienten
        from ..data import load_client_registry
        from ..paths import AOS_USERS
        registry = load_client_registry()
        if registry:
            lines.append("\n[bold]Klienten[/bold]")
            for uid, meta in registry.items():
                sdir = AOS_USERS / uid / "fitness" / "sessions"
                if sdir.exists():
                    files  = list(sdir.glob("*.json"))
                    dates  = sorted((f.stem[:10] for f in files if len(f.stem) >= 10), reverse=True)
                    newest = dates[0] if dates else "—"
                    try:
                        a  = (date.today() - date.fromisoformat(newest)).days
                        ac2 = "green" if a < 3 else "yellow" if a < 7 else "red"
                        age_s = f"[{ac2}]{newest}[/] [dim]({a}d)[/]"
                    except Exception:
                        age_s = f"[dim]{newest}[/]"
                    sync_s = f"[green]✓ {len(files)}[/]  {age_s}"
                else:
                    sync_s = "[yellow]○ kein Sync[/]"
                lines.append(f"  [white]{meta['name']:<18}[/] [dim]{uid[:12]}…[/]  {sync_s}")

        return "\n".join(lines)


# ── Tab: Clients ──────────────────────────────────────────────────────────────

class ClientsView(Static):
    DEFAULT_CSS = "ClientsView { padding: 1 2; height: auto; }"

    def __init__(self, clients: list[dict], days: int = 10) -> None:
        super().__init__()
        self.clients = clients
        self.days    = days

    def render(self) -> str:
        if not self.clients:
            return "[dim]  Keine registrierten Klienten gefunden.[/]"

        today    = date.today()
        day_cols = [(today - timedelta(days=i)).isoformat() for i in range(self.days - 1, -1, -1)]

        lines: list[str] = []
        lines.append(f"[bold]Klienten-Logs — letzte {self.days} Tage[/bold]\n")

        wd_row = " ".join(
            f"[bold bright_magenta]{(today - timedelta(days=i)).strftime('%a')[0:2]}[/]"
            if (today - timedelta(days=i)).isoformat() == today.isoformat()
            else f"[dim]{(today - timedelta(days=i)).strftime('%a')[0:2]}[/]"
            for i in range(self.days - 1, -1, -1)
        )
        lines.append(f"  [dim]{'Klient':<18}[/]  {wd_row}  [dim]Letztes       Total[/]")
        lines.append(f"  {'─' * 18}  {'── ' * self.days} {'─' * 12}  {'─' * 5}")

        for cl in self.clients:
            name     = cl["name"]
            has_data = cl.get("has_data", False)
            crm_id   = cl.get("crm_id")
            sess_map: dict[str, list[dict]] = {}
            for s in cl["sessions"]:
                sess_map.setdefault(s["date"], []).append(s)

            dots = []
            for d in day_cols:
                day_s = sess_map.get(d, [])
                if not day_s:
                    dots.append("[dim]·[/]")
                    continue
                kinds = [classify(s) for s in day_s]
                if any(k != "cardio" for k in kinds) and any(k == "cardio" for k in kinds):
                    dots.append("[bold magenta]◈[/]")
                elif all(k == "cardio" for k in kinds):
                    dots.append("[dark_orange]●[/]")
                else:
                    block = next((s.get("block", "") for s in day_s if classify(s) != "cardio"), "")
                    style = block_rich_style(block)
                    dots.append(f"[{style}]●[/]")

            streak = " ".join(dots)
            last   = cl["last_date"]
            total  = cl["total_count"]
            try:
                age   = (today - date.fromisoformat(last)).days
                lc    = "green" if age < 3 else "yellow" if age < 7 else "dim red"
                last_s = f"[{lc}]{last}[/]"
            except Exception:
                last_s = f"[dim]{last}[/]"

            nd_s  = "  [dim italic]kein lokaler Sync[/]" if not has_data else ""
            crm_s = f"  [dim]#{crm_id}[/]" if crm_id else ""
            lines.append(f"  [bold bright_magenta]{name:<18}[/]  {streak}  {last_s}  [dim]{total:>3}x[/]{crm_s}{nd_s}")

            for d in day_cols:
                for s in sess_map.get(d, []):
                    kind  = classify(s)
                    acts  = session_activities(s)
                    act   = acts[0] if acts else (s.get("activity") or {})
                    exs   = performed_exercises(s)
                    block = s.get("block", "")
                    eff   = s.get("effort")
                    dl    = datetime.strptime(d, "%Y-%m-%d").strftime("%d.%m")
                    if kind == "cardio":
                        meta  = _cardio_meta(s)
                        label = " + ".join(
                            f"{ACTIVITY_EMOJI.get(a.get('type', '?'), '🏃')} {ACTIVITY_LABEL.get(a.get('type', '?'), a.get('type', '?'))}"
                            for a in acts or [act]
                        )
                        lines.append(
                            f"    [dim]{dl}[/]  [dark_orange]{label}[/]"
                            + (f" [dim]{meta}[/]" if meta else "")
                        )
                    else:
                        style = block_rich_style(block)
                        names = ", ".join(e.get("name", "?") for e in exs[:3])
                        addon = ""
                        if kind == "strength+addon":
                            meta = _cardio_meta(s)
                            icons = "".join(ACTIVITY_EMOJI.get(a.get("type", "?"), "⚡") for a in acts)
                            addon = f"  [dark_orange]{icons or '⚡'}{'+' + meta if meta else ''}[/]"
                        eff_s = f" [dim]RPE {eff}[/]" if eff else ""
                        lines.append(
                            f"    [dim]{dl}[/]  [{style}]{block or '?'}[/]"
                            + (f"  [dim]{names}[/]" if names else "")
                            + eff_s + addon
                        )
            lines.append("")

        return "\n".join(lines)


# ── Main App ──────────────────────────────────────────────────────────────────

class FitnessTUI(App):
    TITLE     = "AlphaOS Fitness"
    SUB_TITLE = "Session Dashboard"
    CSS = "Screen { background: $background; }"
    BINDINGS: ClassVar = [
        Binding("1", "show_tab('log')",     "Log",     show=True),
        Binding("2", "show_tab('woche')",   "Woche",   show=True),
        Binding("3", "show_tab('stats')",   "Stats",   show=True),
        Binding("4", "show_tab('sync')",    "Sync",    show=True),
        Binding("5", "show_tab('clients')", "Clients", show=True),
        Binding("r", "reload",              "Reload"),
        Binding("u", "switch_user",         "User wechseln", show=True),
        Binding("q", "quit",                "Quit"),
    ]

    def __init__(self) -> None:
        super().__init__()
        from ..paths import ACTIVE_UID
        self.current_uid = ACTIVE_UID
        # Daten synchron laden — schnelle File-I/O, blockiert nicht spürbar
        self._sessions = load_training_days(60, uid=self.current_uid)
        self._info     = sync_info(uid=self.current_uid)
        self._clients  = load_all_clients(10)

    def compose(self) -> ComposeResult:
        yield Header(show_clock=True)
        with TabbedContent(initial="log"):
            with TabPane("📋 Log",     id="log"):
                yield SessionTable(self._sessions)
            with TabPane("📅 Woche",   id="woche"):
                with ScrollableContainer():
                    yield WeekView(self._sessions)
            with TabPane("📊 Stats",   id="stats"):
                with ScrollableContainer():
                    yield StatsView(self._sessions)
            with TabPane("🔄 Sync",    id="sync"):
                with ScrollableContainer():
                    yield SyncView(self._info)
            with TabPane("👥 Clients", id="clients"):
                with ScrollableContainer():
                    yield ClientsView(self._clients)
        yield Footer()

    @work(thread=True)
    def action_reload(self) -> None:
        sessions = load_training_days(60, uid=self.current_uid)
        info     = sync_info(uid=self.current_uid)
        clients  = load_all_clients(10)
        self.call_from_thread(self._apply, sessions, info, clients)

    def _apply(self, sessions: list[dict], info: dict, clients: list[dict]) -> None:
        self._sessions = sessions
        self._info     = info
        self._clients  = clients
        self.query_one(SessionTable).update_sessions(sessions)
        wv = self.query_one(WeekView)
        wv.sessions = sessions
        wv.refresh(layout=True)
        sv = self.query_one(StatsView)
        sv.sessions = sessions
        sv.refresh(layout=True)
        syn = self.query_one(SyncView)
        syn.info = info
        syn.refresh(layout=True)
        cv = self.query_one(ClientsView)
        cv.clients = clients
        cv.refresh(layout=True)
        self.notify("Daten aktualisiert", severity="information", timeout=2)

    def action_show_tab(self, tab_id: str) -> None:
        self.query_one(TabbedContent).active = tab_id

    def action_switch_user(self) -> None:
        def on_select(uid: str) -> None:
            self.current_uid = uid
            from ..data import load_client_registry
            from ..paths import ACTIVE_UID
            if uid == ACTIVE_UID:
                self.sub_title = "Session Dashboard (Coach)"
            else:
                registry = load_client_registry()
                name = registry.get(uid, {}).get("name", "Klient")
                self.sub_title = f"Session Dashboard ({name})"
            self.action_reload()

        self.push_screen(SwitchUserModal(self.current_uid, on_select))


# ── Entry-Point ───────────────────────────────────────────────────────────────

def main() -> None:
    FitnessTUI().run()


if __name__ == "__main__":
    main()
