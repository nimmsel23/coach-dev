"""Firestore Mirror Daemon — on_snapshot, alle Collections

Lauscht auf Änderungen in:
  fitness/<uid>/sessions/
  fitness/<uid>/journal/
  fitness/<uid>/habits/
  fitness/<uid>/habitJournals/
  fitness/<uid>/habitRecords/
  fitness/<uid>/inbox/            — Coach-Inbox (Exercise-Review-Drafts)
  nutrition/<uid>/logs/           — Fuel-Nährwert-Logs
  supplements/<uid>/logs/         — Fuel-Supplement-Logs
  supplements/<uid>/meta/catalog  — Fuel-Supplement-Katalog

Schreibt lokal nach ~/.aos/users/<uid>/fitness/ (Inbox landet zusätzlich
physisch unter runtime_root()/users/<uid>/inbox/, siehe fitness/catalog/
api/watcher.py — beide Pfade sind derselbe Ort, ~/.aos/users/<uid>/fitness
ist nur ein Symlink darauf) bzw. via firestore.fuel-Pfadhelfer nach
~/.aos/fuel/.
"""

import json
import threading
import time
from pathlib import Path

import yaml
from loguru import logger
from rich.console import Console
from rich.logging import RichHandler

from ._db import get_db, ts, UID, remote_wins
from .fuel import _data_dir, _nutrition_path, _supplements_path, _supplements_catalog_path, _strip_meta, _write_json, _owner_ok
from fitness.runtime.journal_store import upsert_entry as _journal_store_upsert

def _user_dir() -> Path:
    uid_file = Path.home() / ".aos" / "users" / ".active-uid"
    uid = uid_file.read_text().strip() if uid_file.exists() else UID
    return Path.home() / ".aos" / "users" / uid / "fitness"

USER_DIR   = _user_dir()
SESSIONS   = USER_DIR / "sessions"
JOURNAL    = USER_DIR / "journal"
HABITS_DIR = USER_DIR / "habits"
STATE_DIR  = Path.home() / ".aos" / "fitness" / "agent-state"
STATE_FILE = STATE_DIR / "fsm-known-journal.json"

console = Console()
_lock = threading.Lock()

# Zeitstempel (monotonic) des letzten lokalen Writes, den on_session selbst
# ausgelöst hat (Firestore → lokal). local_watch.py's Session-Filesystem-
# Watcher liest das, um sein eigenes Echo (lokaler Write löst sofort wieder
# einen Push aus) für ein paar Sekunden zu unterdrücken, statt in einen
# Push↔Pull-Ping-Pong zu laufen.
_recent_pull_writes: dict[str, float] = {}


def _load_known(path: Path) -> set:
    return set(json.loads(path.read_text())) if path.exists() else set()

def _save_known(path: Path, ids: set):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(sorted(ids), indent=2))


def _journal_upsert(md_file: Path, *, source: str, entry_id: str, body: str, ts_value: str = "") -> bool:
    """Upsert eines Journal-Eintrags in `journal/YYYY-MM-DD.entries.jsonl`
    (die SOT) und Neu-Render der `.md` daraus.

    Ersetzt das frühere marker-append-only-Modell: der Dedup-/Stabilitäts-
    Schlüssel ist jetzt `entry_id` (= Firestore-doc-id), Body-Änderungen am
    selben Eintrag werden als Edit übernommen. Idempotent — unveränderter
    Eintrag löst keinen Write aus. Byte-identische Render-Regel mit der
    Node-Seite (`journal-store.mjs`), siehe `fitness/runtime/journal_store.py`.
    """
    return _journal_store_upsert(
        md_file,
        {"id": entry_id, "source": source, "ts": ts_value, "body": body},
    )


def _uid_of(doc) -> str:
    """uid aus dem Dokumentpfad fitness/{uid}/{collection}/{docId} extrahieren
    (Pendant zu on_inbox's collection_group-Ansatz, siehe dort)."""
    return doc.reference.parent.parent.id


