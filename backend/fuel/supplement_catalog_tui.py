"""Supplement-Catalog-TUI — volles CRUD auf fuel/catalogs/supplements/catalog.yaml.

Getrennt von supplement.py (das nur Intake-Logs verwaltet, log/today/unlog/edit) —
hier geht es um den Katalog selbst: welche Supplements es überhaupt gibt,
mit welcher Standarddosis/Uhrzeit/Micros.
"""
from __future__ import annotations

from pathlib import Path

from textual.app import App, ComposeResult
from textual.binding import Binding
from textual.containers import Horizontal, Vertical
from textual.screen import ModalScreen
from textual.widgets import DataTable, Footer, Header, Input, Label, Static
from .supplement_catalog import CATALOG_PATH
from .supplement_catalog import load_catalog_file as _load
from .supplement_catalog import make_catalog_id as _make_id
from .supplement_catalog import save_catalog_file as _save


class EditModal(ModalScreen[dict | None]):
    """Add/Edit-Formular. Gibt das bearbeitete Item zurück oder None bei Abbruch."""

    BINDINGS = [Binding("escape", "cancel", "Abbrechen")]

    FIELDS = [
        ("id", "ID (eindeutig)"),
        ("name", "Name"),
        ("product", "Produkt (optional)"),
        ("unit", "Einheit (mg/g/...)"),
        ("default_dose", "Standarddosis"),
        ("default_time_of_day", "Uhrzeit (morning/evening/night/any)"),
    ]

    def __init__(self, item: dict | None = None):
        super().__init__()
        self._item = item or {}
        self._is_new = item is None

    def compose(self) -> ComposeResult:
        with Vertical(id="modal-box"):
            yield Label("Supplement anlegen" if self._is_new else f"Supplement bearbeiten: {self._item.get('id')}")
            for key, label in self.FIELDS:
                yield Label(label)
                val = "" if self._item.get(key) is None else str(self._item.get(key))
                inp = Input(value=val, id=f"field-{key}", disabled=(key == "id" and not self._is_new))
                yield inp
            yield Label("[enter] speichern   [esc] abbrechen", id="hint")

    def on_input_submitted(self, event: Input.Submitted) -> None:
        self._submit()

    def action_cancel(self) -> None:
        self.dismiss(None)

    def _submit(self) -> None:
        result = dict(self._item)
        for key, _label in self.FIELDS:
            inp = self.query_one(f"#field-{key}", Input)
            val = inp.value.strip()
            if key == "default_dose" and val:
                try:
                    val = float(val) if "." in val else int(val)
                except ValueError:
                    pass
            if val == "":
                result.pop(key, None)
            else:
                result[key] = val
        if not result.get("id"):
            result["id"] = _make_id(result.get("name", ""))
        if not result.get("name"):
            self.query_one("#hint", Label).update("[red]Name ist Pflicht[/red]   [esc] abbrechen")
            return
        self.dismiss(result)


class ConfirmModal(ModalScreen[bool]):
    BINDINGS = [Binding("escape", "no", "Nein"), Binding("y", "yes", "Ja"), Binding("n", "no", "Nein")]

    def __init__(self, question: str):
        super().__init__()
        self._question = question

    def compose(self) -> ComposeResult:
        with Vertical(id="modal-box"):
            yield Label(self._question)
            yield Label("[y] ja   [n/esc] nein")

    def action_yes(self) -> None:
        self.dismiss(True)

    def action_no(self) -> None:
        self.dismiss(False)


class SupplementCatalogTUI(App):
    CSS = """
    #modal-box {
        width: 60;
        height: auto;
        border: round $accent;
        background: $surface;
        padding: 1 2;
        margin: 1;
    }
    #hint { color: $text-muted; margin-top: 1; }
    DataTable { height: 1fr; }
    """

    BINDINGS = [
        Binding("a", "add", "Add"),
        Binding("e", "edit", "Edit"),
        Binding("d", "delete", "Delete"),
        Binding("r", "reload", "Reload"),
        Binding("q", "quit", "Quit"),
    ]

    def __init__(self, path: Path = CATALOG_PATH):
        super().__init__()
        self.path = path
        self.data = _load(path)

    def compose(self) -> ComposeResult:
        yield Header(show_clock=False)
        yield DataTable(id="table")
        yield Static(f"Katalog: {self.path}", id="status")
        yield Footer()

    def on_mount(self) -> None:
        table = self.query_one(DataTable)
        table.cursor_type = "row"
        table.add_columns("ID", "Name", "Produkt", "Dosis", "Zeit")
        self._reload_table()

    def _reload_table(self) -> None:
        table = self.query_one(DataTable)
        table.clear()
        for item in self.data["items"]:
            dose = f"{item.get('default_dose', '')}{item.get('unit', '')}"
            table.add_row(
                item.get("id", ""),
                item.get("name", ""),
                item.get("product", ""),
                dose,
                item.get("default_time_of_day", ""),
                key=item.get("id"),
            )

    def _current_item(self) -> dict | None:
        table = self.query_one(DataTable)
        if table.row_count == 0 or table.cursor_row is None:
            return None
        row_key = table.coordinate_to_cell_key(table.cursor_coordinate).row_key.value
        return next((i for i in self.data["items"] if i.get("id") == row_key), None)

    def action_add(self) -> None:
        def _cb(result: dict | None) -> None:
            if result is None:
                return
            if any(i.get("id") == result["id"] for i in self.data["items"]):
                self.query_one("#status", Static).update(f"[red]ID '{result['id']}' existiert bereits[/red]")
                return
            self.data["items"].append(result)
            _save(self.path, self.data)
            self._reload_table()
            self.query_one("#status", Static).update(f"[green]{result['name']} angelegt + gespeichert[/green]")

        self.push_screen(EditModal(None), _cb)

    def action_edit(self) -> None:
        item = self._current_item()
        if item is None:
            return

        def _cb(result: dict | None) -> None:
            if result is None:
                return
            idx = next(i for i, x in enumerate(self.data["items"]) if x.get("id") == item["id"])
            self.data["items"][idx] = result
            _save(self.path, self.data)
            self._reload_table()
            self.query_one("#status", Static).update(f"[green]{result['name']} aktualisiert + gespeichert[/green]")

        self.push_screen(EditModal(item), _cb)

    def action_delete(self) -> None:
        item = self._current_item()
        if item is None:
            return

        def _cb(confirmed: bool) -> None:
            if not confirmed:
                return
            self.data["items"] = [i for i in self.data["items"] if i.get("id") != item["id"]]
            _save(self.path, self.data)
            self._reload_table()
            self.query_one("#status", Static).update(f"[yellow]{item['name']} gelöscht[/yellow]")

        self.push_screen(ConfirmModal(f"'{item['name']}' wirklich löschen?"), _cb)

    def action_reload(self) -> None:
        self.data = _load(self.path)
        self._reload_table()
        self.query_one("#status", Static).update("[blue]neu geladen[/blue]")


def main() -> None:
    SupplementCatalogTUI().run()


if __name__ == "__main__":
    main()
