from __future__ import annotations

import json
import os
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
import urllib.request
import urllib.parse
from typing import Any

import yaml
from loguru import logger
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler, FileCreatedEvent

from fitness.catalog.core.paths import DATA_DIR, runtime_root
from fitness.catalog.agent.inbox_actions import commit_inbox_draft, is_inbox_tombstoned
from fitness.catalog.api.firestore_push import run_kb_sync
from fitness.catalog.core.exercise_schema import apply_exercise_schema
from fitness.catalog.core.inbox_pipeline import build_inbox_draft_seed, preserve_reenrich_provenance
from fitness.catalog.core.source_merge import build_external_seed
from fitness.catalog.core.resolver import resolve_query, find_by_id, build_exercise_index
from fitness.catalog.core.rich_utils import setup_logging
from fitness.catalog.agent.gemini import load_gemini_key, call_gemini
from fitness.catalog.core.muscle_normalization import normalize_exercise_muscles

# runtime_root()/users (= ~/.aos/fitness/users) ist physisch identisch mit
# ~/.aos/users/<uid>/fitness — Letzteres ist nur ein Symlink auf Ersteres
# (~/.aos/users/<uid>/fitness -> ~/.aos/fitness/users/<uid>). Beide Bäume
# sind also dieselben Daten, firestore.sync.pull()'s inbox-Writes landen
# hier zwangsläufig mit. ABER: Path.glob("**/...") folgt in Python 3.13+
# standardmäßig KEINEN Symlinks — ein Scan über den Symlink-Pfad mit "**"
# findet deshalb nichts, ein Scan über den physischen Pfad (hier) schon.

# --- Processing Logic ---

def _firestore_inbox_ref(file_path: Path):
    """Leitet (uid, doc_id) aus dem lokal gepullten Dateipfad ab.

    firestore.sync.pull() legt Firestore-inbox-Docs lokal als
    <runtime_root()>/users/<uid>/inbox/<doc_id>_<name>.json ab (doc_id = die
    echte Firestore-Dokument-ID, siehe firestore/sync.py — dort über den
    ~/.aos/users/<uid>/fitness-Symlink geschrieben, physisch aber hier).
    Kein Zugriff nötig, wenn die Datei aus einer anderen Quelle stammt (z.B.
    dem lokalen /fitness/inbox/queue-Endpoint) — dann geben wir einfach
    (None, None) zurück und der Aufrufer überspringt das Zurückschreiben.
    """
    try:
        uid = file_path.parent.parent.name
        doc_id, sep, _rest = file_path.stem.partition("_")
        if not sep:
            return None, None
        return uid, doc_id
    except Exception:
        return None, None


def _write_back_to_firestore_inbox(uid: str | None, doc_id: str | None, enriched_data: dict) -> None:
    """Aktualisiert das ursprüngliche fitness/{uid}/inbox/{doc_id}-Dokument
    auf status: 'ai_enriched' + die angereicherten Daten — sonst zeigt die
    Coach-Inbox-UI (InboxCard.jsx) für immer nur den pending_review-
    Platzhaltertext, obwohl die Anreicherung längst passiert ist. Best-effort:
    ein Firestore-Fehler hier darf den bereits erfolgreich geschriebenen
    lokalen KB-Draft nicht rückgängig machen.
    """
    if not uid or not doc_id:
        return
    try:
        from fitness.firestore.kb import get_db
        db = get_db()
        ref = db.collection("fitness").document(uid).collection("inbox").document(doc_id)
        if not ref.get().exists:
            return
        status = enriched_data.get("status", "ai_enriched")
        ref.update({"status": status, "enriched": enriched_data})
        logger.success(f"Firestore-Inbox aktualisiert: fitness/{uid}/inbox/{doc_id} → {status}")
    except Exception as e:
        logger.warning(f"Firestore-Inbox-Rückschreiben fehlgeschlagen ({uid}/{doc_id}): {e}")


def _load_existing_draft_exercise(target_file: Path) -> dict | None:
    """Liest das erste Exercise-Objekt aus einem bereits vorhandenen
    kb/inbox/inbox_*.yml-Draft — für den Firestore-Write-back, wenn ein
    anderer (frueherer) Submitter dieselbe Uebung schon enrichten liess."""
    try:
        wrapper = yaml.safe_load(target_file.read_text(encoding="utf-8")) or {}
        exercises = wrapper.get("exercises") or []
        return exercises[0] if exercises else None
    except Exception:
        return None