def _is_fitness_scoped(doc) -> bool:
    """Guard für collection_group-Listener: 'sessions'/'journal'/'habits' etc.
    sind generische Namen, die auch unter anderen Top-Level-Collections
    existieren können (habits-dev, journal-dev, relax-dev, ...) — ohne diese
    Prüfung würde ein collection_group-Listener fremde Pillar-Daten
    mitschneiden, nur weil die Subcollection zufällig gleich heißt."""
    return doc.reference.parent.parent.parent.id == "fitness"


def _user_fitness_dir(uid: str) -> Path:
    return Path.home() / ".aos" / "users" / uid / "fitness"


def _habit_name(uid: str, habit_id: str) -> str:
    """Löst eine habitId auf ihren Anzeigenamen auf — aus der lokalen
    `habits/definitions.json` (die `on_habits` pflegt). Fallback `Habit:<id>`,
    identisch zu `fitness/firestore/sync.py`, damit beide Schreiber denselben
    Journal-Body (und damit dieselbe `.entries.jsonl`) erzeugen."""
    defs_file = _user_fitness_dir(uid) / "habits" / "definitions.json"
    if defs_file.exists():
        try:
            for h in json.loads(defs_file.read_text()):
                if h.get("uuid") == habit_id:
                    # sync.py-Parität: bekannter Habit ohne name-Feld -> "Unknown Habit"
                    return h.get("name") or "Unknown Habit"
        except Exception:
            pass
    return f"Habit:{habit_id}"


def _inbox_local_dir(uid: str) -> Path:
    return Path.home() / ".aos" / "users" / uid / "fitness" / "inbox"


def _inbox_local_files(uid: str, doc_id: str) -> list[Path]:
    inbox_dir = _inbox_local_dir(uid)
    if not inbox_dir.exists():
        return []
    return sorted(inbox_dir.glob(f"{doc_id}_*.json"))


# ── Sessions ──────────────────────────────────────────────────────────────────

def on_session(col_snapshot, changes, read_time):
    for change in changes:
        if not _is_fitness_scoped(change.document):
            continue
        uid = _uid_of(change.document)
        sessions_dir = _user_fitness_dir(uid) / "sessions"
        doc_id = change.document.id
        if change.type.name == "REMOVED":
            # saveSession() (src/lib/db/firestore/sessions.js) löscht einen
            # date__id-Activity-Sidecar remote, sobald er in den kanonischen
            # Tag gemerged wurde. Ohne diesen Zweig blieb die lokale Kopie für
            # immer als Waise liegen — hier wird sie ← Firestore mitgelöscht.
            local = sessions_dir / f"{doc_id}.json"
            if local.exists():
                local.unlink()
                logger.info(f"session ← {uid}/{doc_id} entfernt (remote gelöscht)")
            _recent_pull_writes[doc_id] = time.monotonic()
            day = doc_id.split("__")[0]
            sid = doc_id.split("__")[1] if "__" in doc_id else None
            try:
                from catalog.api.sync_gateway import remove_session as _gw_remove
                _gw_remove(day, sid)
            except Exception as exc:
                logger.warning(f"sync_gateway remove {doc_id}: {exc}")
            continue
        if change.type.name not in ("ADDED", "MODIFIED"):
            continue
        data = change.document.to_dict()
        sessions_dir.mkdir(parents=True, exist_ok=True)
        local = sessions_dir / f"{doc_id}.json"
        # Konfliktprüfung bei JEDEM Event mit vorhandener lokaler Datei, nicht
        # nur bei "MODIFIED": Firestores on_snapshot liefert beim ersten
        # Listener-Start (also bei jedem Neustart von fitness-api.service)
        # ALLE Bestandsdokumente als "ADDED" aus, nicht nur echte Neuanlagen.
        # Ohne diese Prüfung hier überschrieb jeder Service-Neustart blind
        # sämtliche lokalen Sessions mit dem Firestore-Stand, unabhängig von
        # rev — live reproduziert, plausible Ursache der historischen
        # Massen-saved_at-Neuschreibung vom 2026-08-06 (die frühere Annahme,
        # das sei ein einmaliges Migrationsskript gewesen, ist nicht belegt —
        # kein Commit/Tool schreibt je das dort gefundene _merged_from-Feld).
        if local.exists():
            local_data = json.loads(local.read_text())
            # rev statt saved_at-String-Vergleich: monoton, serverseitig
            # verwaltet (server.mjs::freezeSnapshot / config.py::_freeze_
            # snapshot) — robust gegen Client-Uhr-Drift. Geteilte Entscheidung
            # mit fitness/firestore/sync.py::pull()/push() über _db.remote_wins(),
            # damit diese Logik nicht wie zuvor (saved_at-Bug) in zwei Dateien
            # auseinanderdriftet.
            if not remote_wins(local_data, data):
                continue
        out = {k: (ts(v) if hasattr(v, "isoformat") else v) for k, v in data.items()}
        local.write_text(json.dumps(out, indent=2, ensure_ascii=False))
        _recent_pull_writes[doc_id] = time.monotonic()
        logger.success(f"session ← {uid}/{doc_id}")
        # sync_gateway: Firestore-Pfad → SQLite (Python-only write, kein server.mjs beteiligt)
        day = doc_id.split("__")[0]
        sid = doc_id.split("__")[1] if "__" in doc_id else None
        try:
            from catalog.api.sync_gateway import sync_session as _gw_sync
            n = _gw_sync(day, out, session_id=sid)
            logger.debug(f"sync_gateway ← {doc_id}  {n} rows")
        except Exception as exc:
            logger.warning(f"sync_gateway {doc_id}: {exc}")


