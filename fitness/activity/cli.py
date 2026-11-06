"""
fitness-activity — Cardio/Activity per CLI loggen

Activity-Konfig liegt deklarativ in catalog/kb/activities.yml.
POST geht an :9150/session (das macht JSON + SQLite + Firestore-Mirror).

Beispiele:
  fitness activity log swimming -d 20 -s breast -n "Donauinsel"
  fitness activity log running  -d 45 -i 7
  fitness activity log hiit     -d 15 -t core
  fitness activity types
  fitness activity whoami
  fitness activity recent --days 14
"""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from datetime import date, datetime, timedelta
from pathlib import Path

import pandas as pd
import typer
import yaml
from loguru import logger
from rich.console import Console
from rich.table import Table

from ..muscles import muscle_to_group

# ── Setup ─────────────────────────────────────────────────────────────────────
logger.remove()
logger.add(sys.stderr, format="<level>{level: <7}</level> {message}", level="INFO")

console = Console()

# Default: Python-Prod-Backend :9150 (fitness-api.service, im Normalfall aktiv).
# Der Node-Dev-Server :9100 läuft nur manuell — FITNESS_API=http://127.0.0.1:9100
# setzen wenn bewusst dorthin geloggt werden soll. Beide schreiben dieselbe
# ~/.aos/fitness/-Session-JSON (SOT).
API = os.environ.get("FITNESS_API", "http://127.0.0.1:9150")
USERS_DIR = Path.home() / ".aos" / "fitness" / "users"
CONFIG = Path(__file__).resolve().parent.parent / "catalog" / "kb" / "activities.yml"


def load_activities() -> dict:
    if not CONFIG.exists():
        logger.error(f"Activity-Config fehlt: {CONFIG}")
        raise typer.Exit(1)
    with CONFIG.open() as f:
        return yaml.safe_load(f)


def detect_uid() -> str:
    env = os.environ.get("FITNESS_UID")
    if env:
        return env
    if not USERS_DIR.exists():
        raise typer.BadParameter(f"{USERS_DIR} fehlt — keine uid-Dirs vorhanden")
    candidates = []
    for d in USERS_DIR.iterdir():
        if not d.is_dir() or d.name in ("default", "kb"):
            continue
        sess = d / "sessions"
        n = len(list(sess.glob("*.json"))) if sess.exists() else 0
        candidates.append((d.name, n))
    if not candidates:
        raise typer.BadParameter("Keine uid in ~/.aos/fitness/users/ gefunden")
    candidates.sort(key=lambda x: -x[1])
    return candidates[0][0]


def post_session(uid: str, day: str, payload: dict) -> dict:
    req = urllib.request.Request(
        f"{API}/session?date={day}",
        method="POST",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json", "X-User-UID": uid},
    )
    try:
        with urllib.request.urlopen(req, timeout=5) as r:
            return json.loads(r.read())
    except urllib.error.URLError as e:
        logger.error(f"Server nicht erreichbar ({API}): {e}")
        raise typer.Exit(1)


# ── Commands ──────────────────────────────────────────────────────────────────
app = typer.Typer(no_args_is_help=True, add_completion=False)


@app.command()
def log(
    activity: str = typer.Argument(..., help="Activity-Typ (siehe `types`)"),
    duration: int = typer.Option(..., "--duration", "-d", help="Minuten"),
    style: str = typer.Option(None, "--style", "-s", help="swimming: breast|back"),
    target: str = typer.Option(None, "--target", "-t", help="hiit: core|legs|full"),
    notes: str = typer.Option("", "--notes", "-n"),
    intensity: int = typer.Option(None, "--intensity", "-i", min=1, max=10),
    day: str = typer.Option(None, "--date", help="YYYY-MM-DD (Default heute)"),
    uid_override: str = typer.Option(None, "--uid"),
    dry_run: bool = typer.Option(False, "--dry-run"),
):
    """Eine Cardio/Activity-Session loggen."""
    cfg = load_activities()
    if activity not in cfg:
        logger.error(f"Unbekannt: {activity}. Verfügbar: {', '.join(cfg.keys())}")
        raise typer.Exit(1)

    spec = cfg[activity]
    activity_obj = {"type": activity, "duration": str(duration), "notes": notes}

    variant_field = spec.get("variant_field")
    if variant_field:
        chosen = style if variant_field == "swimStyle" else target
        variants = spec.get("variants", {})
        if chosen and chosen not in variants:
            logger.error(f"{variant_field}={chosen} ungültig. Erlaubt: {', '.join(variants)}")
            raise typer.Exit(1)
        if not chosen:
            # Default = erste Variante
            chosen = next(iter(variants))
            logger.info(f"{variant_field} nicht gesetzt → Default: {chosen}")
        activity_obj[variant_field] = chosen
        activity_obj["muscles"] = variants[chosen]["muscles"]
        if variants[chosen].get("primary_muscles"):
            activity_obj["primaryMuscles"] = variants[chosen]["primary_muscles"]
    else:
        activity_obj["muscles"] = spec["muscles"]
        if spec.get("primary_muscles"):
            activity_obj["primaryMuscles"] = spec["primary_muscles"]

    if intensity is not None:
        activity_obj["intensity"] = intensity

    payload = {
        "block": "",
        "activity": activity_obj,
        "exercises": [],
        "effort": intensity,
        "mood": "",
        "notes": notes,
    }

    uid = uid_override or detect_uid()
    target_day = day or date.today().isoformat()

    console.print(f"[dim]→ {target_day}  uid={uid}[/dim]")
    console.print_json(data=activity_obj)

    if dry_run:
        logger.info("(dry-run, nichts gesendet)")
        return

    r = post_session(uid, target_day, payload)
    if r.get("ok"):
        logger.success(f"geloggt → {target_day} ({spec.get('emoji','')} {spec['label']})")
    else:
        logger.error(f"Server-Fehler: {r}")
        raise typer.Exit(1)


