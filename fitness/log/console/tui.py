"""Textual-Oberfläche der Coach-Console (`fitness-log console`).

Ersetzt das Ein-Panel-Rich-Live (bleibt als `--classic` in core.py) durch ein Dashboard:

  ┌ Klienten ───────────┬ [1 Live] [2 Session] [3 Journal] [4 Entwürfe] ─────────┐
  │ Name  Letzte Tage … │  Event-Feed / Session-Detail / Journal / KI-Entwürfe    │
  └─────────────────────┴─────────────────────────────────────────────────────────┘

Datenquelle sind ausschließlich Dateien (Sessions, Journal, Drafts) — kein Server. Die
Hintergrundteile sind dieselben wie in der klassischen Console: watchdog-Watcher,
Gap-Check (`gap_check._check_one_client`), Feedback-Entwurf (`core._analyze_session`),
Persistenz/Freigabe (`drafts`). Neu: offene Entwürfe aus früheren Läufen sind sofort
sichtbar, Gap-Checks sind manuell auslösbar, der Zustand von Daemon und Zeitplan ist
immer im Kopf zu sehen.
"""
from __future__ import annotations

import json
import os
import queue as _queue
import shutil
import subprocess
import time
from collections import deque
from datetime import datetime

from rich.text import Text
from textual import work
from textual.app import App, ComposeResult
from textual.binding import Binding
from textual.containers import Horizontal, Vertical, VerticalScroll
from textual.widgets import DataTable, Footer, Header, RichLog, Static, TabbedContent, TabPane

from . import model
from .daemon import UNIT as DAEMON_UNIT
from .drafts import find_draft_path, mark_status
from .events import event_line

PULL_CMD = os.environ.get("FITNESS_CONSOLE_PULL_CMD", "vos-firestore pull fitness").split()
TABS = {"1": "live", "2": "session", "3": "journal", "4": "drafts"}
SORT_MODES = ["aktiv", "gap", "name"]
SORT_LABEL = {"aktiv": "zuletzt aktiv", "gap": "längste Pause", "name": "Name"}


def _dd_mm(iso: str | None) -> str:
    try:
        return datetime.fromisoformat(iso).strftime("%d.%m.") if iso else "—"
    except Exception:
        return iso or "—"