# ── Journal ───────────────────────────────────────────────────────────────────

_known_journal_path = STATE_DIR / f"fsm-known-journal.json"
_known_journal = _load_known(_known_journal_path)

def on_journal(col_snapshot, changes, read_time):
    global _known_journal
    for change in changes:
        if not _is_fitness_scoped(change.document):
            continue
        if change.type.name != "ADDED":
            continue
        uid = _uid_of(change.document)
        doc_id = change.document.id
        with _lock:
            if doc_id in _known_journal:
                continue
            _known_journal.add(doc_id)
            _save_known(_known_journal_path, _known_journal)
        data = change.document.to_dict()
        date = data.get("date", "")
        text = data.get("text", "").strip()
        time_iso = ts(data.get("time")) or ""
        time = time_iso[:16]
        if not date or not text:
            continue
        journal_dir = _user_fitness_dir(uid) / "journal"
        md_file = journal_dir / f"{date}.md"
        if _journal_upsert(md_file, source="journal", entry_id=doc_id, body=f"**{time}** {text}", ts_value=time_iso):
            logger.success(f"journal ← {uid}/{date}  {text[:60]}")


# ── Habits (Definitionen) ─────────────────────────────────────────────────────

def on_habits(col_snapshot, changes, read_time):
    changed_dirs: dict[str, Path] = {}
    defs_maps: dict[str, dict] = {}
    for change in changes:
        if not _is_fitness_scoped(change.document):
            continue
        if change.type.name not in ("ADDED", "MODIFIED"):
            continue
        uid = _uid_of(change.document)
        habits_dir = _user_fitness_dir(uid) / "habits"
        if uid not in defs_maps:
            habits_dir.mkdir(parents=True, exist_ok=True)
            defs_file = habits_dir / "definitions.json"
            defs = json.loads(defs_file.read_text()) if defs_file.exists() else []
            defs_maps[uid] = {h["uuid"]: h for h in defs}
            changed_dirs[uid] = habits_dir
        doc_id = change.document.id
        data   = change.document.to_dict()
        entry  = {
            "uuid":       doc_id,
            "name":       data.get("name", ""),
            "icon":       data.get("icon", "Activity"),
            "deleted":    bool(data.get("deleted", False)),
            "created_at": ts(data.get("created_at")) or "",
        }
        defs_maps[uid][doc_id] = entry
        logger.success(f"habit ← {uid}/{data.get('name', doc_id)}")
    for uid, habits_dir in changed_dirs.items():
        defs_file = habits_dir / "definitions.json"
        defs_file.write_text(json.dumps(list(defs_maps[uid].values()), indent=2, ensure_ascii=False))


