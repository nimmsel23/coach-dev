import csv
import io
import re
import pandas as pd
import dataclasses
import asyncio
from datetime import date, datetime, timedelta
from typing import Any
from fastapi import APIRouter, Request, Query, HTTPException

from fitness.api.config import (
    RUNTIME, SESS_ROOT, _uid_from_request, _read_json, _write_json,
    _last_dates, _record_to_dict, logger, load_klienten_registry
)
from db.schemas import (
    CoachFeedResponse, CoachProfilesResponse, CoachFeedbackRequest,
    CoverageDetailedResponse, CoverageAnatomyResponse, CoverageGapsResponse
)
from fitness.catalog import coverage as cov_module
from fitness.catalog.planner import build_plan
from fitness.catalog.weekly import build_weekly_coverage
from fitness.firestore.mirror import mirror_session
from fitness.data import load_client_registry
from fitness.log.console.drafts import find_draft_path, list_drafts, mark_status
from fitness.paths import AOS_USERS

router = APIRouter()

# Constants / Fallbacks
_DOW_DE = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"]
_FALLBACK_PLAN = {
    "Mo": ("Push",      ["Incline Dumbbell Press", "Dips", "Lateral Raise", "Cable Fly", "Triceps Extension"]),
    "Di": ("Pull",      ["Pull-Up", "Row", "Lat Pulldown", "Face Pull", "Biceps Curl"]),
    "Mi": ("Legs",      ["Squat", "Romanian Deadlift", "Lunge", "Leg Curl", "Calf Raise"]),
    "Do": ("Upper",     ["Bench Press", "Row", "Overhead Press", "Pulldown", "Curl"]),
    "Fr": ("Lower",     ["Deadlift", "Split Squat", "Hip Thrust", "Leg Curl", "Calf Raise"]),
    "Sa": ("Full Body", ["Squat", "Press", "Row", "Hinge", "Carry"]),
    "So": ("Recovery",  ["Mobility", "Walk", "Core Breathing"]),
}
_ROLE_W = {"primary": 1.0, "secondary": 0.5, "stabilizer": 0.2}
# Spiegel von src/lib/db/shared/scoring.js: Kraft × RPE/10, Cardio leichter,
# Split-Chip ohne Übungen = ganzer Muskelkomplex pauschal als primary.
_ACTIVITY_WEIGHT = 0.5
_PUSH = ["chest", "shoulders", "triceps"]
_PULL = ["upper_back", "middle_back", "biceps"]
_LEGS = ["quadriceps", "hamstrings", "glutes", "calves"]
_BLOCK_MUSCLES = {
    "push": _PUSH, "pull": _PULL, "legs": _LEGS,
    "upper": _PUSH + _PULL, "lower": _LEGS, "full": _PUSH + _PULL + _LEGS + ["abs"],
}

def _effort_factor(sess: dict) -> float:
    try:
        rpe = float((sess or {}).get("effort"))
    except (TypeError, ValueError):
        return 1.0
    return min(rpe, 10.0) / 10.0 if rpe > 0 else 1.0

def _today() -> str:
    return date.today().isoformat()

def _exercise_hits(sess: dict) -> list[tuple[str, str, float]]:
    """Rohe (Muskel, Rolle, Gewicht)-Treffer einer Session, aus geloggten
    Übungen UND einem geloggten Cardio/Activity-Finisher (z.B. Schwimmen) —
    Activities fehlten hier zuvor komplett, dadurch trug z.B. Brustschwimmen
    nichts zur Brust-Coverage bei."""
    rows: list[tuple[str, str, float]] = []
    eff = _effort_factor(sess)
    for ex in (sess or {}).get("exercises", []):
        for role, muscles in (
            ("primary",    ex.get("primaryMuscles") or ex.get("primary_muscles") or []),
            ("secondary",  ex.get("secondaryMuscles") or ex.get("secondary_muscles") or []),
            ("stabilizer", ex.get("stabilizers") or []),
        ):
            w = _ROLE_W[role] * eff
            for m in muscles:
                rows.append((cov_module.normalize_muscle_id(m), role, w))
    activity = (sess or {}).get("activity") or {}
    act_primary = set(activity.get("primaryMuscles") or [])
    for m in (activity.get("muscles") or []):
        role = "primary" if m in act_primary else "secondary"
        rows.append((cov_module.normalize_muscle_id(m), role, _ROLE_W[role] * _ACTIVITY_WEIGHT))
    if not (sess or {}).get("exercises"):
        block = str((sess or {}).get("block") or "").strip().lower()
        for m in _BLOCK_MUSCLES.get("full" if block == "full body" else block, []):
            rows.append((cov_module.normalize_muscle_id(m), "primary", _ROLE_W["primary"] * eff))
    return rows

