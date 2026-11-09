"""Workout-Inbox als Textual-TUI (läuft im Scratchpad, funktioniert aber in jedem Terminal).

Tasten: ↑/↓ oder j/k Navigation · Leertaste gesehen⇄neu · m gesehen + weiter · n nächstes Neues
        A alle gesehen · u nur Neue · c Klient wechseln · r neu laden · Esc ausblenden · q beenden
"""
from __future__ import annotations

import io
from pathlib import Path

from rich.console import Console
from rich.text import Text
from textual.app import App, ComposeResult
from textual.binding import Binding
from textual.containers import Horizontal, VerticalScroll
from textual.coordinate import Coordinate
from textual.events import Resize
from textual.screen import ModalScreen
from textual.widgets import DataTable, Footer, Header, Input, Static

from backend.core.store import SessionStore
from backend.notifier.chronicle import Chronicle
from backend.notifier.config import NotifyConfig
from backend.notifier.detail import render_detail
from backend.notifier.inbox import Entry, Inbox
from backend.notifier.paths import notifier_dir
from backend.notifier.scratchpad import HyprError, Scratchpad, take_focus_request


def _info(e: Entry) -> str:
    first = (e.summary or "").splitlines()[0] if e.summary else ""
    return first.split(" · ", 1)[1] if " · " in first else first


class HelpScreen(ModalScreen):
    BINDINGS = [("escape,q,question_mark", "dismiss", "Zurück")]
    CSS = """
    HelpScreen { align: center middle; background: $background 80%; }
    #help { width: 66; height: auto; padding: 1 3; border: round $accent; background: $surface; }
    """

    def compose(self) -> ComposeResult:
        yield Static(Text(
            "WORKOUT-INBOX · TASTEN\n\n"
            "↑ ↓ / j k   Workout auswählen\n"
            "h / i       Chronik (letzte 5 Tage) / Inbox\n"
            "Leertaste   Gesehen / neu umschalten (Inbox)\n"
            "m           Gesehen + nächstes neues Workout (Inbox)\n"
            "n           Nächstes neues Workout (Inbox, zyklisch)\n"
            "A           Sichtbare Workouts gesehen (Inbox)\n"
            "u           Nur neue Workouts / alle (Inbox)\n"
            "c           Klientenfilter wechseln\n"
            "/           Suche (Klient, Datum, Workout)\n"
            "d           Details groß / geteilte Ansicht\n"
            "Tab         Zwischen Liste, Suche und Details wechseln\n"
            "Bild ↑ ↓    Details scrollen (Details fokussieren)\n"
            "r           Daten neu laden\n"
            "Esc         Suche verlassen / ausblenden / beenden\n"
            "q           Beenden\n\n"
            "Esc schließt diese Hilfe."), id="help")