# ── HabitRecords (Completions) ────────────────────────────────────────────────

_known_hr_path = STATE_DIR / f"fsm-known-habit-records-{UID}.json"
_known_hr = _load_known(_known_hr_path)

def on_habit_records(col_snapshot, changes, read_time):
    global _known_hr
    for change in changes:
        if not _is_fitness_scoped(change.document):
            continue
        if change.type.name != "ADDED":
            continue
        uid = _uid_of(change.document)
        doc_id = change.document.id
        with _lock:
            if doc_id in _known_hr:
                continue
            _known_hr.add(doc_id)
        data       = change.document.to_dict()
        date       = data.get("date", "")
        habit_id   = data.get("habitId", "")
        completion = data.get("completion", "DONE")
        rec_at     = (ts(data.get("recorded_at")) or "")[:16]
        if not date or not habit_id:
            continue

        user_dir = _user_fitness_dir(uid)

        # Records-File für diesen Tag aktualisieren
        habits_dir = user_dir / "habits"
        habits_dir.mkdir(parents=True, exist_ok=True)
        rec_dir  = habits_dir / "records"
        rec_dir.mkdir(parents=True, exist_ok=True)
        rec_file = rec_dir / f"{date}.json"
        records  = json.loads(rec_file.read_text()) if rec_file.exists() else []
        if not any(r.get("uuid") == habit_id for r in records):
            records.append({"uuid": habit_id, "date": date, "completion": completion, "ts": rec_at})
            rec_file.write_text(json.dumps(records, indent=2, ensure_ascii=False))

        # Journal-Markdown
        md_file = (user_dir / "journal") / f"{date}.md"
        hname = _habit_name(uid, habit_id)
        body = f"**{hname}** {completion}" + (f" _{rec_at}_" if rec_at else "")
        _journal_upsert(md_file, source="habit_records", entry_id=doc_id, body=body,
                        ts_value=(ts(data.get("recorded_at")) or ""))
        with _lock:
            _save_known(_known_hr_path, _known_hr)
        logger.success(f"habit_record ← {uid}/{date} {habit_id}")


# ── HabitJournals (Memoirs) ───────────────────────────────────────────────────

_known_hj_path = STATE_DIR / f"fsm-known-habit-journal-{UID}.json"
_known_hj = _load_known(_known_hj_path)

def on_habit_journals(col_snapshot, changes, read_time):
    global _known_hj
    for change in changes:
        if not _is_fitness_scoped(change.document):
            continue
        if change.type.name not in ("ADDED", "MODIFIED"):
            continue
        uid = _uid_of(change.document)
        doc_id = change.document.id
        with _lock:
            if doc_id in _known_hj:
                continue
            _known_hj.add(doc_id)
        data     = change.document.to_dict()
        date     = data.get("date", "")
        text     = data.get("text", "").strip()
        habit_id = data.get("habitId", "")
        feedback = data.get("coachFeedback", "").strip()
        if not date:
            continue
        md_file = (_user_fitness_dir(uid) / "journal") / f"{date}.md"
        hname = _habit_name(uid, habit_id)
        hj_time = (ts(data.get("recorded_at") or data.get("updated_at")) or "")[:16]
        body = f"**Habit: {hname}**" + (f" _{hj_time}_" if hj_time else "")
        body += f"\n{text}" if text else ""
        if feedback:
            body += f"\n> **Coach Feedback:** {feedback}"
        wrote = _journal_upsert(md_file, source="habit_journals", entry_id=doc_id, body=body,
                                ts_value=(ts(data.get("recorded_at") or data.get("updated_at")) or ""))
        with _lock:
            _save_known(_known_hj_path, _known_hj)
        if wrote:
            logger.success(f"habit_journal ← {uid}/{date} {habit_id} {text[:40]}")