def _normalized_session_hits(sess: dict) -> list[tuple[str, str, float]]:
    """Max-per-Muskel-Normalisierung: pro Session zählt für einen Muskel nur
    der höchste Rollen-Treffer (nicht die Summe über alle Übungen).
    One-Set-to-Failure-Philosophie: jede geloggte Übung ist ungefähr gleich
    hart, mehrere Übungen für denselben Muskel bedeuten mehr Breite, nicht
    automatisch mehr Gesamtbelastung — sonst zählt ein 4-Übungen-Rücken-
    Workout allein wegen der Übungsanzahl mehr als ein 1-2-Übungen-Brust-
    Workout. (Die zuvor versuchte Session-Budget-Skalierung war zu
    aggressiv — sie hat pro Session auf einen festen Gesamtwert gedeckelt,
    wodurch nach ein paar Tagen fast jeder Muskel auf denselben Wert
    konvergierte.)"""
    raw = _exercise_hits(sess)
    best: dict[str, tuple[str, float]] = {}
    for m, role, w in raw:
        cur = best.get(m)
        if cur is None or w > cur[1]:
            best[m] = (role, w)
    return [(m, role, w) for m, (role, w) in best.items()]

def _coverage_hits(uid: str, days: int) -> dict[str, float]:
    sess_dir = SESS_ROOT / uid / "sessions"
    today = date.today()
    rows: list[tuple[str, float]] = []
    for i in range(days):
        day = (today - timedelta(days=i)).isoformat()
        sess = _read_json(sess_dir / f"{day}.json") if sess_dir.exists() else None
        for m, _role, w in _normalized_session_hits(sess):
            rows.append((m, w))
    if not rows:
        return {}
    df = pd.DataFrame(rows, columns=["muscle", "weight"])
    return df.groupby("muscle")["weight"].sum().to_dict()


# ── Coach Feed & Profiles ───────────────────────────────────────────────────
@router.get("/fitness/coach/feed", response_model=CoachFeedResponse)
def coach_feed(limit: int = 100):
    if not SESS_ROOT.exists():
        return {"ok": True, "feed": []}
    
    uids = [
        d.name for d in SESS_ROOT.iterdir()
        if d.is_dir() and d.name not in ("default", "kb")
    ]
    
    feed = []
    for uid in uids:
        sess_dir = SESS_ROOT / uid / "sessions"
        if not sess_dir.exists():
            continue
        
        for f in sess_dir.glob("*.json"):
            if "history" in f.name:
                continue
            
            data = _read_json(f)
            if not data:
                continue
            
            date_str = f.name.replace(".json", "")
            day = date_str.split("__")[0]
            
            feed.append({
                "id": f"{uid}__{date_str}",
                "userId": uid,
                "date": data.get("date") or day,
                "exercises": data.get("exercises") or [],
                "effort": data.get("effort"),
                "mood": data.get("mood") or "",
                "notes": data.get("notes") or "",
                "coachFeedback": data.get("coachFeedback") or "",
                "type": "workout"
            })
            
    feed.sort(key=lambda x: x["date"], reverse=True)
    return {"ok": True, "feed": feed[:limit]}