def process_inbox_file(file_path: Path, api_key: str | None):
    try:
        data = json.loads(file_path.read_text(encoding="utf-8"))
        name = data.get("name")
        if not name:
            file_path.unlink()
            return

        draft_id = str(data.get("exercise_id") or data.get("id") or name).strip()
        safe_name = draft_id.lower().replace(" ", "_")
        target_file = DATA_DIR / "inbox" / f"inbox_{safe_name}.yml"
        tombstone_data = {"exercise_id": safe_name, "display_name": name, "name": name}
        uid, doc_id = _firestore_inbox_ref(file_path)

        # Die drei folgenden "schon erledigt"-Fälle müssen den Firestore-
        # Ursprungseintrag trotzdem aktualisieren — sonst bleibt er für immer
        # auf pending_review stehen, obwohl die Übung längst enrichted/
        # abgelehnt/bekannt ist (Bug: früher wurde hier nur file_path.unlink()
        # + return gemacht, kein Write-back).
        if is_inbox_tombstoned(target_file.stem, tombstone_data):
            logger.info(f"Exercise inbox tombstoned, skipping: {name}")
            _write_back_to_firestore_inbox(uid, doc_id, {"status": "rejected", "reason": "tombstoned"})
            file_path.unlink()
            return

        if target_file.exists():
            logger.info(f"Draft bereits vorhanden, verlinke Firestore-Eintrag: {name}")
            existing = _load_existing_draft_exercise(target_file)
            if existing:
                _write_back_to_firestore_inbox(uid, doc_id, existing)
            file_path.unlink()
            return

        resolution = resolve_query(name)
        if resolution.matched and resolution.confidence == "high":
            logger.info(f"Exercise already in catalog ({resolution.canonical_id}), skipping: {name}")
            _write_back_to_firestore_inbox(uid, doc_id, {
                "status": "resolved",
                "resolved_exercise_id": resolution.canonical_id,
                "resolved_display_name": getattr(resolution, "display_name", resolution.canonical_id),
            })
            file_path.unlink()
            return

        logger.info(f"Enriching NEW exercise: {name}")

        # Falls resolve_query() einen vorhandenen (nicht-high-confidence)
        # Record findet, z.B. aus unreviewed_wger.yml mit einer echten
        # original_description von wger selbst, muss Gemini diese Daten als
        # Grundlage bekommen statt komplett blind (nur der nackte Name) neu
        # zu erfinden — sonst geht die wger-Originalbeschreibung beim
        # Enrichment verloren statt verfeinert zu werden.
        existing_data = build_inbox_draft_seed(
            name,
            safe_name,
            data if isinstance(data, dict) else None,
            restart=False,
        )

        enriched_data = call_gemini(name, safe_name, api_key, existing_data=existing_data)

        if enriched_data:
            uid, doc_id = _firestore_inbox_ref(file_path)
            if uid:
                enriched_data["logged_by_uid"] = uid
            save_inbox_draft(target_file, enriched_data, f"AI generated base entry for {name}")
            _write_back_to_firestore_inbox(uid, doc_id, enriched_data)
            file_path.unlink()
    except Exception as e:
        logger.error(f"Failed to process {file_path}: {e}")

def process_inbox_file_virtual(
    ex_id: str,
    display_name: str,
    api_key: str | None,
    force: bool = False,
    feedback: str | None = None,
    current_data: dict | None = None,
    restart_pipeline: bool = False,
    target_file: Path | None = None,
) -> Path | None:
    safe_name = ex_id.lower().replace(" ", "_")
    target_file = target_file or DATA_DIR / "inbox" / f"inbox_{safe_name}.yml"

    if target_file.exists() and not force:
        return
    if not force and is_inbox_tombstoned(target_file.stem, {"exercise_id": ex_id, "display_name": display_name}):
        logger.info(f"Exercise inbox tombstoned, skipping proactive draft: {display_name}")
        return

    existing_data = build_inbox_draft_seed(
        display_name,
        ex_id,
        current_data,
        restart=restart_pipeline,
    )

    if feedback:
        logger.info(f"Feedback-Reenrichment for: {display_name} — \"{feedback}\"")
    else:
        logger.info(f"Proactive Expert-Enrichment for: {display_name} (using Wiki context)")
    enriched_data = call_gemini(display_name, safe_name, api_key, existing_data=existing_data, feedback=feedback)

    if enriched_data:
        if restart_pipeline:
            enriched_data = preserve_reenrich_provenance(enriched_data, existing_data)
        description = f"Reenriched (Coach-Feedback) for: {display_name}" if feedback else f"Proactively generated expert draft for: {display_name}"
        save_inbox_draft(target_file, enriched_data, description)
        return target_file
    return None

def save_inbox_draft(target_file: Path, data: dict, description: str):
    data = normalize_exercise_muscles(data)
    if "stabilizers" not in data: data["stabilizers"] = []
    if "variations" not in data: data["variations"] = []
    enriched_at = datetime.now(timezone.utc).isoformat()
    data["source"] = "unreviewed"
    data["enriched_at"] = enriched_at
    data = apply_exercise_schema(data, review_status="draft", ai_reviewed=False)
    
    wrapper = {
        "name": target_file.stem,
        "description": description,
        "generated_at": enriched_at,
        "enriched_at": enriched_at,
        "exercises": [data]
    }
    
    with target_file.open("w", encoding="utf-8") as f:
        yaml.safe_dump(wrapper, f, allow_unicode=True, sort_keys=False)
    
    logger.success(f"Generated expert draft: {target_file.name}")
    commit_inbox_draft(target_file)
    try:
        run_kb_sync()
    except Exception: pass

# --- Watchdog Handler ---