# ── Inbox (Coach-Review-Drafts) ───────────────────────────────────────────────
#
# Muss collectionGroup-weit lauschen, NICHT nur auf fitness/{UID}/inbox (die
# eigene Coach-UID): Klienten (z.B. Simon, Matthias) legen ihre Inbox-Einträge
# unter ihrer EIGENEN uid an (src/lib/db/firestore/inbox.js::sendToInbox()).
# Mit dem alten Single-UID-Scope wurden Klienten-Einträge nie lokal gespiegelt
# → nie vom Gemini-Watcher (fitness/catalog/api/watcher.py) enrichted → blieben
# für immer als nackter pending_review-Stub in der Firebase-Coach-Inbox stehen,
# obwohl der lokale Modus (eigene UID) enrichten Content zeigte.
def on_inbox(col_snapshot, changes, read_time):
    for change in changes:
        doc_id, data = change.document.id, change.document.to_dict()
        uid = change.document.reference.parent.parent.id
        existing_files = _inbox_local_files(uid, doc_id)

        if change.type.name == "REMOVED":
            for local in existing_files:
                local.unlink(missing_ok=True)
            continue

        if change.type.name not in ("ADDED", "MODIFIED"):
            continue

        status = str((data or {}).get("status") or "").strip().lower()
        terminal_statuses = {"approved", "rejected", "resolved", "ai_enriched"}
        if status in terminal_statuses:
            for local in existing_files:
                local.unlink(missing_ok=True)
            logger.info(f"inbox ← {doc_id} entfernt (status={status}) uid={uid}")
            continue

        name = str(data.get("name", "unknown")).replace(" ", "_")
        inbox_dir = _inbox_local_dir(uid)
        inbox_dir.mkdir(parents=True, exist_ok=True)
        local = inbox_dir / f"{doc_id}_{name}.json"
        for stale in existing_files:
            if stale != local:
                stale.unlink(missing_ok=True)
        out = {k: (ts(v) if hasattr(v, "isoformat") else v) for k, v in data.items()}
        local.write_text(json.dumps(out, indent=2, ensure_ascii=False))
        logger.success(f"inbox ← {name} ({doc_id}) uid={uid} [{change.type.name.lower()}]")


# ── KB Exercises (Coach-Approvals aus dem Firebase-Inbox-Tab) ────────────────
#
# approveInbox() (src/lib/db/firestore/inbox.js) schreibt bei Approval NUR nach
# Firestore: fitness/kb/exercises/{exId} (source: "approved") +
# fitness/{uid}/inbox/{id}.status = "approved". Ohne diesen Listener bleibt der
# lokale Katalog (fitness/catalog/kb/) davon komplett unberührt — der nächste
# "fitness sync kb"-Push (One-Way lokal→Firestore) würde die approved Version
# sogar wieder mit dem alten unreviewten Stand überschreiben. Dieser Listener
# schließt den Kreis event-getrieben (on_snapshot, kein Polling):
#   1. approved Exercise → lokale Sammel-Datei kb/exercises/approved_from_firebase.yml
#   2. zugehöriger kb/inbox/inbox_*.yml-Draft wird lokal gelöscht (reviewt, fertig)

from fitness.catalog.core.paths import DATA_DIR as _CATALOG_DATA_DIR
from fitness.catalog.agent.inbox_actions import _git_commit_paths, _rebuild_runtime_catalog

_APPROVED_FILE = _CATALOG_DATA_DIR / "exercises" / "approved_from_firebase.yml"


