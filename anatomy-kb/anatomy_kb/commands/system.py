"""system commands — reload_command + doctor_command."""
import yaml
import typer
from rich.table import Table
from rich import box
from rich.text import Text

from anatomy_kb.commands._helpers import (
    ROOT, EXERCISES_DIR, SERVER_PORT, console, init_loader, _gum_log,
)
from anatomy_kb import loader


def reload_command():
    """
    [bold]YAML-Cache leeren[/bold]

    Wenn der Server läuft: POST /api/reload an localhost:9200.
    Wenn der Server nicht läuft: lokalen In-Memory-Cache leeren.

    Nützlich nach dem Editieren von Exercise-YAMLs —
    kein Server-Neustart nötig.
    """
    try:
        import urllib.request
        req = urllib.request.Request(
            f"http://localhost:{SERVER_PORT}/api/reload",
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=3) as resp:
            _gum_log("info", f"Server-Cache geleert → {resp.read().decode().strip()}")
    except Exception as e:
        _gum_log("warn", f"Server nicht erreichbar ({e})")
        init_loader()
        loader.reload()
        _gum_log("info", "Lokaler Cache geleert")


def doctor_command():
    """
    [bold]System-Health prüfen[/bold]

    Prüft alle kritischen Komponenten:

    \b
    - exercises/ Verzeichnis vorhanden
    - YAML-Dateien vorhanden und parsebar
    - Python-Module vorhanden (server.py, loader, models)
    - Server erreichbar auf :9200 (optional)

    Exit-Code 0 wenn alles OK, 1 wenn FAIL vorhanden.
    """
    checks: list[tuple[str, bool, str]] = []

    def check(label: str, ok: bool, detail: str = "") -> None:
        checks.append((label, ok, detail))

    check("exercises_dir", EXERCISES_DIR.exists(), str(EXERCISES_DIR))

    yml_files = []
    if EXERCISES_DIR and EXERCISES_DIR.exists():
        yml_files.extend(EXERCISES_DIR.glob("*.yml"))
        yml_files.extend(EXERCISES_DIR.glob("*.yaml"))
    yml_files = sorted(list(set(yml_files)))
    check("exercises yml", len(yml_files) > 0, f"{len(yml_files)} Dateien")

    parse_errors = []
    for f in yml_files:
        try:
            yaml.safe_load(f.read_text())
        except yaml.YAMLError:
            parse_errors.append(f.name)
    check("yaml parse", len(parse_errors) == 0, ", ".join(parse_errors) if parse_errors else "alle ok")

    check("server.py", (ROOT / "server.py").exists(), "")
    check("anatomy_kb/loader.py", (ROOT / "anatomy_kb" / "loader.py").exists(), "")
    check("anatomy_kb/models.py", (ROOT / "anatomy_kb" / "models.py").exists(), "")

    try:
        import urllib.request
        urllib.request.urlopen(f"http://localhost:{SERVER_PORT}/health", timeout=2)
        check(f"server :{SERVER_PORT}", True, "erreichbar")
    except Exception:
        check(f"server :{SERVER_PORT}", False, "nicht erreichbar — starte mit: anatomy-agent serve")

    table = Table(box=box.ROUNDED, show_header=True, header_style="bold cyan")
    table.add_column("Status", no_wrap=True)
    table.add_column("Check")
    table.add_column("Detail", style="dim")

    for label, ok, detail in checks:
        status = Text("OK", style="bold green") if ok else Text("FAIL", style="bold red")
        table.add_row(status, label, detail)

    console.print()
    console.print(table)
    console.print()

    failed = [c for c in checks if not c[1]]
    if failed:
        _gum_log("error", f"{len(failed)} Check(s) fehlgeschlagen")
        raise typer.Exit(1)
    else:
        _gum_log("info", "anatomy-kb: alles ok")
