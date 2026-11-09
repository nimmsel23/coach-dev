"""fitness-push als Textual-TUI: Empfänger wählen, Nachricht schreiben, senden.

Tasten (Empfängerliste fokussiert):
  ↑/↓ j/k Auswahl · Leertaste an/aus · a alle Bereiten · n keine · s nur ich selbst (Test)
  c Nachricht verfassen · h Verlauf · d Trockenlauf an/aus · r neu laden · ? Hilfe · q Beenden
Überall: Strg+S senden · Strg+D Trockenlauf · Strg+Q Beenden · Tab nächstes Feld
"""
from __future__ import annotations

from rich.text import Text
from textual.app import App, ComposeResult
from textual.binding import Binding
from textual.containers import Horizontal, Vertical, VerticalScroll
from textual.screen import ModalScreen
from textual.widgets import DataTable, Footer, Header, Input, Select, Static, TextArea

from backend.core.clients import Client, load_clients
from backend.pusher import service
from backend.pusher.message import BODY_MAX, TITLE_MAX, Message
from backend.pusher.recipients import Recipient, load_recipients
from backend.pusher.source import PushSource
from backend.pusher.templates import load_templates

BLANK = Select.BLANK


def _devices(n: int) -> str:
    return f"{n} Gerät{'' if n == 1 else 'e'}"


class HelpScreen(ModalScreen):
    BINDINGS = [("escape,q,question_mark", "dismiss", "Zurück")]
    CSS = """
    HelpScreen { align: center middle; background: $background 80%; }
    #help { width: 70; height: auto; padding: 1 3; border: round $accent; background: $surface; }
    """

    def compose(self) -> ComposeResult:
        yield Static(Text(
            "FITNESS PUSH · TASTEN\n\n"
            "Empfängerliste\n"
            "  ↑ ↓ / j k    Auswahl bewegen\n"
            "  Leertaste    Empfänger an/aus (nur wer „bereit“ ist)\n"
            "  a / n        Alle Bereiten / keine\n"
            "  s            Nur ich selbst (Test)\n"
            "  c            Zur Nachricht springen\n"
            "  h            Verlauf der letzten Sendungen\n"
            "  d            Trockenlauf an/aus\n"
            "  r            Empfänger neu laden\n\n"
            "Überall\n"
            "  Strg+S       Senden (mit Bestätigung)\n"
            "  Strg+D       Trockenlauf an/aus\n"
            "  Tab          Nächstes Feld\n"
            "  Strg+Q       Beenden\n\n"
            "Status: bereit · Push aus · keine Geräte · Nachrichten aus\n"
            "Nur „bereit“ kann ausgewählt werden.\n\nEsc schließt diese Hilfe."), id="help")


class ConfirmScreen(ModalScreen[bool]):
    BINDINGS = [("y,enter", "confirm", "Senden"), ("n,escape", "cancel", "Abbrechen")]
    CSS = """
    ConfirmScreen { align: center middle; background: $background 80%; }
    #confirm { width: 72; height: auto; max-height: 90%; padding: 1 3; border: round $accent; background: $surface; }
    """

    def __init__(self, message: Message, chosen: list[Recipient], dry_run: bool, duplicate: bool):
        super().__init__()
        self.message, self.chosen, self.dry_run, self.duplicate = message, chosen, dry_run, duplicate

    def compose(self) -> ComposeResult:
        devices = sum(len(r.tokens) for r in self.chosen)
        head = "TROCKENLAUF — es wird nichts gesendet" if self.dry_run else "ECHT SENDEN"
        lines = [head, "",
                 f"{len(self.chosen)} Empfänger · {_devices(devices)}", ""]
        lines += [f"  • {r.name} ({_devices(len(r.tokens))})" for r in self.chosen[:12]]
        if len(self.chosen) > 12:
            lines.append(f"  … und {len(self.chosen) - 12} weitere")
        lines += ["", f"Titel: {self.message.title}", f"Text:  {self.message.body}", f"Link:  {self.message.link}", ""]
        if self.duplicate and not self.dry_run:
            lines += ["⚠ Dieselbe Nachricht wurde vor kurzem schon gesendet.", ""]
        lines.append("[y/Enter] " + ("Trockenlauf starten" if self.dry_run else "Senden") + "    [n/Esc] Abbrechen")
        yield Static(Text("\n".join(lines)), id="confirm")

    def action_confirm(self) -> None:
        self.dismiss(True)

    def action_cancel(self) -> None:
        self.dismiss(False)