def _slugify(name: str) -> str:
    return str(name or "").lower().replace(" ", "_")


def _remove_inbox_draft(exercise_id: str, display_name: str) -> Path | None:
    inbox_dir = _CATALOG_DATA_DIR / "inbox"
    if not inbox_dir.exists():
        return None
    candidates = {f"inbox_{_slugify(exercise_id)}.yml", f"inbox_{_slugify(display_name)}.yml"}
    for f in inbox_dir.glob("inbox_*.yml"):
        if f.name in candidates:
            f.unlink()
            logger.info(f"inbox draft entfernt (approved): {f.name}")
            return f
    return None


_CATALOG_MIRROR_LOCK = threading.Lock()


def _kb_content(data):
    """Transport hashes/timestamps and dictionary order are not catalog changes."""
    from datetime import date, datetime

    def normalize(value):
        if isinstance(value, (datetime, date)):
            return value.isoformat()
        if isinstance(value, dict):
            return {key: normalize(item) for key, item in value.items()}
        if isinstance(value, list):
            return [normalize(item) for item in value]
        return value

    return normalize({key: value for key, value in data.items() if key not in {"_hash", "updated_at", "synced_at"}})


def on_kb_exercises(col_snapshot, changes, read_time):
    # Initial/reconnected Firestore snapshots replay ADDED for all documents.
    # Compare semantic content before writing, and batch the whole callback.
    with _CATALOG_MIRROR_LOCK:
        doc = yaml.safe_load(_APPROVED_FILE.read_text(encoding="utf-8")) if _APPROVED_FILE.exists() else None
        if not isinstance(doc, dict):
            doc = {"name": "approved_from_firebase", "description": "Coach-approved via Firebase Inbox", "exercises": []}
        exercises = doc.setdefault("exercises", [])
        positions = {str(ex.get("exercise_id") or ex.get("id")): i for i, ex in enumerate(exercises)}
        changed_ids = []
        removed_drafts = []
        for change in changes:
            if change.type.name not in ("ADDED", "MODIFIED"):
                continue
            data = change.document.to_dict()
            if data.get("source") != "approved":
                continue
            ex_id = str(data.get("exercise_id") or data.get("id") or change.document.id)
            clean = _kb_content(data)
            clean.setdefault("exercise_id", ex_id)
            position = positions.get(ex_id)
            if position is not None and _kb_content(exercises[position]) == clean:
                continue
            if position is None:
                positions[ex_id] = len(exercises)
                exercises.append(clean)
            else:
                exercises[position] = clean
            changed_ids.append(ex_id)
            display_name = data.get("display_name") or data.get("name") or ex_id
            removed = _remove_inbox_draft(ex_id, display_name)
            if removed:
                removed_drafts.append(removed)

        if not changed_ids:
            return
        _APPROVED_FILE.parent.mkdir(parents=True, exist_ok=True)
        with _APPROVED_FILE.open("w", encoding="utf-8") as fh:
            yaml.safe_dump(doc, fh, allow_unicode=True, sort_keys=False)
        message = f"chore(catalog): sync {len(changed_ids)} approved exercise(s) from Firestore"
        logger.info(f"kb sync: {len(changed_ids)} changed, {len(removed_drafts)} inbox draft(s) resolved")
        _git_commit_paths([_APPROVED_FILE, *removed_drafts], message)
        _rebuild_runtime_catalog()


# ── Fuel (Nutrition / Supplements) ────────────────────────────────────────────

def on_nutrition(col_snapshot, changes, read_time):
    data_dir = _data_dir(UID)
    for change in changes:
        if change.type.name not in ("ADDED", "MODIFIED"):
            continue
        doc_id, data = change.document.id, change.document.to_dict()
        if not _owner_ok(data, UID, f"nutrition/{UID}/logs/{doc_id}"):
            continue
        _write_json(_nutrition_path(doc_id, data_dir), {**_strip_meta(data), "owner_uid": UID})
        logger.success(f"nutrition ← {doc_id}")