@router.get("/fitness/coach/profiles", response_model=CoachProfilesResponse)
def coach_profiles():
    klienten = load_klienten_registry()
    profiles = {uid: {"displayName": meta["name"], "uid": uid, "slug": meta["slug"]} for uid, meta in klienten.items()}

    if not SESS_ROOT.exists():
        return {"ok": True, "profiles": profiles}

    uids = [
        d.name for d in SESS_ROOT.iterdir()
        if d.is_dir() and d.name not in ("default", "kb")
    ]

    for uid in uids:
        if uid in profiles:
            continue  # Klienten-Registry hat Vorrang
        sess_dir = SESS_ROOT / uid / "sessions"
        display_name = uid[:8]
        if sess_dir.exists():
            files = sorted(sess_dir.glob("*.json"), reverse=True)
            if files:
                last_sess = _read_json(files[0])
                if last_sess:
                    if last_sess.get("user_name"):
                        display_name = last_sess["user_name"]
                    elif last_sess.get("user_email"):
                        display_name = last_sess["user_email"]
        profiles[uid] = {"displayName": display_name, "uid": uid}

    return {"ok": True, "profiles": profiles}

@router.post("/fitness/coach/feedback")
async def coach_feedback(body: CoachFeedbackRequest):
    clean_session_id = body.sessionId.replace(f"{body.userId}__", "")
    sess_file = SESS_ROOT / body.userId / "sessions" / f"{clean_session_id}.json"
    
    if not sess_file.exists():
        raise HTTPException(status_code=404, detail="session not found")
        
    data = _read_json(sess_file, {})
    data["coachFeedback"] = body.text
    data["feedbackAt"] = datetime.utcnow().isoformat() + "Z"
    _write_json(sess_file, data)
    
    # Mirror feedback to Firestore in background
    day = clean_session_id.split("__")[0]
    asyncio.get_event_loop().run_in_executor(None, mirror_session, day, data, body.userId)
    
    return {"ok": True}


# ── Plan & Blocks ────────────────────────────────────────────────────────────
@router.get("/plan/today")
def plan_today(request: Request, date_: str = Query(None, alias="date")):
    from fitness.runtime.session_store import parse_session_doc_id, session_order_key

    day = date_ or _today()
    uid = _uid_from_request(request)
    plan = _read_json(RUNTIME / "plan.json")
    einheiten = (plan or {}).get("einheiten", [])

    # Letztes geloggtes Workout ermitteln (block-Feld), unabhängig vom Wochentag.
    sess_dir = SESS_ROOT / uid / "sessions"
    last_block, last_logged_at = None, None
    if sess_dir.exists():
        candidates = []
        for f in sess_dir.glob("*.json"):
            try:
                parse_session_doc_id(f.stem)
            except ValueError:
                continue
            sess = _read_json(f)
            if not isinstance(sess, dict) or not sess.get("block"):
                continue
            try:
                mtime_ns = f.stat().st_mtime_ns
            except OSError:
                mtime_ns = 0
            candidates.append((session_order_key(f.stem, sess, mtime_ns=mtime_ns), f, sess))
        if candidates:
            _key, latest_file, latest = max(candidates, key=lambda item: item[0])
            last_block = latest["block"]
            last_logged_at = latest.get("date") or latest_file.stem.split("__", 1)[0]

    # Rotation statt Wochentag-Matching: nächste Einheit nach der zuletzt geloggten.
    if einheiten:
        last_idx = next((i for i, e in enumerate(einheiten) if e.get("name") == last_block), -1)
        next_unit = einheiten[(last_idx + 1) % len(einheiten)]
        exercises = [
            u["name"]
            for a in next_unit.get("abschnitte", [])
            for u in (a.get("übungen") or a.get("uebungen") or [])
        ]
        return {"ok": True, "suggestion": {
            "block": next_unit["name"], "exercises": exercises,
            "lastBlock": last_block, "lastLoggedAt": last_logged_at,
        }}

    dow = _DOW_DE[(datetime.fromisoformat(day + "T12:00:00").weekday() + 1) % 7]
    block, exercises = _FALLBACK_PLAN.get(dow, ("Full Body", ["Squat", "Press", "Row"]))
    return {"ok": True, "suggestion": {
        "day": dow, "block": block, "exercises": exercises,
        "lastBlock": last_block, "lastLoggedAt": last_logged_at,
    }}

