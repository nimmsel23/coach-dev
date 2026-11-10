"""
fitness.log.strength — Kraft-Sessions loggen (Übung + Sätze/Reps/Gewicht).

Von `fitness-log add`/`fitness-log wizard` genutzt (vormals eigenes Binary
`fitness-strength`, 2026-09-08 eingegliedert — Ein-Tool-Prinzip, `fitness-log`
liest UND schreibt die eigenen Sessions, kein zweites Binary dafür nötig).

Pendant zu fitness-activity (Cardio) — POST geht ebenfalls an :9150/session
(JSON + SQLite + Firestore-Mirror). Anders als activity.py **überschreibt**
dieses Modul die Tages-Session NICHT: es lädt zuerst die bestehende Session
(GET /session), hängt die neue Übung/den neuen Satz an (oder mergt in eine
bereits vorhandene Übung gleicher id — wie addEx() im Frontend,
useExerciseList.js) und schreibt danach den vollständigen Stand zurück.

Übungs-Auflösung läuft über denselben Fuzzy-Resolver wie `fitness search`
(fitness.catalog.core.resolver) — Freitext-Name reicht, exakte kanonische
IDs matchen bevorzugt.

Beispiele:
  fitness-log add "Bankdrücken" --sets 3 --reps 8 --weight 60
  fitness-log add squat -s 4 -r 5 -w 100 --block Legs
  fitness-log add "Lat Pulldown" -s 3 -r 10 -w 45 --notes "letzter Satz AMRAP"
  fitness-log wizard
"""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from datetime import date
from pathlib import Path

import typer
from loguru import logger
from rich.console import Console
from rich.prompt import Confirm, IntPrompt, Prompt

logger.remove()
logger.add(sys.stderr, format="<level>{level: <7}</level> {message}", level="INFO")

console = Console()

# Default: Python-Prod-Backend :9150 (fitness-api.service, im Normalfall aktiv).
# Der Node-Dev-Server :9100 läuft nur manuell — FITNESS_API=http://127.0.0.1:9100
# setzen wenn bewusst dorthin geloggt werden soll. Beide schreiben dieselbe
# ~/.aos/fitness/-Session-JSON (SOT).
API = os.environ.get("FITNESS_API", "http://127.0.0.1:9150")
USERS_DIR = Path.home() / ".aos" / "fitness" / "users"


# ── HTTP / uid Helpers (identisch zu activity.py) ──────────────────────────────

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


def get_session(uid: str, day: str, session_id: str | None) -> dict | None:
    url = f"{API}/session?date={day}"
    if session_id:
        url += f"&id={session_id}"
    req = urllib.request.Request(url, headers={"X-User-UID": uid})
    try:
        with urllib.request.urlopen(req, timeout=5) as r:
            body = json.loads(r.read())
            # Node (server.mjs) liefert {ok, data}, Python (fitness/api) liefert
            # {ok, session, date} — beide Backends sind gültige Ziele (FITNESS_API),
            # Shape-Unterschied hier abfangen statt einem Backend Vorrang zu geben.
            return body.get("data") if "data" in body else body.get("session")
    except urllib.error.URLError as e:
        logger.error(f"Server nicht erreichbar ({API}): {e}")
        raise typer.Exit(1)


def post_session(uid: str, day: str, session_id: str | None, payload: dict) -> dict:
    url = f"{API}/session?date={day}"
    if session_id:
        url += f"&id={session_id}"
    req = urllib.request.Request(
        url, method="POST", data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json", "X-User-UID": uid},
    )
    try:
        with urllib.request.urlopen(req, timeout=5) as r:
            return json.loads(r.read())
    except urllib.error.URLError as e:
        logger.error(f"Server nicht erreichbar ({API}): {e}")
        raise typer.Exit(1)


# ── Übungs-Auflösung ────────────────────────────────────────────────────────────