def on_supplements(col_snapshot, changes, read_time):
    data_dir = _data_dir(UID)
    for change in changes:
        if change.type.name not in ("ADDED", "MODIFIED"):
            continue
        doc_id, data = change.document.id, change.document.to_dict()
        if not _owner_ok(data, UID, f"supplements/{UID}/logs/{doc_id}"):
            continue
        _write_json(_supplements_path(doc_id, data_dir), {**_strip_meta(data), "owner_uid": UID})
        logger.success(f"supplements ← {doc_id}")


def on_supplements_catalog(doc_snapshot, changes, read_time):
    if not doc_snapshot:
        return
    data_dir = _data_dir(UID)
    doc = doc_snapshot[0]
    if not doc.exists:
        return
    if not _owner_ok(doc.to_dict(), UID, f"supplements/{UID}/meta/catalog"):
        return
    _write_json(_supplements_catalog_path(data_dir), {**_strip_meta(doc.to_dict()), "owner_uid": UID})
    logger.success("supplements catalog ← updated")


# ── Main ──────────────────────────────────────────────────────────────────────

def start_catalog_watchers() -> list:
    """Nur Katalog-Belange: Inbox-Drafts (Coach-Review) + approved
    kb/exercises (Rückweg nach Approval). Für den Katalog-Prozess (:9150,
    fitness/api/main.py lifespan) — bewusst KEIN User-Data-Sync (Sessions/
    Journal/Habits/Nutrition/Supplements), das ist nicht Aufgabe der
    Catalog-UI. Kein Logging-Setup, kein blockierendes Warten — eingebettet
    nutzbar in einem bereits laufenden Prozess mit eigenem Event-Loop."""
    db = get_db()
    watchers = [
        db.collection_group("inbox").on_snapshot(on_inbox),
        db.collection("fitness").document("kb").collection("exercises").on_snapshot(on_kb_exercises),
    ]
    logger.info("Listening → fitness/*/inbox [alle User, collectionGroup]")
    logger.info("Listening → fitness/kb/exercises [approved]")
    return watchers


def start_userdata_watchers() -> list:
    """Sessions/Journal/Habits/Nutrition/Supplements — reiner User-Data-Sync,
    läuft im eigenständigen fitness-firestore-daemon.service, NICHT mehr im
    Katalog-Prozess (:9150). Trennung 2026-07-30: Catalog-UI soll keine
    User-Data synchronisieren, das ist Aufgabe der Fitness-App-Seite.

    Sessions/Journal/Habits* laufen seit 2026-08-23 als collection_group-
    Listener (alle UIDs, nicht nur die eigene aktive) — analog zu on_inbox
    weiter unten, das denselben Single-UID-Bug schon 2026-08-xx für die
    Inbox gefixt hat. Vorher hörte dieser Daemon NUR auf fitness/{UID=eigene
    Coach-UID}/..., Klienten-Sessions (z.B. Matthias) landeten nie lokal,
    unabhängig davon ob der Daemon lief oder nicht — ein neuer Klient
    brauchte vorher zusätzlich manuelles Eintragen, jetzt greift's automatisch
    sobald die App unter fitness/{irgendeine-uid}/... schreibt. Nutrition/
    Supplements bleiben bewusst UID-scoped (Fuel-Daten des Coaches selbst,
    kein Klienten-Mirror-Bedarf hier)."""
    db  = get_db()
    watchers = [
        db.collection_group("sessions").on_snapshot(on_session),
        db.collection_group("journal").on_snapshot(on_journal),
        db.collection_group("habits").on_snapshot(on_habits),
        db.collection_group("habitRecords").on_snapshot(on_habit_records),
        db.collection_group("habitJournals").on_snapshot(on_habit_journals),
        db.collection("nutrition").document(UID).collection("logs").on_snapshot(on_nutrition),
        db.collection("supplements").document(UID).collection("logs").on_snapshot(on_supplements),
        db.collection("supplements").document(UID).collection("meta").document("catalog").on_snapshot(on_supplements_catalog),
    ]
    logger.info("Listening → fitness/*/[sessions|journal|habits|habitRecords|habitJournals] [alle User, collectionGroup]")
    logger.info(f"Listening → nutrition/{UID}/logs, supplements/{UID}/logs+meta")
    logger.info("Mirror → ~/.aos/users/<uid>/fitness/ (+ Fuel für die eigene UID)")
    return watchers