class ResultScreen(ModalScreen):
    BINDINGS = [("escape,q,enter", "dismiss", "Schließen")]
    CSS = """
    ResultScreen { align: center middle; background: $background 80%; }
    #result { width: 74; height: auto; max-height: 90%; padding: 1 3; border: round $accent; background: $surface; }
    """

    def __init__(self, report: service.Report):
        super().__init__()
        self.report = report

    def compose(self) -> ComposeResult:
        r = self.report
        title = "TROCKENLAUF-ERGEBNIS" if r.dry_run else "GESENDET"
        lines = [title, "", f"{r.reached} Empfänger erreicht · {r.sent} Geräte · {r.failed} fehlgeschlagen", ""]
        for row in r.rows:
            if row.skipped:
                lines.append(f"  –  {row.name}: übersprungen ({row.skipped})")
            else:
                extra = f", {row.removed} tote Tokens entfernt" if row.removed else ""
                mark = "✔" if row.failed == 0 else "!"
                lines.append(f"  {mark}  {row.name}: {row.sent}/{row.devices} Geräte{extra}")
        lines += ["", "Esc schließt."]
        yield Static(Text("\n".join(lines)), id="result")


class HistoryScreen(ModalScreen):
    BINDINGS = [("escape,q,h", "dismiss", "Schließen")]
    CSS = """
    HistoryScreen { align: center middle; background: $background 80%; }
    #history-box { width: 100; height: 80%; padding: 1 2; border: round $accent; background: $surface; }
    """

    def __init__(self, entries: list[dict]):
        super().__init__()
        self.entries = entries

    def compose(self) -> ComposeResult:
        with Vertical(id="history-box"):
            yield Static(Text("VERLAUF · letzte Sendungen (Esc schließt)"))
            yield DataTable(id="history", cursor_type="row", zebra_stripes=True)

    def on_mount(self) -> None:
        table = self.query_one("#history", DataTable)
        table.add_columns("Zeit", "Modus", "Titel", "Erreicht", "Empfänger")
        for e in self.entries:
            rows = e.get("rows", [])
            reached = sum(1 for r in rows if not r.get("skipped") and r.get("sent", 0) > 0)
            names = ", ".join(r["name"] for r in rows if not r.get("skipped"))[:40]
            table.add_row(str(e.get("at", ""))[:16].replace("T", " "), "Trocken" if e.get("dry_run") else "Echt",
                          str(e.get("title", ""))[:30], f"{reached}/{len(rows)}", names)
        if not self.entries:
            table.add_row("–", "", "Noch nichts gesendet", "", "")