def resolve_exercise(query: str) -> dict:
    """Freitext → {id, name, primaryMuscles, secondaryMuscles, stabilizers}.

    Nutzt denselben Fuzzy-Resolver wie `fitness search`/das Frontend
    (getExercise). Bei low-confidence-Match wird gewarnt, aber trotzdem
    geloggt (Session-Log darf nicht am Katalog scheitern) — wie addEx() im
    Frontend Inbox-Fallback (isNew, id = inbox_<slug>) für unbekannte
    Übungen nutzt.
    """
    from fitness.catalog.core.resolver import build_exercise_index, resolve_query

    records = build_exercise_index()
    result = resolve_query(query, records)
    if not result.matched:
        logger.warning(f"'{query}' nicht im Katalog gefunden — logge als freie Übung ohne Muskel-Daten")
        slug = query.strip().lower().replace(" ", "_")
        return {"id": f"inbox_{slug}", "name": query.strip(),
                "primaryMuscles": [], "secondaryMuscles": [], "stabilizers": []}

    if result.confidence != "high":
        logger.warning(f"'{query}' → '{result.display_name}' (confidence={result.confidence}, source={result.source})")

    record = next((r for r in records if r.exercise_id == result.canonical_id), None)
    return {
        "id": result.canonical_id,
        "name": result.display_name or query.strip(),
        "primaryMuscles": (record.primary_muscles if record else None) or [],
        "secondaryMuscles": (record.secondary_muscles if record else None) or [],
        "stabilizers": (record.stabilizers if record else None) or [],
    }


# ── Merge-Logik (kein Overwrite) ────────────────────────────────────────────────

def _parse_series(value: str, n: int, label: str) -> list[str]:
    """'8' → [8]*n. '8,8,6' → [8,8,6] (muss dann genau n Werte haben)."""
    parts = [p.strip() for p in str(value).split(",")]
    if len(parts) == 1:
        return parts * n
    if len(parts) != n:
        logger.error(f"--{label} hat {len(parts)} Werte, aber --sets={n}")
        raise typer.Exit(1)
    return parts


def merge_exercise_into_session(
    session: dict | None,
    exercise: dict,
    sets_array: list[dict],
    block: str | None,
    effort: int | None = None,
    location: str | None = None,
    duration: int | None = None,
) -> dict:
    session = dict(session) if session else {}
    exercises = list(session.get("exercises") or [])
    idx = next((i for i, e in enumerate(exercises) if e.get("id") == exercise["id"]), -1)
    if idx == -1:
        exercises.append({**exercise, "setsArray": sets_array})
    else:
        # Existiert schon in der Session (z.B. zweiter CLI-Aufruf für dieselbe
        # Übung) → Sätze anhängen statt Duplikat-Eintrag, wie addSet()/addEx()
        # im Frontend (useExerciseList.js).
        merged = dict(exercises[idx])
        merged["setsArray"] = list(merged.get("setsArray") or []) + sets_array
        exercises[idx] = merged
    session["exercises"] = exercises
    if block:
        session["block"] = block
    elif not session.get("block"):
        session["block"] = ""
    session.setdefault("sessionMode", "strength")
    # RPE/Effort ist ein strukturiertes Session-Feld (session.effort, siehe
    # EffortPicker im Frontend), NICHT Freitext in notes — vorher landete
    # z.B. "RPE 9" nur als String in notes, weil hier kein eigener Parameter
    # existierte (Fix nach User-Feedback 2026-09-09).
    if effort is not None:
        session["effort"] = effort
    if location is not None:
        session["location"] = location
    if duration is not None:
        session["duration"] = duration
    return session


# ── Öffentliche Funktionen (von fitness/log/cli.py als `add`/`wizard` gemountet) ─