def main():
    logger.remove()
    logger.add(
        RichHandler(console=console, rich_tracebacks=True),
        format="{message}", level="INFO",
    )
    watchers = start_userdata_watchers()
    try:
        threading.Event().wait()
    except KeyboardInterrupt:
        for w in watchers:
            w.unsubscribe()


if __name__ == "__main__":
    main()


# ── Push-Stubs (fire-and-forget, für python-backend/server.py) ────────────────

from datetime import datetime

def mirror_session(date: str, session: dict, uid: str = UID) -> None:
    # Doc-ID muss wie lokal (fitness/api/config.py::_session_file) den
    # session_id-Suffix tragen, sonst kollabieren Mehrfach-Sessions
    # desselben Tages (Haupt-Session + HIIT-/Cardio-Sidecar) in Firestore
    # unter derselben Doc-ID und überschreiben sich gegenseitig, obwohl
    # sie lokal sauber getrennt bleiben. Node-Pendant (firestore-mirror.mjs
    # mirrorSession) macht das schon richtig — hier nachgezogen.
    session_id = session.get("session_id")
    target_id = f"{date}__{session_id}" if session_id else date
    try:
        db = get_db()
        # saved_at NICHT hier überschreiben — kommt bereits aus
        # _freeze_snapshot() (echte Editierzeit, rev-synchron). Ein erzwungenes
        # "jetzt" bei jedem Push täuschte dem rev-Gleichstand-Tie-Break in
        # on_session() eine neuere Remote-Version vor und löste einen
        # unnötigen Rückpull aus (live reproduziert, Ursache der historischen
        # Massen-saved_at-Neuschreibung vom 2026-08-06). Gespiegelt zu
        # firestore-mirror.mjs::mirrorSession() (Node-Pendant).
        out = {**session, "date": date}
        db.collection("fitness").document(uid).collection("sessions").document(target_id).set(out)
    except Exception as e:
        logger.warning(f"mirror_session fehler: {e}")

def mirror_session_delete(doc_id: str, uid: str = UID) -> None:
    """Löscht einen Session-Doc in Firestore — Gegenstück zu mirror_session()
    für den Fall, dass eine lokale Session-Datei entfernt wird (Duplikat-
    Cleanup, manuelle Reparatur o.ä.), nicht nur beim regulären App-Löschen
    über POST/DELETE /session."""
    try:
        db = get_db()
        db.collection("fitness").document(uid).collection("sessions").document(doc_id).delete()
    except Exception as e:
        logger.warning(f"mirror_session_delete fehler ({doc_id}): {e}")

def mirror_journal(date: str, entry: dict, uid: str = UID) -> None:
    try:
        db = get_db()
        db.collection("fitness").document(uid).collection("journal").add(
            {**entry, "date": date, "time": datetime.utcnow().isoformat()}
        )
    except Exception as e:
        logger.warning(f"mirror_journal fehler: {e}")

def mirror_plan(plan: dict, uid: str = UID) -> None:
    try:
        db = get_db()
        db.collection("fitness").document(uid).collection("plan").document("active").set(
            {**plan, "updated_at": datetime.utcnow().isoformat()}
        )
    except Exception as e:
        logger.warning(f"mirror_plan fehler: {e}")

def get_status() -> dict:
    try:
        db = get_db()
        return {"ok": True, "project": db.project}
    except Exception:
        return {"ok": False, "project": None}