class PushApp(App):
    TITLE = "Fitness Push"
    CSS = """
    #left { width: 46%; }
    #right { width: 54%; padding: 0 1; }
    #recipients { height: 1fr; }
    #summary, #hint, #mode { height: auto; padding: 0 1; }
    #body { height: 8; }
    .label { margin-top: 1; color: $text-muted; }
    """
    BINDINGS = [
        Binding("space", "toggle", "An/Aus"),
        Binding("a", "select_all", "Alle"),
        Binding("n", "select_none", "Keine"),
        Binding("s", "select_self", "Nur ich"),
        Binding("c", "compose_focus", "Verfassen"),
        Binding("h", "history", "Verlauf"),
        Binding("d", "toggle_dry", "Trockenlauf"),
        Binding("r", "reload", "Neu laden"),
        Binding("question_mark", "help", "Hilfe"),
        Binding("q", "quit", "Beenden"),
        Binding("ctrl+s", "send", "Senden", priority=True),
        Binding("ctrl+d", "toggle_dry", "Trockenlauf", priority=True, show=False),
        Binding("ctrl+q", "quit", "Beenden", priority=True, show=False),
    ]

    def __init__(self, source: PushSource, registry: dict[str, Client] | None = None, history=None,
                 templates: dict[str, Message] | None = None, dry_run: bool = False, discover: bool = True):
        super().__init__()
        self.source = source
        self.registry = load_clients() if registry is None else registry
        self.history = history
        self.templates = load_templates() if templates is None else templates
        self.dry_run = dry_run
        self.discover = discover
        self.recipients: list[Recipient] = []
        self.selected: set[str] = set()
        self.busy = False
        self.load_error = ""

    # ── Aufbau ───────────────────────────────────────────────────────────────

    def compose(self) -> ComposeResult:
        yield Header()
        with Horizontal():
            with Vertical(id="left"):
                yield DataTable(id="recipients", cursor_type="row", zebra_stripes=True)
                yield Static("", id="summary")
            with VerticalScroll(id="right"):
                yield Static("Vorlage", classes="label")
                yield Select([(name, name) for name in self.templates], prompt="Vorlage wählen …", id="template")
                yield Static("Titel", classes="label")
                yield Input(placeholder="Titel der Nachricht", id="title", max_length=TITLE_MAX + 20)
                yield Static("Text", classes="label")
                yield TextArea(id="body")
                yield Static("Link (optional, / = App öffnen)", classes="label")
                yield Input(placeholder="/", id="link")
                yield Static("", id="hint")
                yield Static("", id="mode")
        yield Footer()

    def on_mount(self) -> None:
        table = self.query_one("#recipients", DataTable)
        table.add_columns(" ", "Name", "Geräte", "Status")
        table.focus()
        self._refresh_header()
        self._update_hint()
        self.action_reload()

    def _refresh_header(self) -> None:
        self.sub_title = "TROCKENLAUF" if self.dry_run else "ECHT"
        mode = "Trockenlauf: es wird nichts gesendet." if self.dry_run else "Echt: Strg+S sendet nach Bestätigung."
        self.query_one("#mode", Static).update(Text(mode, style="yellow" if self.dry_run else "green"))

    # ── Empfänger ────────────────────────────────────────────────────────────

    def action_reload(self) -> None:
        self.query_one("#summary", Static).update("Lade Empfänger …")
        self.run_worker(self._load, thread=True, exit_on_error=False, name="load", exclusive=True)

    def _load(self) -> None:
        try:
            recipients = load_recipients(self.source, self.registry, discover=self.discover)
            error = ""
        except Exception as exc:
            recipients, error = [], f"Laden fehlgeschlagen: {exc}"
        self.call_from_thread(self._set_recipients, recipients, error)

    def _set_recipients(self, recipients: list[Recipient], error: str) -> None:
        self.recipients, self.load_error = recipients, error
        self.selected &= {r.uid for r in recipients if r.eligible}
        self._render_table()

    def _render_table(self) -> None:
        table = self.query_one("#recipients", DataTable)
        row = table.cursor_row
        table.clear()
        for r in self.recipients:
            mark = "●" if r.uid in self.selected else ("○" if r.eligible else " ")
            name = r.name + (" (ich)" if r.is_coach else "")
            style = "" if r.eligible else "dim"
            table.add_row(Text(mark, style="green" if r.uid in self.selected else style), Text(name, style=style),
                          Text(str(len(r.tokens)), style=style), Text(r.status, style=style), key=r.uid)
        if self.recipients:
            table.move_cursor(row=min(row, len(self.recipients) - 1))
        self._update_summary()

    def _update_summary(self) -> None:
        eligible = [r for r in self.recipients if r.eligible]
        chosen = self._chosen()
        text = self.load_error or (f"{len(chosen)} ausgewählt · {_devices(sum(len(r.tokens) for r in chosen))}"
                                   f"  ·  {len(eligible)} von {len(self.recipients)} bereit")
        self.query_one("#summary", Static).update(Text(text, style="red" if self.load_error else ""))

    def _chosen(self) -> list[Recipient]:
        return [r for r in self.recipients if r.uid in self.selected]

    def _cursor_recipient(self) -> Recipient | None:
        table = self.query_one("#recipients", DataTable)
        if not self.recipients or table.cursor_row is None:
            return None
        return self.recipients[table.cursor_row]

    def action_toggle(self) -> None:
        r = self._cursor_recipient()
        if r is None:
            return
        if not r.eligible:
            self.notify(f"{r.name}: {r.status} — kann nichts empfangen", severity="warning")
            return
        self.selected ^= {r.uid}
        self._render_table()

    def action_select_all(self) -> None:
        self.selected = {r.uid for r in self.recipients if r.eligible}
        self._render_table()

    def action_select_none(self) -> None:
        self.selected = set()
        self._render_table()

    def action_select_self(self) -> None:
        me = [r for r in self.recipients if r.is_coach]
        if not me:
            self.notify("Kein Coach in der Klienten-Registry gefunden", severity="warning")
            return
        if not me[0].eligible:
            self.notify(f"Du selbst: {me[0].status} — Push erst im Setup-Tab aktivieren", severity="warning")
            return
        self.selected = {me[0].uid}
        self._render_table()

    # ── Nachricht ────────────────────────────────────────────────────────────

    def message(self) -> Message:
        return Message(self.query_one("#title", Input).value, self.query_one("#body", TextArea).text,
                       self.query_one("#link", Input).value)

    def _update_hint(self) -> None:
        m = self.message()
        problems = m.problems() if (m.title.strip() or m.body.strip()) else []
        info = f"Titel {len(m.title.strip())}/{TITLE_MAX} · Text {len(m.body.strip())}/{BODY_MAX}"
        self.query_one("#hint", Static).update(Text(("⚠ " + "; ".join(problems)) if problems else info,
                                                    style="red" if problems else "dim"))

    def on_input_changed(self, event: Input.Changed) -> None:
        self._update_hint()

    def on_text_area_changed(self, event: TextArea.Changed) -> None:
        self._update_hint()

    def on_select_changed(self, event: Select.Changed) -> None:
        if event.value is BLANK or event.value not in self.templates:
            return
        template = self.templates[event.value]
        self.query_one("#title", Input).value = template.title
        self.query_one("#body", TextArea).text = template.body
        self.query_one("#link", Input).value = template.link
        self._update_hint()

    def action_compose_focus(self) -> None:
        self.query_one("#title", Input).focus()

    # ── Senden ───────────────────────────────────────────────────────────────

    def action_toggle_dry(self) -> None:
        self.dry_run = not self.dry_run
        self._refresh_header()

    def action_send(self) -> None:
        if self.busy:
            return
        chosen = self._chosen()
        if not chosen:
            self.notify("Keine Empfänger ausgewählt (Leertaste, a = alle Bereiten)", severity="warning")
            return
        message = self.message()
        problems = message.problems()
        if problems:
            self.notify("; ".join(problems), severity="error")
            return
        message = message.validate()
        duplicate = service.recent_duplicate(message, self.history)

        def decided(ok: bool | None) -> None:
            if ok:
                self.busy = True
                self.notify("Sende …" if not self.dry_run else "Trockenlauf …")
                self.run_worker(lambda: self._send(chosen, message, self.dry_run), thread=True,
                                exit_on_error=False, name="send")

        self.push_screen(ConfirmScreen(message, chosen, self.dry_run, duplicate), decided)

    def _send(self, chosen: list[Recipient], message: Message, dry_run: bool) -> None:
        try:
            report = service.send(self.source, chosen, message, dry_run=dry_run, history=self.history)
        except Exception as exc:
            self.call_from_thread(self._send_failed, str(exc))
            return
        self.call_from_thread(self._send_done, report)

    def _send_failed(self, error: str) -> None:
        self.busy = False
        self.notify(f"Senden fehlgeschlagen: {error}", severity="error", timeout=10)

    def _send_done(self, report: service.Report) -> None:
        self.busy = False
        self.push_screen(ResultScreen(report))
        if not report.dry_run:
            self.action_reload()         # tote Tokens sind jetzt weg

    # ── Sonstiges ────────────────────────────────────────────────────────────

    def action_history(self) -> None:
        self.push_screen(HistoryScreen(service.read_history(self.history)))

    def action_help(self) -> None:
        self.push_screen(HelpScreen())