@router.get("/blocks")
def blocks():
    defaults = [
        {"id": "push",  "label": "Push",  "muscle_groups": ["chest", "shoulders", "arms"]},
        {"id": "pull",  "label": "Pull",  "muscle_groups": ["back", "arms"]},
        {"id": "legs",  "label": "Legs",  "muscle_groups": ["quadriceps", "hamstrings", "glutes", "calves"]},
        {"id": "upper", "label": "Upper", "muscle_groups": ["chest", "back", "shoulders", "arms"]},
        {"id": "lower", "label": "Lower", "muscle_groups": ["quadriceps", "hamstrings", "glutes", "calves"]},
    ]
    plan = _read_json(RUNTIME / "plan.json")
    for unit in (plan or {}).get("einheiten", []):
        bid = unit.get("name", "").strip().lower().replace(" ", "_")
        if not bid:
            continue
        existing = next((b for b in defaults if b["id"] == bid), None)
        if existing:
            existing["muscle_groups"] = list(set(existing["muscle_groups"] + (unit.get("muscle_groups") or [])))
        else:
            defaults.append({"id": bid, "label": unit.get("name", bid), "muscle_groups": unit.get("muscle_groups") or []})
    return {"ok": True, "blocks": defaults}

@router.get("/fitness/plan")
@router.post("/fitness/plan")
async def fitness_plan(request: Request, template: str = "", split: str = "", day: str = "", goal: str = ""):
    params: dict = {}
    if request.method == "POST":
        try:
            params = await request.json()
        except Exception:
            params = {}
    else:
        params = {"template": template, "split": split, "day": day, "goal": goal}
    try:
        result = build_plan(params)
        return {"ok": True, "plan": _record_to_dict(result) if dataclasses.is_dataclass(result) else result}
    except Exception as exc:
        logger.error(f"fitness_plan: {exc}")
        raise HTTPException(500, detail=str(exc))

@router.get("/fitness/weekly")
def fitness_weekly(week: str = "current"):
    try:
        result = build_weekly_coverage(week)
        return {"ok": True, **result}
    except Exception as exc:
        logger.error(f"fitness_weekly {week}: {exc}")
        raise HTTPException(500, detail=str(exc))


# ── Coverage ─────────────────────────────────────────────────────────────────
@router.get("/coverage/detailed", response_model=CoverageDetailedResponse)
def coverage_detailed(request: Request, days: int = Query(7, le=90, ge=1)):
    uid  = _uid_from_request(request)
    hits = _coverage_hits(uid, days)
    taxonomy = cov_module.load_muscle_taxonomy()
    result = []
    for mid, score in sorted(hits.items(), key=lambda x: -x[1]):
        info = taxonomy.get(mid, {})
        result.append({
            "id": mid,
            "name_en": info.get("name_en", mid),
            "name_de": info.get("name_de", mid),
            "totalScore": round(score, 2),
        })
    return {"ok": True, "days": days, "muscles": result}

@router.get("/coverage/anatomy", response_model=CoverageAnatomyResponse)
def coverage_anatomy(request: Request, days: int = Query(7, le=90, ge=1)):
    uid      = _uid_from_request(request)
    sess_dir = SESS_ROOT / uid / "sessions"
    today    = date.today()
    taxonomy = cov_module.load_muscle_taxonomy()
    rows: list[dict] = []
    for i in range(days):
        day  = (today - timedelta(days=i)).isoformat()
        sess = _read_json(sess_dir / f"{day}.json") if sess_dir.exists() else None
        for m, role, w in _normalized_session_hits(sess):
            rows.append({"muscle": m, "name_en": taxonomy.get(m, {}).get("name_en", m), "role": role, "w": w})
    if not rows:
        return {"ok": True, "days": days, "muscles": []}
    df = pd.DataFrame(rows)
    pivot = df.pivot_table(index="muscle", columns="role", values="w", aggfunc="sum", fill_value=0).reset_index()
    pivot.columns.name = None
    for col in ("primary", "secondary", "stabilizer"):
        if col not in pivot.columns:
            pivot[col] = 0.0
    pivot = pivot.join(df.groupby("muscle")["name_en"].first(), on="muscle")
    pivot["primaryHits"]   = pivot["primary"].round(2)
    pivot["secondaryHits"] = pivot["secondary"].round(2)
    pivot["totalScore"]    = (pivot["primary"] + pivot["secondary"] + pivot["stabilizer"]).round(2)
    pivot = pivot.sort_values("totalScore", ascending=False)
    out = pivot[["muscle", "name_en", "primaryHits", "secondaryHits", "totalScore"]].rename(columns={"muscle": "id"}).to_dict("records")
    return {"ok": True, "days": days, "muscles": out}

