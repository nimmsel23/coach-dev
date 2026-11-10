#!/usr/bin/env python3
"""
fuel — Typer-powered smart logging dispatcher.

Routing:
  fuel                               → kombiniertes Today (meal + supplement)
  fuel <supp_id> [opts]              → fuel-supplement <supp_id>
  fuel "<description>" [opts]        → fuel-meal log "<description>"
                                        (Catalog-Hit zuerst, Gemini nur bei Miss)
  fuel "<item1>" "<item2>" [opts]    → EIN Meal-Log, EIN Gemini-Call über
                                        beide Items (Gemini summiert selbst)
  fuel meal|supplement <subcmd>      → pass-through
  fuel today|list|unlog|sync ...     → eigene Sub-Commands

Datums-Flags (überall erkannt, auch gemischt mit anderen Flags):
  --gestern / -g          gestern
  --vorgestern            vorgestern
  --tag <wort|datum>      heute|gestern|vorgestern|-N|Mo|YYYY-MM-DD
  --day/-d <YYYY-MM-DD>   (legacy) explizites Datum
  -Nd                     Kurzform: N Tage zurück, z.B. -1d, -2d, -3d
  Datumswort im Freitext  "gestern hab ich X gegessen" — wird erkannt UND
                          aus der Beschreibung entfernt, wenn kein Flag
                          gesetzt ist (Fallback, kein Ersatz für Flags)

Tageszeit-Shortcuts (setzen meal_type für fuel-meal log):
  -morgen, -vormittag     → breakfast
  -mittag                 → lunch (= Standard)
  -nachmittag, -nacht     → snack
  -abend                  → dinner

Beispiele:
  fuel "Käsekrainer 330g"
  fuel "Käsekrainer 330g" "250g Reis" --gestern
  fuel "Toast mit Ei" -abend -1d
  fuel magnesium --abend
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
from datetime import date, timedelta
from pathlib import Path

import typer
from rich.console import Console
from rich.table import Table

try:
    from wasabi import Printer
    msg = Printer()
except ImportError:
    class _P:
        def divider(self, t): print(f"\n--- {t} ---\n")
        def warn(self, t): print(f"[warn] {t}", file=sys.stderr)
        def fail(self, t): print(f"[fail] {t}", file=sys.stderr)
        def info(self, t): print(f"[info] {t}")
        def good(self, t): print(f"[ok] {t}")
    msg = _P()

from .paths import REPO_DIR as FUEL_REPO_DIR

_CLI_MODULES = {
    "fuel-meal": ("fuel.meal", "main"),
    "fuel-supplement": ("fuel.supplement", "main"),
    "fuel-ingredient": ("fuel.ingredient", "main"),
    "fuel-week": ("fuel.report", "week_main"),
    "fuel-micro": ("fuel.report", "micro_main"),
}


# Thin wrappers under fuel-dev/bin that still `import fuel` from the removed
# package tree — must not win over ~/.local/bin or the in-package fallback.
_BROKEN_FUEL_DEV_WRAPPERS = frozenset(_CLI_MODULES) | {
    "fuel-today", "fuel-sync", "fuel-food-search",
}


def _run_cli(name: str, args: list[str]) -> int:
    """Prefer uv/Poetry console scripts; fall back to in-package import."""
    from .paths import BACKEND_ROOT

    local_bin = Path.home() / ".local" / "bin" / name
    if local_bin.is_file():
        return subprocess.run([str(local_bin), *args]).returncode

    executable = shutil.which(name)
    if executable:
        exe_path = Path(executable).resolve()
        broken = (
            name in _BROKEN_FUEL_DEV_WRAPPERS
            and FUEL_REPO_DIR in exe_path.parents
        )
        if not broken:
            return subprocess.run([executable, *args]).returncode

    entry = _CLI_MODULES.get(name)
    if entry:
        module, function = entry
        code = (
            "import sys;"
            f"sys.argv[0]={name!r};"
            f"from {module} import {function}; {function}()"
        )
        env = {
            **os.environ,
            "PYTHONPATH": os.pathsep.join(
                filter(None, [str(BACKEND_ROOT), str(FUEL_REPO_DIR), os.environ.get("PYTHONPATH", "")])
            ),
            "FUEL_REPO_DIR": os.environ.get("FUEL_REPO_DIR", str(FUEL_REPO_DIR)),
        }
        return subprocess.run([sys.executable, "-c", code, *args], env=env).returncode

    typer.echo(f"CLI-Programm '{name}' ist nicht installiert.", err=True)
    return 127


def _run_cli_or_exit(name: str, args: list[str]) -> None:
    return_code = _run_cli(name, args)
    if return_code:
        raise typer.Exit(return_code)

from .catalog import load_supplement_ids
from .dates import resolve as _resolve_date  # noqa: F401 — re-exposed for tests
from . import tui

# ── Direkte File-Zugriffe ─────────────────────────────────────────────────────

def _data_dir() -> Path:
    return Path(os.environ.get("AOS_FUEL_DATA_DIR", "~/.aos/fuel")).expanduser()

def _nutrition_dir() -> Path:
    return _data_dir() / "nutrition"

def _supplements_log_dir() -> Path:
    return _data_dir() / "supplements" / "logs"

def _read_nutrition(date_str: str) -> dict | None:
    f = _nutrition_dir() / f"{date_str}.json"
    return json.loads(f.read_text()) if f.exists() else None

def _read_supplements(date_str: str) -> dict | None:
    f = _supplements_log_dir() / f"{date_str}.json"
    return json.loads(f.read_text()) if f.exists() else None

def _try_http(fn_name: str, *args, **kwargs):
    from . import http_fallback as _http
    return getattr(_http, fn_name)(*args, **kwargs)

def _print_nutrition(data: dict) -> None:
    meals = data.get("meals", [])
    if not meals:
        print("  (keine Mahlzeiten)")
        return
    total_kcal = total_p = total_c = total_f = 0.0
    for m in meals:
        kcal = m.get("kcal", 0) or 0
        p = m.get("protein", 0) or 0
        c = m.get("carbs", 0) or 0
        f = m.get("fat", 0) or 0
        desc = m.get("description", "—")
        print(f"  {desc:<36} {kcal:>5.0f} kcal  {p:.0f}P {c:.0f}C {f:.0f}F")
        total_kcal += kcal; total_p += p; total_c += c; total_f += f
    print(f"  {'─'*60}")
    print(f"  {'Total':<36} {total_kcal:>5.0f} kcal  {total_p:.0f}P {total_c:.0f}C {total_f:.0f}F")
    water = data.get("water_ml")
    if water:
        print(f"  Wasser: {water} ml")

def _print_supplements(data: dict) -> None:
    intakes = data.get("intakes", [])
    if not intakes:
        print("  (keine Supplements)")
        return
    for s in intakes:
        name = s.get("name") or s.get("supplement_id", "—")
        dose = s.get("dose", "")
        unit = s.get("unit", "")
        tod = s.get("time_of_day", "")
        print(f"  {name:<24} {dose}{unit}  {tod}")

def _show_day(date_str: str) -> None:
    nutr = _read_nutrition(date_str)
    supps = _read_supplements(date_str)
    if nutr is None and supps is None:
        try:
            nutr = _try_http("nutrition_log", date_str)
            supps = _try_http("supplements_log", date_str)
        except Exception:
            msg.warn(f"Keine Daten für {date_str} (lokal + HTTP)")
            return
    msg.divider(f"MEALS  [{date_str}]")
    if nutr:
        _print_nutrition(nutr)
    else:
        print("  (keine Mahlzeiten)")
    msg.divider(f"SUPPLEMENTS  [{date_str}]")
    if supps:
        _print_supplements(supps)
    else:
        print("  (keine Supplements)")

app = typer.Typer(
    help=(
        "Fuel Centre Smart CLI.\n\n"
        "Meist NICHT über einen Subcommand aufgerufen, sondern direkt:\n\n"
        "  fuel \"Käsekrainer 330g\"                  → Meal loggen (Catalog-Hit "
        "oder Gemini-Schätzung)\n"
        "  fuel \"Item1\" \"Item2\" --gestern           → mehrere Items, ein Log, "
        "ein Gemini-Call\n"
        "  fuel magnesium                            → Supplement loggen "
        "(erkannt an bekannter ID)\n"
        "  fuel                                       → heutiges Log (Meals + "
        "Supplements)\n\n"
        "Datums-Flags: --gestern/-g, --vorgestern, --tag <wort>, --day/-d "
        "YYYY-MM-DD, -Nd (z.B. -1d, -2d)\n"
        "Tageszeit-Shortcuts: -morgen, -vormittag, -mittag, -nachmittag, "
        "-abend, -nacht (setzen meal_type)\n\n"
        "Subcommands unten sind für Spezialfälle (Catalog-Browser, Sync, "
        "Stats) — für den täglichen Log-Fall einfach 'fuel \"...\"' benutzen."
    ),
    no_args_is_help=False,
)

DATE_FLAGS = {"--gestern", "-g", "--vorgestern", "--tag", "--day", "-d"}
DATE_FLAGS_WITH_VALUE = {"--tag", "--day", "-d"}

TIME_OF_DAY_SHORTCUTS = {
    "-morgen": "breakfast", "-vormittag": "breakfast",
    "-mittag": "lunch",
    "-nachmittag": "snack", "-nacht": "snack",
    "-abend": "dinner",
}
_RELATIVE_DAY_RE = re.compile(r"^-(\d+)d$")


def _split_date_flags(args: list[str]) -> tuple[list[str], list[str]]:
    """Pull date-related flags out of args. Returns (date_flags, remaining)."""
    date_flags: list[str] = []
    rest: list[str] = []
    i = 0
    while i < len(args):
        a = args[i]
        if a in DATE_FLAGS_WITH_VALUE and i + 1 < len(args):
            date_flags.extend([a, args[i + 1]])
            i += 2
        elif a in DATE_FLAGS:
            date_flags.append(a)
            i += 1
        else:
            rest.append(a)
            i += 1
    return date_flags, rest


def _split_shortcut_flags(args: list[str]) -> tuple[str | None, list[str], list[str]]:
    """Erkennt -abend/-morgen/... (meal_type) und -Nd (Tage zurück).

    Returns (meal_type_or_None, date_flags_from_shortcuts, rest_ohne_shortcuts).
    """
    meal_type: str | None = None
    shortcut_date_flags: list[str] = []
    rest: list[str] = []
    for a in args:
        if a in TIME_OF_DAY_SHORTCUTS:
            meal_type = TIME_OF_DAY_SHORTCUTS[a]
            continue
        m = _RELATIVE_DAY_RE.match(a)
        if m:
            shortcut_date_flags = ["--tag", f"-{m.group(1)}"]
            continue
        rest.append(a)
    return meal_type, shortcut_date_flags, rest


def _first_non_flag(args: list[str]) -> str | None:
    for a in args:
        if not a.startswith("-"):
            return a
    return None


def show_combined_today(extra_args: list[str] | None = None) -> None:
    extra_args = extra_args or []
    if not extra_args:
        _show_day(str(date.today()))
    else:
        # Datums-Flags an Sub-CLIs weitergeben (z.B. --gestern)
        msg.divider("MEALS")
        _run_cli("fuel-meal", ["today", *extra_args])
        msg.divider("SUPPLEMENTS")
        _run_cli("fuel-supplement", ["today", *extra_args])


def _meal_log(description: str, extra_args: list[str], meal_type: str | None) -> int:
    """Delegiert an `fuel-meal log` OHNE vorab Gemini zu rufen.

    do_meal_log() in fuel-meal macht bereits Catalog-first → Gemini-Fallback
    (siehe fuel/catalog_lookup.py). Würde man hier schon --kcal mitgeben,
    triggert das den kcal==0-Branch dort nie — der Catalog-Check würde tot
    sein. Deshalb: nur die Beschreibung + Flags durchreichen, kein Makro-Call.
    --save-catalog default an, damit neu von Gemini geschätzte Items beim
    nächsten Mal ein Catalog-Hit sind (kein Gemini-Call mehr nötig).
    """
    args = ["log", description, "--save-catalog"]
    if meal_type:
        args += ["--meal-type", meal_type]
    args += extra_args
    return _run_cli("fuel-meal", args)


# ── Typer commands (explicit pass-through) ───────────────────────────────────

_PASSTHROUGH_CTX = {"allow_extra_args": True, "ignore_unknown_options": True, "help_option_names": []}


@app.command(context_settings=_PASSTHROUGH_CTX)
def meal(ctx: typer.Context):
    """Route to fuel-meal. '--help' geht an fuel-meal selbst (eigene Subcommands: log/narrative/list/today/unlog/move)."""
    _run_cli_or_exit("fuel-meal", ctx.args)


@app.command(context_settings=_PASSTHROUGH_CTX)
def supplement(ctx: typer.Context):
    """Route to fuel-supplement. '--help' geht an fuel-supplement selbst (eigene Subcommands: log/list/unlog)."""
    _run_cli_or_exit("fuel-supplement", ctx.args)


@app.command(context_settings=_PASSTHROUGH_CTX)
def ingredient(ctx: typer.Context):
    """Route to fuel-ingredient. '--help' geht an fuel-ingredient selbst (eigene Subcommands: add)."""
    _run_cli_or_exit("fuel-ingredient", ctx.args)


@app.command(context_settings={"allow_extra_args": True, "ignore_unknown_options": True})
def today(ctx: typer.Context):
    """Combined today (meals + supplements). Akzeptiert --gestern/--vorgestern/--tag."""
    show_combined_today(ctx.args)


@app.command(context_settings=_PASSTHROUGH_CTX)
def move(ctx: typer.Context):
    """Mahlzeit zwischen zwei Tagen verschieben — an `fuel-meal move` weiterreichen.

    Beispiel: fuel move --to gestern
    """
    _run_cli_or_exit("fuel-meal", ["move", *ctx.args])


@app.command(context_settings=_PASSTHROUGH_CTX)
def repeat(ctx: typer.Context):
    """Mahlzeit von einem Tag kopieren (Quelltag bleibt erhalten) — an `fuel-meal repeat` weiterreichen.

    Default: gestern → heute, fzf-Auswahl. Beispiel: fuel repeat --from -3 --to heute
    """
    _run_cli_or_exit("fuel-meal", ["repeat", *ctx.args])


@app.command()
def list():
    """List available supplements."""
    _run_cli_or_exit("fuel-supplement", ["list"])


@app.command(context_settings=_PASSTHROUGH_CTX)
def unlog(ctx: typer.Context):
    """Unlog. Default: supplement. Mit --meal: Meal-unlog. '--help' geht an die jeweilige Sub-CLI."""
    args = list(ctx.args)
    if "--meal" in args:
        args.remove("--meal")
        _run_cli_or_exit("fuel-meal", ["unlog", *args])
    else:
        _run_cli_or_exit("fuel-supplement", ["unlog", *args])


@app.command()
def sync(
    direction: str = typer.Argument("push", help="push | pull"),
    uid: str = typer.Option(None, "--uid", help="Firebase UID (default: aktiver User)"),
):
    """Nutrition-, Supplement- und Journaldaten mit Firestore synchronisieren."""
    if direction not in {"push", "pull"}:
        typer.echo(f"Unbekannte Richtung: {direction} (push | pull)", err=True)
        raise typer.Exit(2)
    try:
        import firebase_admin  # noqa: F401 — optional package dependency
        from . import firestore as fuel_firestore
    except ImportError as e:
        typer.echo(f"Firestore-Sync nicht verfügbar: {e}. Installiere fuel[cloud].", err=True)
        raise typer.Exit(1)
    if not fuel_firestore.SA_PATH.exists():
        typer.echo(f"Service Account nicht gefunden: {fuel_firestore.SA_PATH}", err=True)
        raise typer.Exit(1)
    try:
        if direction == "push":
            fuel_firestore.cli_push(uid or fuel_firestore.DEFAULT_UID)
        else:
            fuel_firestore.cli_pull(uid or fuel_firestore.DEFAULT_UID)
    except Exception as e:
        typer.echo(f"Firestore-Sync fehlgeschlagen: {e}", err=True)
        raise typer.Exit(1)


@app.command(name="db-resync")
def db_resync():
    """nutrition.db aus allen Tages-JSONs neu befüllen (global + je User).

    Idempotent (Upsert) — für Drift-Fälle nutzbar, z.B. wenn der
    Node/CLI-Sync-Code zeitweise nicht aktiv war oder JSONs manuell
    editiert wurden. Ersetzt das Ad-hoc-Migrationsskript vom 2026-07-23.
    """
    from . import meal as _meal

    data_root = _meal.DATA_DIR
    roots = [data_root / "nutrition"]
    users_dir = data_root / "users"
    if users_dir.exists():
        roots += [d / "nutrition" for d in sorted(users_dir.iterdir()) if (d / "nutrition").is_dir()]

    total = 0
    for root in roots:
        n = _meal.resync_db_from_json(root)
        typer.echo(f"  {root}: {n} Tage synced")
        total += n
    msg.good(f"nutrition.db resync fertig — {total} Tage insgesamt")


@app.command()
def get(day: str = typer.Argument(..., help="Datum (YYYY-MM-DD)")):
    """Tages-Log für ein bestimmtes Datum (direkt aus Dateien)."""
    _show_day(day)


@app.command()
def stats(days: int = typer.Option(7, "-d", "--days", help="Anzahl Tage")):
    """Aggregierte Makros der letzten N Tage (direkt aus Dateien)."""
    today_date = date.today()
    total_kcal = total_p = total_c = total_f = 0.0
    count = 0
    for i in range(days):
        d = today_date - timedelta(days=i)
        data = _read_nutrition(str(d))
        if not data:
            continue
        count += 1
        for m in data.get("meals", []):
            total_kcal += m.get("kcal", 0) or 0
            total_p += m.get("protein", 0) or 0
            total_c += m.get("carbs", 0) or 0
            total_f += m.get("fat", 0) or 0
    if count == 0:
        msg.warn(f"Keine Nutrition-Logs in den letzten {days} Tagen gefunden")
        return
    avg_kcal = total_kcal / count
    avg_p = total_p / count
    avg_c = total_c / count
    avg_f = total_f / count
    print(f"  Letzte {days} Tage: {count} Logs")
    print(f"  Total: {total_kcal:.0f} kcal  {total_p:.0f}P {total_c:.0f}C {total_f:.0f}F")
    print(f"  Schnitt: {avg_kcal:.0f} kcal  {avg_p:.0f}P {avg_c:.0f}C {avg_f:.0f}F")


@app.command(context_settings=_PASSTHROUGH_CTX)
def week(ctx: typer.Context):
    """Wochenreport — an `fuel-week` weiterreichen (Logik in fuel/report.py:week_main)."""
    _run_cli_or_exit("fuel-week", ctx.args)


@app.command(context_settings=_PASSTHROUGH_CTX)
def micro(ctx: typer.Context):
    """Mikronährstoff-Report — an `fuel-micro` weiterreichen (Logik in fuel/report.py:micro_main)."""
    _run_cli_or_exit("fuel-micro", ctx.args)


@app.command(context_settings={"allow_extra_args": True, "ignore_unknown_options": True})
def edit(
    ctx: typer.Context,
    mode: str = typer.Option(None, "--mode", "-m", help="catalog | log (default: ncurses für heute)"),
    date_arg: str = typer.Option(None, "--date", "-d", help="Datum für Log-Edit (YYYY-MM-DD)"),
):
    """Interactive Nutrition Editor.

    Default (keine Argumente): ncurses TUI mit allen Einträgen von heute (schnelle Batch-Edit)
    fuel edit catalog: gum-Menü zum Catalog editieren
    fuel edit log [DATUM]: gum-Menü zum Log editieren
    """
    # Allow positional arguments like: fuel edit catalog
    if ctx.args and not mode:
        first_arg = ctx.args[0]
        if first_arg in ("catalog", "log"):
            mode = first_arg
        if first_arg and first_arg not in ("catalog", "log") and len(ctx.args) > 1:
            # Treat as: fuel edit log DATUM
            if ctx.args[0] == "log":
                date_arg = ctx.args[1]
                mode = "log"

    tui.edit(mode=mode, target_date=date_arg)

@app.command(context_settings={"allow_extra_args": True, "ignore_unknown_options": True}, name="tui")
def tui_alias(
    ctx: typer.Context,
    mode: str = typer.Option(None, "--mode", "-m"),
    date_arg: str = typer.Option(None, "--date", "-d"),
):
    """Alias for 'fuel edit'."""
    edit(ctx, mode=mode, date_arg=date_arg)

@app.command(context_settings={"allow_extra_args": True, "ignore_unknown_options": True}, name="catalog")
def catalog_alias(
    ctx: typer.Context,
    date_arg: str = typer.Option(None, "--date", "-d"),
):
    """Alias for 'fuel edit catalog'."""
    edit(ctx, mode="catalog", date_arg=date_arg)


@app.command(name="usda")
def usda_lookup(query: str = typer.Argument(..., help="Lebensmittel-Suchbegriff, z.B. 'egg whole raw'")):
    """Fuzzy-Suche in USDA FoodData Central — Makros + volles Mikroprofil pro 100g."""
    from .sources import usda as _usda

    hits = _usda.search_food(query, limit=5)
    if not hits:
        msg.fail(f"Kein USDA-Treffer für {query!r}")
        raise typer.Exit(1)

    console = Console()
    table = Table(title=f"USDA-Treffer für '{query}'")
    table.add_column("#")
    table.add_column("Beschreibung")
    table.add_column("Typ")
    for i, h in enumerate(hits, 1):
        table.add_row(str(i), h["description"], h["data_type"] or "")
    console.print(table)

    top = _usda.get_nutrients(hits[0]["fdc_id"])
    if not top:
        raise typer.Exit(1)

    profile = Table(title=f"Profil pro 100g — {top['description']}")
    profile.add_column("Nährstoff")
    profile.add_column("Wert", justify="right")
    for k, v in top["per_100g"].items():
        if v:
            profile.add_row(k, str(v))
    console.print(profile)


# Known Typer-Subcommands aus der App ableiten — kein hardcoded set mehr.
def _known_commands() -> set[str]:
    names = set()
    for c in app.registered_commands:
        names.add(c.name or (c.callback.__name__ if c.callback else None))
    names.discard(None)
    return names | {"--help", "-h", "-help", "help"}


# Stack-Control-Wörter (v3/v4-Betrieb via fuelctl) — sind keine Typer-Subcommands
# hier (die gehören zu bin/fuelctl, einer separaten CLI) und keine Supplement-
# IDs. Ohne diese Liste würde "fuel status"/"fuel dev" als bare Single-Word-
# Item durchrutschen und als Freitext-Mahlzeit an Gemini gehen.
STACK_CONTROL_WORDS = {
    "status", "dev", "prod", "cloud", "local", "v2", "logs", "start", "stop",
    "restart", "build", "deploy", "health",
}


def main() -> None:
    # Zsh/Bash/Typer autocomplete handling
    if "_FUEL_COMPLETE" in os.environ:
        app()
        return

    argv = sys.argv[1:]

    if not argv:
        show_combined_today()
        return

    # Help MUSS immer Typer erreichen — sonst greift Smart-Routing und zeigt
    # "today" (bzw. frisst -help als Nicht-Flag). Auch -help / help abfangen.
    if (
        "--help" in argv or "-h" in argv or "-help" in argv or
        argv == ["help"] or
        "--install-completion" in argv or
        "--show-completion" in argv
    ):
        if argv == ["help"] or argv == ["-help"]:
            sys.argv = [sys.argv[0], "--help"]
        app()
        return

    known = _known_commands()
    first_token = _first_non_flag(argv)

    if first_token in known:
        app()
        return

    # Smart-Routing: Datums-Flags + Shortcuts (-abend, -1d, ...) rausziehen,
    # dann erstes Non-Flag klassifizieren.
    date_flags, rest = _split_date_flags(argv)
    meal_type, shortcut_date_flags, rest = _split_shortcut_flags(rest)
    # Explizite --tag/--gestern/etc. haben Vorrang vor -Nd-Shortcuts.
    if not date_flags and shortcut_date_flags:
        date_flags = shortcut_date_flags
    target = _first_non_flag(rest)

    if not target:
        # Nur Flags, kein Item — als Today interpretieren
        show_combined_today(date_flags)
        return

    supp_ids = load_supplement_ids()
    if target in supp_ids:
        # Erstes Item ist Supplement → fuel-supplement log <items> <flags>
        supps = [a for a in rest if a in supp_ids]
        other = [a for a in rest if a not in supp_ids]
        _run_cli_or_exit("fuel-supplement", ["log", *supps, *other, *date_flags])
        return

    # Stack-Control-Wörter (status/dev/local/logs/...) sind keine Supplement-IDs
    # und keine registrierten Typer-Subcommands hier — ohne diesen Check würde
    # "fuel status" oder "fuel dev" als Freitext-Mahlzeit an Gemini gehen
    # ("status" als Essen loggen). Supplements haben Vorrang (oben), Mahlzeiten
    # werden immer gequoted getippt ("Käsekrainer 330g"), Supplements bare
    # (weil aus dem Katalog) — ein bare Single-Word-Treffer hier ist also so
    # gut wie nie eine echte Mahlzeitbeschreibung.
    if target in STACK_CONTROL_WORDS:
        _run_cli_or_exit("fuelctl", rest)
        return

    # NL-Mahlzeitbeschreibung(en) → EIN Meal-Log. Mehrere Quoted-Args werden
    # zu einem Text zusammengefügt — Gemini summiert Komponenten selbst
    # (siehe PROMPT_TEMPLATE Punkt 3 in fuel/gemini.py).
    # -z/--zeit HH:MM rausziehen, bevor der Rest zur Beschreibung wird — sonst
    # landet "12:00" im Freitext und geht an Gemini statt an --zeit.
    zeit_args: list[str] = []
    for flag in ("-z", "--zeit"):
        if flag in rest:
            i = rest.index(flag)
            if i + 1 < len(rest):
                zeit_args = ["--zeit", rest[i + 1]]
                rest = rest[:i] + rest[i + 2:]
            break

    description = " ".join(rest)

    # Führende Menge abtrennen ("3 käsleberkässemmeln" → qty=3, "käsleberkässemmeln").
    # Ohne das landete die Zahl im Beschreibungstext: Catalog-Match schlug fehl
    # (falscher String), UND --save-catalog speicherte die GESAMTSUMME für N
    # Stück als vermeintlichen Pro-Stück-Wert ab (do_meal_log kennt qty>1 nur
    # über --qty, nicht aus der Beschreibung) — Quelle der Geister-Duplikate
    # im Meal-Catalog.
    # ABER: nur wenn der Rest-String ein Catalog-Hit ist. Sonst bleibt die Zahl
    # in der Beschreibung — bei Multi-Komponenten-Text ("10 Eier mit 5dag Speck")
    # würde --qty die GESAMTE Gemini-Schätzung ×N nehmen (auch den Speck), und
    # Gemini bekäme nur einen Plural ohne Stückzahl. Gemini summiert Komponenten
    # inkl. führender Mengen selbst (PROMPT_TEMPLATE Punkt 3).
    qty_args: list[str] = []
    m = re.match(r"^(\d+)\s+(.+)$", description)
    if m:
        from fuel.catalog_lookup import find_meal
        from fuel.units import UNIT_GRAMS, fold
        # "850 ml Hohes C" ist eine Mengenangabe, keine Stückzahl: Einheit direkt
        # nach der Zahl → nicht als --qty abspalten (sonst 850× den Baustein).
        _first = fold(m.group(2).split()[0])
        if _first not in UNIT_GRAMS and find_meal(m.group(2)):
            qty_args = ["--qty", m.group(1)]
            description = m.group(2)

    sys.exit(_meal_log(description, date_flags + qty_args + zeit_args, meal_type))


if __name__ == "__main__":
    main()
