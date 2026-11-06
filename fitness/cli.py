"""
fitness — Domain CLI für alle Fitness-Subcommands.

  fitness agent <cmd>    fitness.catalog CLI (fitness-catalog) — audit|teach|push|watch|...
  fitness catalog        Catalog-TUI (Rich-Prompt, tui.py) — Dashboard/Inbox (Neuzugänge)/Browser/Plan/Lesson/History
  fitness tui            Session-Dashboard-TUI (Textual, fitness-tui) — hat NICHTS mit dem Katalog zu tun
  fitness kb    <cmd>    anatomy-kb kbctl (:9200)
  fitness mail  <cmd>    Fitbit Gmail Pipeline
  fitness log   <cmd>    Session-Log aus Dateien (kein Server) + add/wizard zum Kraft-Session-Loggen (merged statt overwrite)
  fitness activity <cmd> Cardio/Activity loggen
  fitness sync  <cmd>    KB-Sync + Firestore-Sync (kb|pull|push|watch|all) → fitness-sync
  fitness user-data <cmd> Runtime-Userdaten/SQLite-History prüfen und gezielt patchen
  fitness coach <cmd>    Klienten-Workout loggen (~/Klienten/<id>/)
  fitness health         /health aller Services
  fitness status         systemd-Units Übersicht
  fitness coverage       Muskelabdeckung
  fitness gaps           Unterbeanspruchte Muskeln
  fitness search <q>     Übungssuche
  fitness session <sub>  Session queries (today|get|list)
  fitness journal <sub>  Journal queries (today|get|list)
  fitness enrich-watch   AI Enricher Watcher als Hintergrund-Daemon starten

Server/Service-Control → use: fitnessctl
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Optional

import typer

from fitness.runtime.cli import app as runtime_user_data_app
from fitness.coach.cli import app as coach_app

# ── Pfade ──────────────────────────────────────────────────────────────────────
FITNESS_DEV  = Path(__file__).resolve().parent.parent

if str(FITNESS_DEV) not in sys.path:
    sys.path.insert(0, str(FITNESS_DEV))
ANATOMY_KB   = FITNESS_DEV / "anatomy-kb"
KBCTL        = FITNESS_DEV / "anatomy-kb" / "kbctl"
FITNESSCTL   = FITNESS_DEV / "fitnessctl"

# "catalog" ist ein Symlink auf fitness/catalog (repo-root, siehe ./catalog).
# "-m catalog <cmd>" braucht dafür kein extra PYTHONPATH mehr — Python legt bei
# "-m" automatisch das aktuelle Arbeitsverzeichnis auf sys.path, und FITNESS_DEV
# (wo der Symlink liegt) ist ohnehin das cwd aller subprocess-Aufrufe unten.

DEV_PORT    = int(os.environ.get("FITNESS_PORT", 9100))
KB_PORT     = int(os.environ.get("ANATOMY_KB_PORT", 9200))
PYTHON_PORT = int(os.environ.get("FITNESS_PYTHON_PORT", 9150))

# ── gum-Helpers ────────────────────────────────────────────────────────────────
def _has_gum() -> bool:
    return bool(shutil.which("gum"))

def gum_header(title: str) -> None:
    if _has_gum():
        subprocess.run(["gum", "style", "--foreground=212", "--bold", title])
    else:
        print(f"\n\033[1;35m{title}\033[0m")

def gum_table(header: list[str], rows: list[list[str]], widths: list[int]) -> None:
    lines = [",".join(header)] + [",".join(r) for r in rows]
    if _has_gum():
        subprocess.run(
            ["gum", "table", "--print", "--separator=,",
             f"--widths={','.join(map(str, widths))}"],
            input="\n".join(lines), text=True,
        )
    else:
        fmt = "  " + "  ".join(f"{{:<{w}}}" for w in widths)
        for line in lines:
            print(fmt.format(*line.split(",", len(widths) - 1)))

def gum_log(level: str, msg: str) -> None:
    if _has_gum():
        subprocess.run(["gum", "log", f"--level={level}", msg])
    else:
        colors = {"info": "\033[1;32m", "warn": "\033[1;33m", "error": "\033[1;31m"}
        dest = sys.stderr if level == "error" else sys.stdout
        print(f"{colors.get(level, '')}{msg}\033[0m", file=dest)

# ── Pass-through ───────────────────────────────────────────────────────────────
def passthrough(binary: Path | str, args: list[str], label: str) -> None:
    import shutil
    resolved = shutil.which(str(binary)) or (str(binary) if Path(str(binary)).exists() else None)
    if not resolved:
        gum_log("error", f"{label} nicht gefunden")
        raise SystemExit(1)
    os.execv(resolved, [resolved] + args)

# ── Systemd-Helpers ────────────────────────────────────────────────────────────
def systemctl(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run(["systemctl", "--user", *args], capture_output=True, text=True)

def unit_active(unit: str) -> str:
    return systemctl("is-active", unit).stdout.strip() or "unknown"

# ── Health ─────────────────────────────────────────────────────────────────────
SERVICES = [
    (DEV_PORT,    "fitness-dev (Node)",      "fitness-dev.service"),
    (PYTHON_PORT, "fitness-api (FastAPI)",   "fitness-api.service"),
    (KB_PORT,     "anatomy-kb (aiohttp)",    None),
]

def _ping(port: int) -> str:
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/health", timeout=3) as r:
            json.loads(r.read())
        return "ok"
    except Exception:
        return "down"

def cmd_health() -> None:
    rows, fail = [], False
    for port, label, unit in SERVICES:
        status = _ping(port)
        unit_state = unit_active(unit) if unit else "—"
        rows.append([str(port), label, status, unit_state])
        if status == "down":
            fail = True
    gum_header("fitness — health")
    gum_table(["PORT", "SERVICE", "HTTP", "SYSTEMD"], rows, [6, 26, 6, 12])
    if fail:
        raise SystemExit(1)

def cmd_status() -> None:
    # fitness-firestore-mirror.service ist retired (seit 9c9fb3e in server.mjs
    # eingebettet, siehe fitness-dev.service) — deshalb nicht mehr gelistet.
    units = [
        ("fitness-dev.service",  "DEV Node :9100"),
        ("fitness-api.service",  "DEV Python :9150"),
        ("fitness-mail.timer",   "Fitbit Mail Timer"),
    ]
    rows = []
    for unit, label in units:
        active = unit_active(unit)
        rows.append([label, unit, active])
    gum_header("fitness — systemd")
    gum_table(["SERVICE", "UNIT", "STATUS"], rows, [28, 36, 10])

# ── Typer App ──────────────────────────────────────────────────────────────────
_ctx = {"allow_extra_args": True, "ignore_unknown_options": True}

app = typer.Typer(
    name="fitness",
    help=__doc__,
    invoke_without_command=True,
    no_args_is_help=True,
)
app.add_typer(runtime_user_data_app, name="user-data")
app.add_typer(coach_app, name="coach")

@app.command(context_settings=_ctx, help="fitness.catalog CLI (audit|teach|resolve|log|history|report|plan|...) — für alles außer der TUI selbst, siehe: fitness catalog")
def agent(ctx: typer.Context) -> None:
    passthrough(Path("fitness-catalog"), ctx.args, "fitness-catalog")

@app.command(help="Catalog-TUI direkt öffnen — Dashboard/Inbox (Neuzugänge review)/Browser/Plan/Lesson/History. Für die andere (Session-Dashboard-)TUI: fitness tui")
def catalog(
    screen: str = typer.Option("dashboard", "--screen", help="Start-Screen (dashboard|inbox|browser|plan|lesson|history)"),
) -> None:
    from fitness.catalog.tui import run_tui
    run_tui(initial_screen=screen)

@app.command(context_settings=_ctx, help="anatomy-kb kbctl :9200 (start|stop|status|health|logs|list|resolve)")
def kb(ctx: typer.Context) -> None:
    passthrough(KBCTL, ctx.args, "kbctl")

# Server-/Service-Control gehört NICHT hierher (siehe Docstring oben:
# "Server/Service-Control → use: fitnessctl") — "fitness" bleibt die reine
# Domain-CLI (Sessions, Coverage, Katalog...). Damit man trotzdem nicht
# zwischen zwei Kommandos wechseln muss, reichen "prod"/"dev" hier nur
# durch: ctx.args sind alle Wörter NACH "prod"/"dev" (z.B. bei
# "fitness prod logs node" ist ctx.args == ["logs", "node"]), die hängen
# wir einfach vor fitnessctl dran und übergeben das 1:1 weiter.
@app.command(context_settings=_ctx, help="Prod-Stack Control (status|logs|restart|deploy) — Passthrough zu: fitnessctl prod")
def prod(ctx: typer.Context) -> None:
    passthrough(FITNESSCTL, ["prod"] + ctx.args, "fitnessctl prod")

@app.command(context_settings=_ctx, help="Dev-Stack Control (status|start|stop|restart|logs|deploy|...) — Passthrough zu: fitnessctl dev")
def dev(ctx: typer.Context) -> None:
    passthrough(FITNESSCTL, ["dev"] + ctx.args, "fitnessctl dev")

@app.command(context_settings=_ctx, help="Fitbit Gmail Pipeline (poll|parse|show)")
def mail(ctx: typer.Context) -> None:
    passthrough("fitness-mail", ctx.args, "fitness-mail")

@app.command(context_settings=_ctx, help="Session-Log direkt aus Dateien (ls|show|week|history|stats|sync-status|add|wizard) — kein Server nötig, add/wizard schreiben")
def log(ctx: typer.Context) -> None:
    passthrough("fitness-log", ctx.args, "fitness-log")

@app.command(context_settings=_ctx, help="Textual TUI Dashboard (Log/Woche/Stats/Sync/Clients, kein Server)")
def tui(ctx: typer.Context) -> None:
    passthrough("fitness-tui", ctx.args, "fitness-tui")

@app.command(context_settings=_ctx, help="Cardio/Activity loggen (log|types|whoami) — z.B. fitness activity log swimming -d 20 -s breast")
def activity(ctx: typer.Context) -> None:
    passthrough("fitness-activity", ctx.args, "fitness-activity")

@app.command(context_settings=_ctx, help="KB-Sync + Firestore-Sync (kb|pull|push|watch|all) — siehe fitness/sync/cli.py")
def sync(ctx: typer.Context) -> None:
    passthrough("fitness-sync", ctx.args, "fitness-sync")

@app.command(help="Health-Check: fitness-dev :9100 + anatomy-kb :9200")
def health() -> None:
    cmd_health()

@app.command(help="systemd-Units Übersicht")
def status() -> None:
    cmd_status()

# ── Backend helpers (direct first, HTTP fallback) ─────────────────────────────

def _sessions_dir() -> Path:
    from fitness.paths import sessions_dir
    return sessions_dir()

def _journal_dir() -> Path:
    from fitness.paths import sessions_dir
    base = sessions_dir().parent
    return base / "journal"

def _try_http(fn_name: str, *args, **kwargs):
    """HTTP-Fallback via fitness.http."""
    from fitness.http import api_get  # noqa: F401 (triggers import check)
    import fitness.http as _http
    return getattr(_http, fn_name)(*args, **kwargs)

# ── Domain Commands ────────────────────────────────────────────────────────────

@app.command()
def coverage(days: int = typer.Option(7, "-d", help="Tage zurückblicken")) -> None:
    """Muskelabdeckung der letzten N Tage (direkt via catalog, HTTP-Fallback)."""
    try:
        from fitness.catalog.coverage import get_coverage_summary
        data = get_coverage_summary(days=days)
        for g in data.get("groups", []):
            score = sum(m["totalScore"] for m in g["muscles"])
            bar = "█" * int(score * 2)
            print(f"  {g['id']:12s} {score:5.1f}  {bar}")
    except Exception:
        data = _try_http("coverage", days)
        for g in data.get("groups", []):
            score = sum(m["totalScore"] for m in g["muscles"])
            bar = "█" * int(score * 2)
            print(f"  {g['id']:12s} {score:5.1f}  {bar}")


@app.command()
def gaps(days: int = typer.Option(7, "-d", help="Tage zurückblicken")) -> None:
    """Unterbeanspruchte Muskeln (direkt via catalog, HTTP-Fallback)."""
    try:
        from fitness.catalog.coverage import get_coverage_gaps
        result = get_coverage_gaps(days=days).get("gaps", [])
    except Exception:
        result = _try_http("gaps", days).get("gaps", [])
    if not result:
        gum_log("info", "Keine Gaps")
    else:
        for g in result:
            print(f"  {g['name']:14s} ({g['hits']} hits)")


@app.command()
def search(query: str = typer.Argument(..., help="Suchbegriff")) -> None:
    """Übungssuche (direkt via catalog Resolver, HTTP-Fallback)."""
    try:
        from fitness.catalog.core.resolver import search_exercises
        results = search_exercises(query)
    except Exception:
        results = _try_http("search", query).get("results", [])
    for r in results:
        muscles = " ".join(r.get("primaryMuscles", []))
        print(f"  {r['name']:30s} {muscles}")


@app.command("enrich-watch")
def enrich_watch() -> None:
    """AI Enricher Watcher (fitness.catalog.cli watch) als Hintergrund-Daemon starten.

    Anders als "fitness agent watch" (Vordergrund, blockierend) läuft das hier
    als Popen im Hintergrund mit Pidfile-Tracking — für Systemd-freies
    "starten und weitermachen".
    """
    pidfile = Path("/tmp/fitness-enricher.pid")
    logfile = Path("/tmp/fitness-enricher.log")
    if pidfile.exists():
        try:
            pid = int(pidfile.read_text().strip())
            os.kill(pid, 0)
            gum_log("warn", f"Watcher läuft bereits (PID {pid})")
            return
        except (ProcessLookupError, ValueError):
            pidfile.unlink(missing_ok=True)
    proc = subprocess.Popen(
        [sys.executable, "-m", "catalog", "watch"],
        cwd=FITNESS_DEV,
        stdout=open(logfile, "a"),
        stderr=subprocess.STDOUT,
        start_new_session=True,
    )
    pidfile.write_text(str(proc.pid))
    gum_log("info", f"Watcher gestartet (PID {proc.pid}, log: {logfile})")


# Session sub-app
session_app = typer.Typer(help="Session queries (today | get DATE | list)")
app.add_typer(session_app, name="session")

def _read_session(date_str: str) -> dict:
    f = _sessions_dir() / f"{date_str}.json"
    if f.exists():
        return json.loads(f.read_text())
    return _try_http("session_get", date_str)

@session_app.command("today")
def session_today() -> None:
    """Heutige Session direkt aus Datei."""
    from datetime import date
    print(json.dumps(_read_session(str(date.today())), indent=2, ensure_ascii=False))

@session_app.command("get")
def session_get(date: str = typer.Argument(..., help="YYYY-MM-DD")) -> None:
    """Session für ein Datum direkt aus Datei."""
    print(json.dumps(_read_session(date), indent=2, ensure_ascii=False))

@session_app.command("list")
def session_list(limit: int = typer.Option(10, "-n")) -> None:
    """Letzte N Sessions direkt aus Dateien."""
    files = sorted(_sessions_dir().glob("*.json"), reverse=True)[:limit]
    sessions = [json.loads(f.read_text()) for f in files] if files else _try_http("session_list", limit)
    print(json.dumps(sessions, indent=2, ensure_ascii=False))


# Journal sub-app
journal_app = typer.Typer(help="Journal queries (today | get DATE | list)")
app.add_typer(journal_app, name="journal")

def _read_journal(date_str: str) -> dict:
    f = _journal_dir() / f"{date_str}.md"
    if f.exists():
        return {"date": date_str, "content": f.read_text()}
    return _try_http("journal_get", date_str)

@journal_app.command("today")
def journal_today() -> None:
    """Heutiger Journal-Eintrag direkt aus Datei."""
    from datetime import date
    data = _read_journal(str(date.today()))
    print(data.get("content", json.dumps(data, indent=2, ensure_ascii=False)))

@journal_app.command("get")
def journal_get(date: str = typer.Argument(..., help="YYYY-MM-DD")) -> None:
    """Journal-Eintrag für ein Datum direkt aus Datei."""
    data = _read_journal(date)
    print(data.get("content", json.dumps(data, indent=2, ensure_ascii=False)))

@journal_app.command("list")
def journal_list() -> None:
    """Journal-Einträge aus Dateien auflisten."""
    files = sorted(_journal_dir().glob("*.md"), reverse=True)
    if files:
        for f in files:
            print(f"  {f.stem}")
    else:
        print(json.dumps(_try_http("journal_list"), indent=2, ensure_ascii=False))


# Kein eigenes "catalog"-Sub-Typer mehr hier: tui/inbox/sync/audit waren ein
# 1:1-Duplikat von "fitness agent <cmd>" (das bereits korrekt über das
# installierte fitness-catalog-Binary auf fitness.catalog.cli zeigt) — und
# zusätzlich kaputt, weil "-m catalog" auf ein totes Top-Level-Package zielte.
# Siehe "fitness agent tui" / "fitness agent tui --screen inbox" /
# "fitness agent audit" / "fitness agent push" als die jetzt einzigen,
# funktionierenden Entry-Points dafür.

# ── Entry ──────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    app()


def main() -> None:
    app()