@router.get("/coverage/gaps", response_model=CoverageGapsResponse)
def coverage_gaps(request: Request, days: int = Query(7, le=90, ge=1)):
    uid  = _uid_from_request(request)
    hits = _coverage_hits(uid, days)
    taxonomy = cov_module.load_muscle_taxonomy()
    gaps = [
        {"id": mid, "name_en": info.get("name_en", mid), "name_de": info.get("name_de", mid), "totalScore": 0}
        for mid, info in taxonomy.items()
        if hits.get(mid, 0) < 0.5
    ]
    return {"ok": True, "days": days, "gaps": gaps}


# ── Exports ──────────────────────────────────────────────────────────────────
@router.get("/export/csv")
def export_csv(request: Request, days: int = Query(14, le=365, ge=1), mode: str = "simple"):
    uid      = _uid_from_request(request)
    sess_dir = SESS_ROOT / uid / "sessions"
    is_det   = mode == "detailed"
    header   = ["date", "block", "location", "duration_min", "exercise", "sets_summary", "weight_max_kg", "note", "effort"] if is_det \
               else ["date", "block", "exercise", "note", "effort"]
    buf = io.StringIO()
    w   = csv.writer(buf, quoting=csv.QUOTE_ALL)
    w.writerow(header)
    for day in _last_dates(days):
        sess = _read_json(sess_dir / f"{day}.json") if sess_dir.exists() else None
        if not sess:
            continue
        block    = sess.get("block", "")
        effort   = sess.get("effort", "")
        location = sess.get("location", "")
        duration = sess.get("duration", "")
        for ex in sess.get("exercises", []):
            sets_arr = ex.get("setsArray") or []
            sets_summary = (
                " / ".join(
                    (f"{s['reps']}@{s['weight']}kg" if s.get("weight") else str(s["reps"]))
                    for s in sets_arr
                ) if sets_arr else (f"{ex.get('sets','')}×{ex.get('reps','')}" if ex.get("sets") else "")
            )
            weight_max = (
                max((float(s.get("weight") or 0) for s in sets_arr), default=0) or ""
            ) if sets_arr else ex.get("weight", "")
            if is_det:
                w.writerow([day, block, location, str(duration), ex.get("name", ""), sets_summary, str(weight_max), ex.get("note", ""), str(effort)])
            else:
                w.writerow([day, block, ex.get("name", ""), ex.get("note", ""), str(effort)])
    return {"ok": True, "filename": f"fitness-{days}d-{mode}-{_today()}.csv", "csv": buf.getvalue()}

@router.get("/export/pflichtaufgabe")
def export_pflichtaufgabe(request: Request):
    uid      = _uid_from_request(request)
    sess_dir = SESS_ROOT / uid / "sessions"
    files    = sorted(sess_dir.glob("*.json")) if sess_dir.exists() else []
    records  = []
    for nr, f in enumerate(files, 1):
        sess = _read_json(f)
        if not sess:
            continue
        try:
            y, m, d = f.stem.split("-")
        except ValueError:
            continue
        records.append({
            "Nr": nr,
            "Datum": f"{d}.{m}.{y}",
            "Trainingsart": sess.get("trainingsart") or sess.get("block", ""),
            "Ort": sess.get("location", ""),
            "Dauer (min)": sess.get("duration", ""),
        })
    if not records:
        return {"ok": True, "filename": f"trainingsprotokoll-pflichtaufgabe-{_today()}.csv", "csv": "", "count": 0}
    csv_str = pd.DataFrame(records).to_csv(index=False)
    return {"ok": True, "filename": f"trainingsprotokoll-pflichtaufgabe-{_today()}.csv", "csv": csv_str, "count": len(records)}