def add_exercise(
    exercise: str,
    *,
    sets: int = 1,
    reps: str = "",
    weight: str = "",
    block: str | None = None,
    notes: str | None = None,
    effort: int | None = None,
    location: str | None = None,
    duration: int | None = None,
    day: str | None = None,
    session_id: str | None = None,
    uid_override: str | None = None,
    dry_run: bool = False,
) -> None:
    """Eine Übung (N Sätze) zur Kraft-Session des Tages hinzufügen — merged, überschreibt nicht."""
    reps_series = _parse_series(reps, sets, "reps")
    weight_series = _parse_series(weight, sets, "weight")
    sets_array = [{"reps": reps_series[i], "weight": weight_series[i]} for i in range(sets)]

    ex = resolve_exercise(exercise)
    uid = uid_override or detect_uid()
    target_day = day or date.today().isoformat()

    console.print(f"[dim]→ {target_day}  uid={uid}[/dim]")
    console.print(f"  [bold]{ex['name']}[/bold]  {sets}× " + " / ".join(f"{r}×{w}kg" for r, w in zip(reps_series, weight_series)))
    if effort is not None:
        console.print(f"  [dim]RPE {effort}[/dim]")
    if location:
        console.print(f"  [dim]📍 {location}[/dim]")
    if duration is not None:
        console.print(f"  [dim]⏱ {duration}min[/dim]")

    if dry_run:
        logger.info("(dry-run, nichts gesendet)")
        return

    current = get_session(uid, target_day, session_id)
    merged = merge_exercise_into_session(
        current, ex, sets_array, block, effort=effort, location=location, duration=duration,
    )
    if notes:
        merged["notes"] = (merged.get("notes", "") + f"\n{ex['name']}: {notes}").strip()

    r = post_session(uid, target_day, session_id, merged)
    if r.get("ok"):
        logger.success(f"geloggt → {target_day} ({ex['name']}, {sets} Sätze)")
    else:
        logger.error(f"Server-Fehler: {r}")
        raise typer.Exit(1)


def run_wizard(*, day: str | None = None, uid_override: str | None = None) -> None:
    """Interaktiver Dialog: Block wählen, Übungen + Sätze eintippen, bis Abbruch.

    Baut jeden Schritt intern auf denselben Merge-/Auflösungs-Helpern wie
    add_exercise() auf (kein eigener POST-Pfad).
    """
    uid = uid_override or detect_uid()
    target_day = day or date.today().isoformat()
    console.print(f"[bold cyan]Kraft-Session[/bold cyan]  [dim]{target_day}  uid={uid}[/dim]")

    block = Prompt.ask("Block (z.B. Push/Pull/Legs, leer = unverändert lassen)", default="")
    effort_raw = Prompt.ask("Effort/RPE der ganzen Session (1-10, leer = unverändert lassen)", default="")
    effort = int(effort_raw) if effort_raw.strip().isdigit() else None
    location = Prompt.ask("Ort (z.B. Studio-Name, leer = unverändert lassen)", default="").strip() or None
    duration_raw = Prompt.ask("Dauer in Minuten (leer = unverändert lassen)", default="")
    duration = int(duration_raw) if duration_raw.strip().isdigit() else None

    first = True
    while True:
        exercise = Prompt.ask("[bold]Übung[/bold] (leer = fertig)", default="")
        if not exercise:
            break
        sets = IntPrompt.ask("  Sätze", default=3)
        reps = Prompt.ask("  Reps (z.B. 8 oder 8,8,6)", default="8")
        weight = Prompt.ask("  Gewicht kg (z.B. 60 oder 60,60,65)", default="0")
        notes = Prompt.ask("  Notiz (leer = keine)", default="")

        ex = resolve_exercise(exercise)
        console.print(f"  → [green]{ex['name']}[/green]")
        if not Confirm.ask("  Übernehmen?", default=True):
            continue

        reps_series = _parse_series(reps, sets, "reps")
        weight_series = _parse_series(weight, sets, "weight")
        sets_array = [{"reps": reps_series[i], "weight": weight_series[i]} for i in range(sets)]

        current = get_session(uid, target_day, None)
        merged = merge_exercise_into_session(
            current, ex, sets_array, block if first else None,
            effort=effort if first else None,
            location=location if first else None,
            duration=duration if first else None,
        )
        if notes:
            merged["notes"] = (merged.get("notes", "") + f"\n{ex['name']}: {notes}").strip()
        r = post_session(uid, target_day, None, merged)
        if r.get("ok"):
            logger.success(f"{ex['name']} geloggt ({sets} Sätze)")
        else:
            logger.error(f"Server-Fehler: {r}")
        first = False

    console.print("[dim]Session beendet.[/dim]")