class InboxApp(App):
    TITLE = "FITNESS · Workout-Inbox"
    CSS = """
    Screen { background: $background; }
    #overview { height: 3; padding: 0 2; content-align: left middle; background: $primary 15%; }
    #search { height: 3; margin: 0 1; border: round $primary; }
    #body { height: 1fr; }
    #list { width: 46%; height: 1fr; border: round $primary; margin: 0 0 0 1; }
    #list:focus { border: round $accent; }
    #detail { width: 1fr; padding: 1 2; margin: 0 1; border: round $primary; }
    #detail:focus { border: round $accent; }
    #status { height: 1; padding: 0 2; color: $text-muted; }
    .compact #body { layout: vertical; }
    .compact #list { width: 1fr; height: 42%; margin: 0 1; }
    .compact #detail { width: 1fr; height: 1fr; }
    .details-only #list { display: none; }
    """
    BINDINGS = [
        Binding("h", "chronicle", "Chronik"),
        Binding("i", "inbox", "Inbox"),
        Binding("slash", "search", "Suche"),
        Binding("question_mark", "help", "Hilfe"),
        Binding("d", "detail", "Details"),
        Binding("j", "cursor_down", "↓", show=False),
        Binding("k", "cursor_up", "↑", show=False),
        Binding("space", "toggle_seen", "Gesehen ⇄ Neu"),
        Binding("m", "seen_next", "Gesehen + weiter", show=False),
        Binding("n", "next_unseen", "Nächstes Neues", show=False),
        Binding("A", "mark_all_seen", "Ansicht gesehen", show=False),
        Binding("u", "toggle_unseen_only", "Nur Neue"),
        Binding("c", "cycle_client", "Klient", show=False),
        Binding("r", "reload", "Neu laden", show=False),
        Binding("escape", "hide", "Zurück", show=False),
        Binding("q", "quit", "Beenden"),
    ]

    def __init__(self, root: Path, config: NotifyConfig | None = None, *, inbox: Inbox | None = None,
                 scratchpad: Scratchpad | None = None, poll_interval: float = 1.0,
                 view: str = "chronicle", chronicle: Chronicle | None = None):
        super().__init__()
        self.root = Path(root)
        self.config = config or NotifyConfig()
        self.inbox = inbox or Inbox(notifier_dir(self.root))
        self.store = SessionStore(self.root)
        self.chronicle = chronicle or Chronicle(self.root)
        self.view = view
        self.scratchpad = scratchpad
        self.poll_interval = poll_interval
        self.auto_seen = self.config.auto_seen_seconds
        self.only_unseen = False
        self.client_filter: str | None = None
        self.search_query = ""
        self.last_detail_plain = ""
        self._entries: list[Entry] = []
        self._all: list[Entry] = []
        self._signature = None
        self._seen_timer = None
        self._shown_id: str | None = None

    # --- Aufbau ------------------------------------------------------------------
    def compose(self) -> ComposeResult:
        yield Header()
        yield Static("", id="overview", markup=False)
        yield Input(placeholder="/ Suche nach Klient, Datum oder Workout …", id="search")
        with Horizontal(id="body"):
            yield DataTable(id="list", cursor_type="row", zebra_stripes=True)
            with VerticalScroll(id="detail"):
                yield Static("", id="detail-text")
        yield Static("", id="status", markup=False)
        yield Footer()

    def on_mount(self) -> None:
        table = self.table
        table.border_title = "Workouts"
        self.query_one("#detail", VerticalScroll).border_title = "Workout-Details"
        table.add_column("", width=2)
        table.add_column("Datum", width=10)
        table.add_column("Klient", width=14)
        table.add_column("Workout")
        self.reload()
        table.focus()
        self.set_interval(self.poll_interval, self._poll)

    def on_resize(self, event: Resize) -> None:
        self.screen.set_class(event.size.width < 100, "compact")

    @property
    def table(self) -> DataTable:
        return self.query_one("#list", DataTable)

    # --- Daten -------------------------------------------------------------------
    def current_id(self) -> str | None:
        table = self.table
        if table.row_count == 0 or not (0 <= table.cursor_row < table.row_count):
            return None
        return table.coordinate_to_cell_key(Coordinate(table.cursor_row, 0)).row_key.value

    def reload(self, keep: str | None = None, *, keep_index: int | None = None) -> None:
        keep = keep if keep is not None else self.current_id()
        old_index = keep_index if keep_index is not None else self.table.cursor_row
        self._signature = self.inbox.signature()
        if self.view == "chronicle":
            self._signature = self.chronicle.signature()
            self._all = self.chronicle.entries()
        else:
            self._all = self.inbox.entries()
        self.table.border_title = "Chronik · letzte 5 Tage" if self.view == "chronicle" else "Workout-Inbox"
        entries = self._all
        if self.client_filter:
            entries = [e for e in entries if e.client == self.client_filter]
        if self.only_unseen:
            entries = [e for e in entries if e.unseen]
        if self.search_query:
            entries = [e for e in entries if self.search_query in
                       f"{e.client} {e.date} {e.summary} {e.mode}".casefold()]
        self._entries = entries

        table = self.table
        table.clear()
        for e in entries:
            mark = Text("●", style="bold green") if e.unseen else Text(" ")
            style = "bold" if e.unseen else ("" if self.view == "chronicle" else "dim")
            table.add_row(mark, Text(e.date, style=style), Text(e.client, style=style),
                          Text(_info(e), style=style), key=e.id)
        if entries:
            ids = [e.id for e in entries]
            idx = ids.index(keep) if keep in ids else min(max(old_index, 0), len(entries) - 1)
            table.move_cursor(row=idx, animate=False)
        self._show_current()

    def _entry(self, eid: str | None) -> Entry | None:
        return next((e for e in self._entries if e.id == eid), None)

    def _show_current(self) -> None:
        eid = self.current_id()
        entry = self._entry(eid)
        detail = self.query_one("#detail-text", Static)
        if self._seen_timer is not None:
            self._seen_timer.stop()
            self._seen_timer = None
        self._shown_id = eid
        if entry is None:
            empty = "Keine Workouts in den letzten fünf Tagen.\n\nLokale Sessions werden nach dem Sync hier angezeigt."
            if self.view == "inbox":
                empty = ("Keine Workouts.\n\nHier erscheinen neue Klienten-Workouts nach einem Pull mit --notify.\n"
                         "Einrichtung prüfen: fitness-inbox doctor\n")
                empty += "Benachrichtigungen aktivieren: fitness-inbox init\nChronik der letzten fünf Tage: h"
            renderable = Text(empty if not self._all else "Nichts in dieser Ansicht (Suche oder Filter mit u/c ändern).",
                              style="dim")
        else:
            session, error = self.store.read(entry.uid, entry.doc_id)
            renderable = render_detail(entry, session, error)
            if self.view == "inbox" and session is not None and entry.unseen and self.auto_seen > 0:
                self._seen_timer = self.set_timer(self.auto_seen,
                    lambda eid=entry.id, marker=entry.marker: self._auto_seen(eid, marker))
        detail.update(renderable)
        buf = io.StringIO()
        Console(file=buf, width=100, force_terminal=False, color_system=None).print(renderable)
        self.last_detail_plain = buf.getvalue()
        self.query_one("#detail", VerticalScroll).scroll_home(animate=False)
        self._update_status()

    def _update_status(self) -> None:
        unseen = sum(1 for e in self._all if e.unseen)
        first = ("5 TAGE", "bold cyan") if self.view == "chronicle" else (f"● {unseen} NEU", "bold green")
        self.query_one("#overview", Static).update(Text.assemble(
            first, "    ",
            (f"{len(self._all)} WORKOUTS", "bold"), "    ",
            (f"{len({e.uid for e in self._all})} KLIENTEN", "cyan"), "    ",
            (f"{len(self._entries)} in Ansicht", "dim")))
        if self.view == "chronicle":
            start, end = self.chronicle.period
            parts = [f"Chronik · {start:%d.%m.}–{end:%d.%m.%Y}"]
            if self.chronicle.skipped:
                parts.append(f"{self.chronicle.skipped} unlesbare Sessions übersprungen")
        else:
            parts = ["Live · lokale Workout-Inbox"]
        if self.only_unseen:
            parts.append("Filter: nur Neue")
        if self.client_filter:
            parts.append(f"Klient: {self.client_filter}")
        if self.search_query:
            parts.append(f"Suche: {self.search_query}")
        if self.view == "inbox":
            parts.append(f"Auto-gesehen: {self.auto_seen:g}s" if self.auto_seen > 0 else "Gesehen: manuell")
        self.query_one("#status", Static).update("  ·  ".join(parts))
        self.sub_title = "Chronik · letzte 5 Tage" if self.view == "chronicle" else (f"{unseen} neu" if unseen else "alles gesehen")

    # --- Ereignisse ----------------------------------------------------------------
    def on_data_table_row_highlighted(self, event: DataTable.RowHighlighted) -> None:
        if event.row_key is not None and event.row_key.value != self._shown_id:
            self._show_current()

    def _auto_seen(self, eid: str, marker: str) -> None:
        if self.view == "inbox" and self.current_id() == eid and not isinstance(self.screen, ModalScreen):
            self.inbox.mark_seen([eid], expected={eid: marker})
            self.reload(keep=eid)

    def _poll(self) -> None:
        focus = take_focus_request(notifier_dir(self.root))
        source = self.chronicle if self.view == "chronicle" else self.inbox
        if source.signature() != self._signature or focus:
            self.reload()
        if focus:
            self._focus_entry(focus)

    def _focus_entry(self, eid: str) -> None:
        if self.view != "inbox":
            self.view = "inbox"
            self.reload()
            self.refresh_bindings()
        if self._entry(eid) is None and (self.only_unseen or self.client_filter or self.search_query):
            self.only_unseen, self.client_filter = False, None
            self.search_query = ""
            self.query_one("#search", Input).value = ""
            self.reload()
        for idx, e in enumerate(self._entries):
            if e.id == eid:
                self.table.move_cursor(row=idx, animate=False)
                self._show_current()
                break
        self.table.focus()

    # --- Aktionen ------------------------------------------------------------------
    def check_action(self, action: str, parameters: tuple[object, ...]) -> bool | None:
        if action in {"toggle_seen", "seen_next", "next_unseen", "mark_all_seen", "toggle_unseen_only"}:
            return self.view == "inbox"
        return True

    def action_chronicle(self) -> None:
        self.view = "chronicle"
        self.only_unseen = False
        self.reload()
        self.refresh_bindings()

    def action_inbox(self) -> None:
        self.view = "inbox"
        self.reload()
        self.refresh_bindings()

    def on_input_changed(self, event: Input.Changed) -> None:
        self.search_query = event.value.strip().casefold()
        self.reload()

    def on_input_submitted(self, event: Input.Submitted) -> None:
        self.table.focus()

    def action_search(self) -> None:
        self.query_one("#search", Input).focus()

    def action_help(self) -> None:
        self.push_screen(HelpScreen())

    def action_detail(self) -> None:
        self.screen.toggle_class("details-only")
        if self.screen.has_class("details-only"):
            self.query_one("#detail", VerticalScroll).focus()
        else:
            self.table.focus()

    def action_cursor_down(self) -> None:
        self.table.action_cursor_down()

    def action_cursor_up(self) -> None:
        self.table.action_cursor_up()

    def action_reload(self) -> None:
        self.reload()

    def action_toggle_seen(self) -> None:
        if self.view != "inbox":
            return
        e = self._entry(self.current_id())
        if e is None:
            return
        if e.unseen:
            self.inbox.mark_seen([e.id], expected={e.id: e.marker})
        else:
            self.inbox.mark_unseen([e.id])
        self.reload(keep=e.id, keep_index=self.table.cursor_row)

    def action_next_unseen(self) -> None:
        n = len(self._entries)
        start = self.table.cursor_row
        for step in range(1, n + 1):
            idx = (start + step) % n
            if self._entries[idx].unseen:
                self.table.move_cursor(row=idx, animate=False)
                self._show_current()
                return
        self.notify("Nichts Neues mehr.", timeout=2)

    def action_seen_next(self) -> None:
        if self.view != "inbox":
            return
        e = self._entry(self.current_id())
        if e is None:
            return
        idx = self.table.cursor_row
        following = self._entries[idx + 1:] + self._entries[:idx]
        next_id = next((item.id for item in following if item.unseen), e.id)
        self.inbox.mark_seen([e.id], expected={e.id: e.marker})
        self.reload(keep=next_id, keep_index=idx)

    def action_mark_all_seen(self) -> None:
        if self.view != "inbox":
            return
        n = self.inbox.mark_seen([e.id for e in self._entries],
                                 expected={e.id: e.marker for e in self._entries})
        self.reload()
        self.notify(f"{n} als gesehen markiert.", timeout=2)

    def action_toggle_unseen_only(self) -> None:
        self.only_unseen = not self.only_unseen
        self.reload()

    def action_cycle_client(self) -> None:
        names = sorted({e.client for e in self._all})
        cycle = [None, *names]
        self.client_filter = cycle[(cycle.index(self.client_filter) + 1) % len(cycle)] \
            if self.client_filter in cycle else None
        self.reload()

    def action_hide(self) -> None:
        if isinstance(self.focused, Input):
            self.query_one("#search", Input).value = ""
            self.table.focus()
            return
        if self.screen.has_class("details-only"):
            self.action_detail()
            return
        if self.scratchpad is None:
            self.exit()
            return
        try:
            self.scratchpad.hide()
        except HyprError as exc:
            self.notify(f"Ausblenden fehlgeschlagen: {exc}", severity="error")