async def _run_export(kind: str, data: dict) -> dict:
    try:
        from fitness.catalog.agent.obsidian import (
            export_coach_sheet_note, export_teach_note,
            export_plan_note, export_weekly_report_note,
        )
    except ImportError as e:
        raise HTTPException(500, detail=f"obsidian module not available: {e}")

    import json

    if kind == "session":
        session = data.get("session") or data
        try:
            from fitness.catalog.agent.obsidian import export_session_note
            result = export_session_note(session)
        except (ImportError, AttributeError):
            result = {"note": json.dumps(session, indent=2)}
        return {"ok": True, "kind": kind, **result}

    if kind == "exercise_sheet":
        query = str(data.get("query") or data.get("exercise_id") or "").strip()
        if not query:
            raise HTTPException(400, detail="missing_query")
        result = export_coach_sheet_note(query, force=bool(data.get("force")))
        return {"ok": True, "kind": kind, **result}

    if kind == "exercise_lesson":
        exercise_id = str(data.get("exercise_id") or "").strip()
        if not exercise_id:
            raise HTTPException(400, detail="missing_exercise_id")
        result = export_teach_note(exercise_id, mode=data.get("mode", "trainer"), force=bool(data.get("force")))
        return {"ok": True, "kind": kind, **result}

    if kind == "plan":
        plan_data = data.get("plan") or build_plan(data.get("plan_options") or data)
        result = export_plan_note(plan_data, force=bool(data.get("force")))
        return {"ok": True, "kind": kind, **result}

    if kind == "weekly":
        result = export_weekly_report_note(week_selector=data.get("week_selector", "current"), force=bool(data.get("force")))
        return {"ok": True, "kind": kind, **result}

    raise HTTPException(400, detail="unknown_export_kind")

@router.post("/fitness/export/{kind}")
async def fitness_export(kind: str, request: Request):
    """Export session / plan / weekly / exercise_sheet / exercise_lesson → Obsidian/PDF."""
    data = await request.json()
    return await _run_export(kind, data)

@router.post("/fitness/export")
async def fitness_export_legacy(request: Request):
    """Legacy export endpoint where 'kind' is passed in the JSON body."""
    data = await request.json()
    kind = str(data.get("kind") or "").strip()
    if not kind:
        raise HTTPException(400, detail="missing_kind")
    return await _run_export(kind, data)


# ── KI-Insights: Trainingslücken-Check + persistierte Drafts ──────────────
# Portiert aus coach-dev (dort für den Coach-Tab entstanden) bzw. aus
# fitness/log/console/gap_check.py — dort läuft derselbe Check als Endlos-
# Loop für die Live-TUI (fitness-log console), hier als Einmal-Check on-
# demand für den Coach-Tab. Gleiche Persistenz (fitness/log/console/
# drafts.py), damit `fitness-log drafts` UND die Coach-UI dieselben
# Entwürfe sehen — ein Speicher, zwei Oberflächen.
NON_COACHING_STATUSES = frozenset({"freund", "interessent"})
_SAFE_UID = re.compile(r"[\w-]{1,128}", re.ASCII)


def _require_safe_uid(uid: str | None) -> str | None:
    """uid kommt aus Query/Body und landet in einem Dateipfad
    (drafts_dir(uid) macht mkdir(parents=True)) — ohne Prüfung wäre
    `uid=../../x` ein Path-Traversal. Das Backend hängt hinter dem Funnel."""
    if uid is None or uid == "":
        return None
    if not _SAFE_UID.fullmatch(uid):
        raise HTTPException(400, detail="invalid_uid")
    return uid