@app.command()
def types():
    """Übersicht aller Activity-Typen + Muskel-Default."""
    cfg = load_activities()
    table = Table(title="Activity → Muskeln (catalog/kb/activities.yml)", show_lines=False)
    table.add_column("Type", style="cyan")
    table.add_column("Label")
    table.add_column("Default-Muskeln", style="green")
    table.add_column("Varianten", style="yellow")
    for key, spec in cfg.items():
        variants = spec.get("variants", {})
        var_str = "  ·  ".join(f"{k}: {','.join(v['muscles'])}" for k, v in variants.items())
        table.add_row(
            f"{spec.get('emoji','')} {key}",
            spec["label"],
            ", ".join(spec["muscles"]),
            var_str or "—",
        )
    console.print(table)


@app.command()
def whoami():
    """Erkannte uid + Session-Pfad."""
    uid = detect_uid()
    sess = USERS_DIR / uid / "sessions"
    n = len(list(sess.glob("*.json"))) if sess.exists() else 0
    console.print(f"[bold cyan]uid:[/bold cyan]      {uid}")
    console.print(f"[bold cyan]path:[/bold cyan]     {sess}")
    console.print(f"[bold cyan]sessions:[/bold cyan] {n}")


@app.command()
def recent(
    days: int = typer.Option(14, "--days", "-d"),
    uid_override: str = typer.Option(None, "--uid"),
):
    """Letzte N Tage als pandas-Tabelle (Activities + Strength gemischt)."""
    uid = uid_override or detect_uid()
    sess = USERS_DIR / uid / "sessions"
    cutoff = (date.today() - timedelta(days=days)).isoformat()
    rows = []
    for f in sorted(sess.glob("*.json")):
        stem = f.stem.split("__")[0]
        if stem < cutoff:
            continue
        try:
            d = json.loads(f.read_text())
        except Exception:
            continue
        a = d.get("activity") or {}
        if a.get("muscles"):
            muscles = ",".join(a["muscles"])
        else:
            # Kraft-Session ohne activity-Objekt: Muskelgruppen aus den
            # primaryMuscles der geloggten Exercises zusammenziehen, statt
            # (wie bisher) leer zu bleiben nur weil kein Cardio-Feld existiert.
            groups: list[str] = []
            for ex in d.get("exercises") or []:
                for m in ex.get("primaryMuscles") or []:
                    group = muscle_to_group(m)
                    if group and group not in groups:
                        groups.append(group)
            muscles = ",".join(groups)
        rows.append({
            "date": stem,
            "kind": a.get("type") or d.get("block") or "?",
            "variant": a.get("swimStyle") or a.get("muscleTarget") or "",
            "min": a.get("duration") or "",
            "rpe": d.get("effort") or a.get("intensity") or "",
            "muscles": muscles,
            "exercises": len(d.get("exercises") or []),
            "notes": (d.get("notes") or a.get("notes") or "")[:30],
        })
    if not rows:
        logger.warning(f"Keine Sessions in den letzten {days} Tagen unter {uid}")
        return
    df = pd.DataFrame(rows).sort_values("date", ascending=False)
    console.print(f"[bold]{len(df)} Sessions · letzten {days} Tage · uid={uid}[/bold]")
    console.print(df.to_string(index=False))


@app.command()
def stats(
    days: int = typer.Option(30, "--days", "-d"),
    uid_override: str = typer.Option(None, "--uid"),
):
    """Activity-Aggregat pro Typ (Anzahl, Minuten, Stil-Aufteilung)."""
    uid = uid_override or detect_uid()
    sess = USERS_DIR / uid / "sessions"
    cutoff = (date.today() - timedelta(days=days)).isoformat()
    rows = []
    for f in sorted(sess.glob("*.json")):
        stem = f.stem.split("__")[0]
        if stem < cutoff:
            continue
        try:
            d = json.loads(f.read_text())
        except Exception:
            continue
        a = d.get("activity")
        if not a:
            continue
        rows.append({
            "type": a.get("type", "?"),
            "variant": a.get("swimStyle") or a.get("muscleTarget") or "—",
            "minutes": int(a.get("duration") or 0),
        })
    if not rows:
        logger.warning(f"Keine Activity-Sessions in den letzten {days} Tagen")
        return
    df = pd.DataFrame(rows)
    agg = df.groupby(["type", "variant"]).agg(
        sessions=("minutes", "count"),
        total_min=("minutes", "sum"),
        avg_min=("minutes", "mean"),
    ).round(1).reset_index()
    console.print(f"[bold]Activity-Aggregat · letzten {days} Tage · uid={uid}[/bold]")
    console.print(agg.to_string(index=False))


if __name__ == "__main__":
    app()


def main() -> None:
    app()