class ConsoleApp(App):
    TITLE = "Fitness Console"
    CSS = """
    #status { height: 1; padding: 0 1; background: $boost; }
    #clients { width: 52; border-right: tall $primary-background; }
    #tabs { width: 1fr; }
    #live_log, #drafts_table { height: 1fr; }
    #draft_text { height: 12; border-top: tall $primary-background; padding: 0 1; }
    #session_body, #journal_body { padding: 1 2; }
    """
    BINDINGS = [
        Binding("q", "quit", "Beenden"),
        Binding("1", "tab('live')", "Live", show=False),
        Binding("2", "tab('session')", "Session", show=False),
        Binding("3", "tab('journal')", "Journal", show=False),
        Binding("4", "tab('drafts')", "Entwürfe", show=False),
        Binding("a", "approve", "Freigeben"),
        Binding("d", "discard", "Verwerfen"),
        Binding("c", "copy", "Kopieren"),
        Binding("g", "gap_selected", "Gap-Check"),
        Binding("G", "gap_all", "Alle prüfen", show=False),
        Binding("p", "pull", "Pull"),
        Binding("D", "daemon", "Daemon", show=False),
        Binding("o", "sort", "Sortierung"),
        Binding("f", "filter", "Live-Filter"),
        Binding("h", "closed", "Erledigte", show=False),
        Binding("[", "session_step(1)", "Ältere", show=False),
        Binding("]", "session_step(-1)", "Neuere", show=False),
        Binding("r", "reload", "Neu laden"),
    ]

    def __init__(self, gap_interval: int = 1800, watch: bool = True) -> None:
        super().__init__()
        self.gap_interval = gap_interval
        self.watch = watch
        self.events: "_queue.Queue[str]" = _queue.Queue()
        self.review_queue: "_queue.Queue" = _queue.Queue()
        self.clients: list[model.Client] = []
        self.sort_mode = "aktiv"
        self.selected_slug: str | None = None
        self.session_idx = 0
        self.live_lines: deque[tuple[str, Text]] = deque(maxlen=800)
        self.live_filter = False
        self.show_closed = False
        self.draft_rows: dict[str, dict] = {}
        self.daemon = "…"
        self.next_gap: float | None = None
        self.gap_running = False
        self.observer = None
        self.registry: dict = {}

    # ── Aufbau ────────────────────────────────────────────────────────────────

    def compose(self) -> ComposeResult:
        yield Header(show_clock=True)
        yield Static("", id="status")
        with Horizontal():
            yield DataTable(id="clients", cursor_type="row", zebra_stripes=True)
            with TabbedContent(id="tabs", initial="live"):
                with TabPane("1 Live", id="live"):
                    yield RichLog(id="live_log", wrap=True, markup=False, highlight=False, max_lines=2000)
                with TabPane("2 Session", id="session"):
                    with VerticalScroll():
                        yield Static("", id="session_body")
                with TabPane("3 Journal", id="journal"):
                    with VerticalScroll():
                        yield Static("", id="journal_body")
                with TabPane("4 Entwürfe", id="drafts"):
                    with Vertical():
                        yield DataTable(id="drafts_table", cursor_type="row", zebra_stripes=True)
                        with VerticalScroll(id="draft_text"):
                            yield Static("", id="draft_body")
        yield Footer()

    def on_mount(self) -> None:
        ct = self.query_one("#clients", DataTable)
        ct.add_columns("", "Klient", "Letzte", "Tage", "28T", "Block", "Entw.")
        dt = self.query_one("#drafts_table", DataTable)
        dt.add_columns("Status", "Art", "Klient", "Erstellt", "Vorschau")
        self._load_registry()
        self.reload_all()
        self._log(event_line("dim", "Console gestartet", f"{len(self.clients)} Klienten",
                             "a/d Freigabe · g Gap-Check · p Pull · ? Tasten im Footer"))
        if self.watch:
            self._start_watcher()
        self.set_interval(0.25, self._drain)
        self.set_interval(5.0, self._poll_daemon)
        self.set_interval(1.0, self._render_status)
        self._poll_daemon()
        if self.gap_interval > 0 and self.watch:
            self.next_gap = time.time() + 5
            self.set_interval(2.0, self._gap_tick)

    def on_unmount(self) -> None:
        if self.observer is not None:
            self.observer.stop()
            self.observer.join(timeout=2)

    def _load_registry(self) -> None:
        from ...data import load_client_registry
        self.registry = load_client_registry()

    def _start_watcher(self) -> None:
        from watchdog.observers import Observer
        from ...catalog.core.paths import runtime_root
        from .core import _analyze_session
        from .watcher import SessionJournalHandler

        handler = SessionJournalHandler(
            self.events, self.registry,
            on_session=lambda uid, name, session: _analyze_session(self.events, self.review_queue, uid, name, session),
        )
        self.observer = Observer()
        self.observer.schedule(handler, str(runtime_root() / "users"), recursive=True)
        self.observer.start()

    # ── Daten laden / Tabellen ────────────────────────────────────────────────

    def reload_all(self) -> None:
        self.clients = model.clients(self.registry)
        self._fill_clients()
        self._fill_drafts()
        self._show_session()
        self._show_journal()

    def current(self) -> model.Client | None:
        return next((c for c in self.clients if c.slug == self.selected_slug), None)

    def _fill_clients(self) -> None:
        table = self.query_one("#clients", DataTable)
        table.clear()
        for c in model.sort_clients(self.clients, self.sort_mode):
            style = model.gap_style(c)
            dot = Text("●", style=style)
            days = "—" if c.days_since is None else str(c.days_since)
            name_style = "" if c.coaching else "dim"
            drafts = Text(str(c.open_drafts) if c.open_drafts else "", style="bold yellow")
            table.add_row(dot, Text(c.name, style=name_style), _dd_mm(c.last_date), Text(days, style=style),
                          str(c.sessions_28d), c.last_block or "—", drafts, key=c.slug)
        if self.clients:
            if not any(c.slug == self.selected_slug for c in self.clients):
                self.selected_slug = model.sort_clients(self.clients, self.sort_mode)[0].slug
            try:
                table.move_cursor(row=table.get_row_index(self.selected_slug))
            except Exception:
                pass

    def _fill_drafts(self) -> None:
        table = self.query_one("#drafts_table", DataTable)
        keep = None
        try:
            keep = table.coordinate_to_cell_key(table.cursor_coordinate).row_key.value
        except Exception:
            pass
        table.clear()
        self.draft_rows = {}
        for d in model.drafts_for(None, include_closed=self.show_closed):
            did = d["id"]
            self.draft_rows[did] = d
            status = d.get("status") or "offen"
            style = {"approved": "green", "discarded": "dim", "dismissed": "dim"}.get(status, "yellow")
            preview = (d.get("text") or "").replace("\n", " ")[:80]
            table.add_row(Text(status, style=style), d.get("kind", "?"), d.get("name", "?"),
                          (d.get("created_at") or "")[:16].replace("T", " "), Text(preview), key=did)
        if keep and keep in self.draft_rows:
            table.move_cursor(row=table.get_row_index(keep))
        self._show_draft()

    def _show_session(self) -> None:
        body = self.query_one("#session_body", Static)
        c = self.current()
        if c is None:
            body.update("")
            return
        files = model.session_files(c)
        if not files:
            body.update(Text(f"{c.name}: keine Sessions", style="dim"))
            return
        self.session_idx = max(0, min(self.session_idx, len(files) - 1))
        try:
            data = json.loads(files[self.session_idx][1].read_text(encoding="utf-8"))
        except Exception as exc:
            body.update(Text(f"Session nicht lesbar: {exc}", style="red"))
            return
        head = Text(f"{c.name}  ·  Session {self.session_idx + 1}/{len(files)}   ([ älter  ] neuer)\n\n", style="dim")
        head.append_text(model.session_text(data))
        body.update(head)

    def _show_journal(self) -> None:
        body = self.query_one("#journal_body", Static)
        c = self.current()
        if c is None:
            body.update("")
            return
        entries = model.journal_entries(c)
        out = Text()
        if not entries:
            out.append(f"{c.name}: keine Journal-Einträge", style="dim")
        for day, txt in entries:
            out.append(f"{day}\n", style="bold cyan")
            out.append(txt + "\n\n")
        body.update(out)

    def _show_draft(self) -> None:
        body = self.query_one("#draft_body", Static)
        d = self._selected_draft()
        if d is None:
            body.update(Text("Keine Entwürfe.", style="dim"))
            return
        t = Text()
        t.append(f"{d.get('name', '?')} · {d.get('kind', '?')} · {(d.get('created_at') or '')[:16].replace('T', ' ')}\n", style="bold")
        for k in ("days_gap", "last_session_date", "session_block"):
            if d.get(k) not in (None, ""):
                t.append(f"{k}: {d[k]}  ", style="dim")
        t.append("\n\n")
        t.append(str(d.get("text") or ""))
        body.update(t)

    def _selected_draft(self) -> dict | None:
        table = self.query_one("#drafts_table", DataTable)
        try:
            key = table.coordinate_to_cell_key(table.cursor_coordinate).row_key.value
        except Exception:
            return None
        return self.draft_rows.get(key)

    # ── Events / Live-Log ─────────────────────────────────────────────────────

    def _log(self, line: str) -> None:
        text = Text.from_ansi(line)
        self.live_lines.append((text.plain, text))
        c = self.current()
        if self.live_filter and c is not None and c.name not in text.plain:
            return
        self.query_one("#live_log", RichLog).write(text)

    def _rebuild_live(self) -> None:
        log = self.query_one("#live_log", RichLog)
        log.clear()
        c = self.current()
        for plain, text in self.live_lines:
            if self.live_filter and c is not None and c.name not in plain:
                continue
            log.write(text)

    def _drain(self) -> None:
        changed = False
        try:
            while True:
                line = self.events.get_nowait()
                self._log(line)
                changed = True
        except _queue.Empty:
            pass
        try:
            while True:
                draft = self.review_queue.get_nowait()
                self.notify(f"Neuer Entwurf: {draft.name}", title="KI-Feedback", timeout=6)
                changed = True
        except _queue.Empty:
            pass
        if changed:
            self.reload_all()

    # ── Status-Zeile ──────────────────────────────────────────────────────────

    @work(thread=True, exclusive=True, group="daemon_poll")
    def _poll_daemon(self) -> None:
        state = model.daemon_state()
        self.call_from_thread(self._set_daemon, state)

    def _set_daemon(self, state: str) -> None:
        self.daemon = state

    def _render_status(self) -> None:
        t = Text()
        up = self.daemon == "active"
        t.append("Daemon ")
        t.append("● läuft" if up else f"○ {self.daemon}", style="green" if up else "red")
        open_n = sum(c.open_drafts for c in self.clients)
        t.append("   Entwürfe offen ")
        t.append(str(open_n), style="bold yellow" if open_n else "dim")
        t.append("   Gap-Check ")
        if self.gap_running:
            t.append("läuft…", style="yellow")
        elif self.next_gap:
            left = max(0, int(self.next_gap - time.time()))
            t.append(f"in {left // 60}:{left % 60:02d}", style="dim")
        else:
            t.append("aus", style="dim")
        t.append(f"   Sortierung {SORT_LABEL[self.sort_mode]}")
        if self.live_filter and self.current():
            t.append(f"   Filter: {self.current().name}", style="cyan")
        if self.show_closed:
            t.append("   +Erledigte", style="dim")
        self.query_one("#status", Static).update(t)

    # ── Gap-Check / Pull / Daemon ─────────────────────────────────────────────

    def _gap_tick(self) -> None:
        if self.next_gap and time.time() >= self.next_gap and not self.gap_running:
            self.next_gap = time.time() + self.gap_interval
            self.run_gap([c for c in self.clients if c.coaching])

    @work(thread=True, exclusive=True, group="gap")
    def run_gap(self, targets: list) -> None:
        from fitness.catalog.agent.coach_ai import check_training_gap
        from .gap_check import _check_one_client

        self.call_from_thread(setattr, self, "gap_running", True)
        try:
            for c in targets:
                try:
                    _check_one_client(c.meta, self.events, check_training_gap)
                except Exception as exc:
                    self.events.put(event_line("red", "Fehler", c.name, f"Gap-Check: {exc}"))
            self.events.put(event_line("dim", "Gap-Check fertig", f"{len(targets)} Klient(en)", ""))
        finally:
            self.call_from_thread(setattr, self, "gap_running", False)

    @work(thread=True, exclusive=True, group="pull")
    def run_pull(self) -> None:
        self.events.put(event_line("dim", "Pull", "Firestore → lokal", " ".join(PULL_CMD)))
        try:
            r = subprocess.run(PULL_CMD, capture_output=True, text=True, timeout=600)
            tail = [ln for ln in (r.stdout + r.stderr).strip().splitlines() if ln][-3:]
            self.events.put(event_line("green" if r.returncode == 0 else "red",
                                       "Pull fertig" if r.returncode == 0 else f"Pull Fehler rc={r.returncode}",
                                       "Firestore", " | ".join(tail)))
        except Exception as exc:
            self.events.put(event_line("red", "Pull Fehler", "Firestore", str(exc)))

    @work(thread=True, exclusive=True, group="daemon_toggle")
    def run_daemon_toggle(self) -> None:
        state = model.daemon_state()
        verb = "stop" if state == "active" else "start"
        r = subprocess.run(["systemctl", "--user", verb, DAEMON_UNIT], capture_output=True, text=True)
        self.events.put(event_line("green" if r.returncode == 0 else "red", f"Daemon {verb}", DAEMON_UNIT,
                                   (r.stderr or r.stdout).strip()))
        self.call_from_thread(self._set_daemon, model.daemon_state())

    # ── Aktionen ──────────────────────────────────────────────────────────────

    def action_tab(self, name: str) -> None:
        self.query_one(TabbedContent).active = name

    def _review(self, status: str, label: str) -> None:
        d = self._selected_draft()
        if d is None:
            return
        if d.get("status") in model.CLOSED:
            self.notify("Schon erledigt", severity="warning")
            return
        path = find_draft_path(d["uid"], d["id"])
        if path is None:
            self.notify("Entwurf-Datei nicht gefunden", severity="error")
            return
        mark_status(path, status)
        self.events.put(event_line("green" if status == "approved" else "dim", label, d.get("name", "?"),
                                   (d.get("text") or "")[:80]))
        self.reload_all()

    def action_approve(self) -> None:
        self._review("approved", "Freigegeben")

    def action_discard(self) -> None:
        self._review("discarded", "Verworfen")

    def action_copy(self) -> None:
        d = self._selected_draft()
        if d is None:
            return
        text = str(d.get("text") or "")
        if shutil.which("wl-copy"):
            subprocess.run(["wl-copy"], input=text, text=True)
        else:
            self.copy_to_clipboard(text)
        self.notify(f"{len(text)} Zeichen kopiert", timeout=3)

    def action_gap_selected(self) -> None:
        c = self.current()
        if c is None:
            return
        self.events.put(event_line("dim", "Gap-Check", c.name, "manuell gestartet"))
        self.run_gap([c])

    def action_gap_all(self) -> None:
        self.run_gap([c for c in self.clients if c.coaching])

    def action_pull(self) -> None:
        self.run_pull()

    def action_daemon(self) -> None:
        self.run_daemon_toggle()

    def action_sort(self) -> None:
        self.sort_mode = SORT_MODES[(SORT_MODES.index(self.sort_mode) + 1) % len(SORT_MODES)]
        self._fill_clients()

    def action_filter(self) -> None:
        self.live_filter = not self.live_filter
        self._rebuild_live()

    def action_closed(self) -> None:
        self.show_closed = not self.show_closed
        self._fill_drafts()

    def action_session_step(self, step: int) -> None:
        self.session_idx = max(0, self.session_idx + step)
        self._show_session()

    def action_reload(self) -> None:
        self._load_registry()
        self.reload_all()

    # ── Auswahl-Events ────────────────────────────────────────────────────────

    def on_data_table_row_highlighted(self, event: DataTable.RowHighlighted) -> None:
        if event.data_table.id == "clients":
            slug = event.row_key.value if event.row_key else None
            if slug and slug != self.selected_slug:
                self.selected_slug = slug
                self.session_idx = 0
                self._show_session()
                self._show_journal()
                if self.live_filter:
                    self._rebuild_live()
        elif event.data_table.id == "drafts_table":
            self._show_draft()


def run_tui(gap_interval: int = 1800, watch: bool = True) -> None:
    from .core import _setup_file_logging

    _setup_file_logging()  # loguru in Datei — Textual besitzt das Terminal
    ConsoleApp(gap_interval=gap_interval, watch=watch).run()