def _client_last_session_and_journal(uids: list[str]) -> tuple[str | None, str]:
    last_date = None
    for uid in uids:
        sdir = AOS_USERS / uid / "fitness" / "sessions"
        if not sdir.exists():
            continue
        dates = sorted((f.stem[:10] for f in sdir.glob("*.json") if len(f.stem) >= 10), reverse=True)
        if dates and (last_date is None or dates[0] > last_date):
            last_date = dates[0]

    journal_text = ""
    for uid in uids:
        jdir = AOS_USERS / uid / "fitness" / "journal"
        if not jdir.exists():
            continue
        for jf in sorted(jdir.glob("*.md"), reverse=True)[:5]:
            journal_text += jf.read_text(encoding="utf-8") + "\n"
    return last_date, journal_text


@router.get("/fitness/coach/gaps")
def coach_gaps(uid: str | None = Query(None)):
    """Einmal-Check (kein Loop): für aktive Klienten (oder einen einzelnen,
    via ?uid=) wird geprüft, ob eine Trainingslücke >= GAP_THRESHOLD_DAYS
    besteht und ob das Journal sie plausibel erklärt (Gemini + Haiku-Review,
    siehe coach_ai.py). Best-effort: liefert leere Liste statt 500, wenn die
    KI-Calls fehlschlagen (kein API-Key etc.) — das Frontend zeigt dann
    einfach keine Gap-Badges, bricht aber nicht."""
    from fitness.catalog.agent.coach_ai import GAP_THRESHOLD_DAYS, check_training_gap

    uid = _require_safe_uid(uid)
    registry = load_client_registry()
    seen_uids: set[str] = set()
    results: list[dict[str, Any]] = []

    for meta in registry.values():
        primary_uid = meta["uid"]
        if primary_uid in seen_uids:
            continue
        seen_uids.add(primary_uid)
        if uid and uid not in (meta.get("uids") or [primary_uid]):
            continue
        if meta.get("status") in NON_COACHING_STATUSES:
            continue

        uids = meta.get("uids") or [primary_uid]
        name = meta["name"]
        last_date, journal_text = _client_last_session_and_journal(uids)
        if not last_date:
            continue
        try:
            days_gap = (date.today() - date.fromisoformat(last_date)).days
        except Exception:
            continue
        if days_gap < GAP_THRESHOLD_DAYS:
            continue

        try:
            ai_result = check_training_gap(name, last_date, journal_text)
        except Exception:
            logger.exception(f"coach_gaps: KI-Check fehlgeschlagen fuer '{name}'")
            ai_result = None

        explained = bool(ai_result and ai_result.get("explained"))
        reason = (ai_result or {}).get("reason", "")
        if not explained:
            try:
                from fitness.log.console.drafts import save_draft
                save_draft(primary_uid, name, "gap", reason, days_gap=days_gap, last_session_date=last_date)
            except Exception:
                logger.exception(f"coach_gaps: Draft-Persistenz fehlgeschlagen fuer '{name}'")

        results.append({
            "uid": primary_uid, "name": name, "daysGap": days_gap,
            "lastSessionDate": last_date, "explained": explained, "reason": reason,
        })

    return {"ok": True, "gaps": results}


@router.get("/fitness/coach/drafts")
def coach_drafts(uid: str | None = Query(None), status: str | None = Query(None)):
    uid = _require_safe_uid(uid)
    drafts = list_drafts(uid)
    if status:
        drafts = [d for d in drafts if d.get("status", "pending") == status]
    return {"ok": True, "drafts": drafts}


@router.post("/fitness/coach/drafts/{draft_id}/review")
async def coach_drafts_review(draft_id: str, request: Request):
    body = await request.json()
    uid = _require_safe_uid(str(body.get("uid") or "").strip())
    new_status = str(body.get("status") or "").strip()
    if not uid or new_status not in ("approved", "dismissed"):
        raise HTTPException(400, detail="uid and status (approved|dismissed) required")
    path = find_draft_path(uid, draft_id)
    if not path:
        raise HTTPException(404, detail="draft not found")
    mark_status(path, new_status)
    return {"ok": True}