class InboxHandler(FileSystemEventHandler):
    def __init__(self, api_key: str | None):
        self.api_key = api_key

    def on_created(self, event):
        if not event.is_directory and event.src_path.endswith(".json"):
            path = Path(event.src_path)
            if "inbox" in path.parts:
                process_inbox_file(path, self.api_key)

# --- Main Watcher ---

from fitness.catalog.agent.ingestor import ingest_all_sessions, get_top_unreviewed_exercises
from fitness.catalog.core.auditor import write_biomechanical_report

def start_enrichment_watcher() -> tuple[Observer, threading.Thread, threading.Event]:
    """Startet Inbox-Observer + periodischen Analytics-Loop, nicht-blockierend.

    Embeddbar in einen bereits laufenden Event-Loop/Prozess (siehe
    fitness/api/main.py::lifespan) — analog zu firestore.mirror
    .start_catalog_watchers(). Der Observer läuft ohnehin in seinem eigenen
    Thread (watchdog-intern); der periodische Analytics-Loop (Session-
    Ingestion, proaktive Refinement, Biomechanik-Audit) läuft hier als
    eigener Daemon-Thread statt als blockierendes while+sleep im Hauptthread.
    Rückgabe: (observer, loop_thread, stop_event) — Aufrufer stoppt via
    stop_event.set(); observer.stop(); observer.join().
    """
    ingest_sessions_enabled = os.getenv("FITNESS_WATCHER_INGEST_SESSIONS", "").strip() == "1"
    proactive_refiner_enabled = os.getenv("FITNESS_WATCHER_PROACTIVE_REFINER", "").strip() == "1"
    analytics_interval_seconds = int(os.getenv("FITNESS_WATCHER_ANALYTICS_INTERVAL_SECONDS", "36000"))
    if not ingest_sessions_enabled:
        logger.info("Session ingestion disabled (set FITNESS_WATCHER_INGEST_SESSIONS=1 to enable).")
    if not proactive_refiner_enabled:
        logger.info("Proactive refiner disabled (set FITNESS_WATCHER_PROACTIVE_REFINER=1 to enable).")
    logger.info(f"Optional analytics interval: {analytics_interval_seconds}s.")
    api_key = load_gemini_key()
    if not api_key:
        logger.warning("GEMINI_API_KEY not found. Automated enrichment disabled.")

    users_dir = runtime_root() / "users"
    users_dir.mkdir(parents=True, exist_ok=True)

    # Initial scan for existing inbox files
    logger.info("Performing initial scan for pending inbox files...")
    for json_file in users_dir.glob("**/inbox/*.json"):
        process_inbox_file(json_file, api_key)

    observer = Observer()
    handler = InboxHandler(api_key)
    observer.schedule(handler, str(users_dir), recursive=True)
    observer.start()

    stop_event = threading.Event()

    def _analytics_loop():
        last_ingest = 0
        last_audit = 0
        while not stop_event.is_set():
            now = time.time()

            # Optional background analytics. Disabled by default: the inbox watcher
            # must not invent history rows or phantom exercise drafts.
            if now - last_ingest > analytics_interval_seconds:
                try:
                    if ingest_sessions_enabled:
                        logger.info("Running session ingestion check...")
                        ingested = ingest_all_sessions()
                        if ingested:
                            logger.info(f"Ingested {ingested} new training entries.")

                    if proactive_refiner_enabled:
                        logger.info("Running proactive refinement check...")
                        top_unreviewed = get_top_unreviewed_exercises(limit=3)
                        for ex_id, count in top_unreviewed:
                            logger.info(f"Proactively refining popular unreviewed exercise: {ex_id} (used {count} times)")
                            res = resolve_query(ex_id)
                            if res.matched:
                                process_inbox_file_virtual(res.canonical_id, res.display_name, api_key)

                    last_ingest = now
                except Exception as e:
                    logger.error(f"Periodic optional analytics failed: {e}")

            # Periodically run Biomechanical Auditor
            if now - last_audit > 7200:  # Every 2 hours
                logger.info("Running biomechanical consistency audit...")
                try:
                    report_path = write_biomechanical_report()
                    logger.info(f"Biomechanical audit complete. Report: {report_path}")
                    last_audit = now
                except Exception as e:
                    logger.error(f"Biomechanical audit failed: {e}")

            stop_event.wait(10)

    loop_thread = threading.Thread(target=_analytics_loop, name="enrichment-analytics-loop", daemon=True)
    loop_thread.start()

    return observer, loop_thread, stop_event


def run_watcher():
    """Foreground/Ad-hoc-CLI-Einstieg (`fitness enrich-watch` / `python3 -m
    catalog watch`) — blockiert bis Ctrl+C. Normalerweise läuft die
    Enrichment-Logik stattdessen eingebettet in fitness-api.service (siehe
    start_enrichment_watcher() + fitness/api/main.py::lifespan)."""
    setup_logging()
    logger.info("Starting fitness-agent watcher daemon...")
    observer, loop_thread, stop_event = start_enrichment_watcher()
    try:
        threading.Event().wait()
    except KeyboardInterrupt:
        stop_event.set()
        observer.stop()
    observer.join()
