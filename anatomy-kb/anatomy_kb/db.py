"""
anatomy.sqlite — lokaler analytischer Layer

Tabellen:
  muscles           — aus muscles/*.yml
  exercises         — aus fitness-dev catalog
  exercise_muscles  — Muskel-Rollen pro Übung (primary/secondary/stabilizer)
  anatomy_teaching  — aus anatomy_teaching/*.yml (joint_actions, errors, cues)
  flashcard_scores  — aus anatomy-scores.json

DB: ~/.aos/fitness/anatomy.sqlite
"""
from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any

import yaml

from anatomy_kb.config import ANATOMY_KB_ROOT, CATALOG_EXERCISES, ANATOMY_TEACHING

DB_PATH = Path.home() / ".aos" / "fitness" / "anatomy.sqlite"
MUSCLES_DIR = ANATOMY_KB_ROOT / "muscles"
SCORES_FILE = Path.home() / ".aos" / "fitness" / "anatomy-scores.json"
TRAINING_DB = Path.home() / ".aos" / "fitness" / "sessions" / "training_history.sqlite"

# Katalog-Kategorie → muscle_ids (broad mapping, kein wger-Lookup nötig)
CATEGORY_MUSCLES: dict[str, list[str]] = {
    "chest":        ["pectoralis_major", "serratus_anterior"],
    "back":         ["latissimus_dorsi", "trapezius"],
    "lats":         ["latissimus_dorsi"],
    "upper_back":   ["trapezius"],
    "lower_back":   ["erector_spinae"],
    "shoulders":    ["anterior_deltoid"],
    "shoulders_front": ["anterior_deltoid"],
    "arms":         ["biceps_brachii", "triceps_brachii", "brachialis"],
    "upper_arm_front": ["biceps_brachii", "brachialis"],
    "upper_arm_back":  ["triceps_brachii"],
    "core":         ["rectus_abdominis", "obliquus_externus_abdominis"],
    "glutes":       ["gluteus_maximus"],
    "thigh_front":  ["quadriceps_femoris"],
    "thigh_back":   ["biceps_femoris"],
    "quads":        ["quadriceps_femoris"],
    "hamstrings":   ["biceps_femoris"],
    "calves":       ["gastrocnemius", "soleus"],
}

SCHEMA = """
CREATE TABLE IF NOT EXISTS muscles (
    muscle_id   TEXT PRIMARY KEY,
    wger_id     INTEGER,
    latin       TEXT,
    name_en     TEXT,
    name_de     TEXT,
    rbh_slug    TEXT,
    is_front    INTEGER,
    origin      TEXT,
    insertion   TEXT,
    innervation TEXT,
    function    TEXT,
    updated_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS exercises (
    exercise_id      TEXT PRIMARY KEY,
    name             TEXT,
    display_name     TEXT,
    category         TEXT,
    movement_pattern TEXT,
    equipment        TEXT,
    wger_id          INTEGER,
    unreviewed       INTEGER DEFAULT 0,
    updated_at       TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS exercise_muscles (
    exercise_id          TEXT,
    muscle_id            TEXT,
    role                 TEXT,
    function_in_exercise TEXT,
    PRIMARY KEY (exercise_id, muscle_id)
);

CREATE TABLE IF NOT EXISTS anatomy_teaching (
    exercise_id      TEXT PRIMARY KEY,
    title            TEXT,
    learning_goal    TEXT,
    joint_actions    TEXT,
    common_errors    TEXT,
    feel_cues        TEXT,
    coaching_cues    TEXT,
    quiz_prompts     TEXT,
    vault_tags       TEXT,
    updated_at       TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS flashcard_scores (
    muscle_id   TEXT,
    field       TEXT,
    correct     INTEGER DEFAULT 0,
    incorrect   INTEGER DEFAULT 0,
    last_seen   TEXT,
    PRIMARY KEY (muscle_id, field)
);

CREATE VIEW IF NOT EXISTS muscle_coverage AS
    SELECT
        m.muscle_id,
        m.latin,
        m.origin IS NOT NULL                                              AS has_anatomy,
        COUNT(DISTINCT em.exercise_id)                                    AS exercise_count,
        GROUP_CONCAT(DISTINCT em.exercise_id)                             AS exercises,
        COALESCE(fs.correct * 1.0 / NULLIF(fs.correct + fs.incorrect, 0), 0) AS score_rate,
        fs.last_seen                                                      AS last_flashcard
    FROM muscles m
    LEFT JOIN exercise_muscles em ON m.muscle_id = em.muscle_id
    LEFT JOIN flashcard_scores fs ON m.muscle_id = fs.muscle_id AND fs.field = 'origin'
    GROUP BY m.muscle_id;

CREATE VIEW IF NOT EXISTS weak_muscles AS
    SELECT muscle_id, latin, score_rate, last_flashcard, exercise_count
    FROM muscle_coverage
    WHERE has_anatomy = 1
      AND (score_rate < 0.6 OR last_flashcard IS NULL)
    ORDER BY score_rate ASC;

CREATE TABLE IF NOT EXISTS training_sessions (
    id          INTEGER PRIMARY KEY,
    date        TEXT NOT NULL,
    workout_id  TEXT,
    exercise_id TEXT NOT NULL,
    sets        INTEGER,
    reps        INTEGER,
    weight      REAL,
    rpe         INTEGER,
    done        INTEGER DEFAULT 1
);

CREATE VIEW IF NOT EXISTS muscle_training_freq AS
    SELECT
        em.muscle_id,
        m.latin,
        em.role,
        COUNT(DISTINCT ts.date)  AS session_days,
        COUNT(*)                 AS total_sets,
        MAX(ts.date)             AS last_trained
    FROM training_sessions ts
    JOIN exercise_muscles em ON ts.exercise_id = em.exercise_id
    JOIN muscles m ON em.muscle_id = m.muscle_id
    WHERE ts.done = 1
    GROUP BY em.muscle_id, em.role
    ORDER BY session_days DESC;
"""


def connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.executescript(SCHEMA)
    
    # Migration: unreviewed-Spalte nachrüsten falls nötig
    try:
        conn.execute("SELECT unreviewed FROM exercises LIMIT 1")
    except sqlite3.OperationalError:
        conn.execute("ALTER TABLE exercises ADD COLUMN unreviewed INTEGER DEFAULT 0")
        conn.commit()
        
    conn.commit()
    return conn


def _j(val: Any) -> str | None:
    return json.dumps(val, ensure_ascii=False) if val else None


def sync_muscles(conn: sqlite3.Connection) -> int:
    from .muscle_store import load_index
    index = load_index()
    count = 0
    for yml in sorted(MUSCLES_DIR.glob("*.yml")):
        doc = yaml.safe_load(yml.read_text(encoding="utf-8"))
        if not isinstance(doc, dict):
            continue
        muscle_id = doc.get("muscle_id", yml.stem)
        meta = index.get(muscle_id, {})
        
        conn.execute("""
            INSERT INTO muscles (muscle_id, wger_id, latin, name_en, name_de, rbh_slug, is_front,
                                 origin, insertion, innervation, function)
            VALUES (?,?,?,?,?,?,?,?,?,?,?)
            ON CONFLICT(muscle_id) DO UPDATE SET
                wger_id=excluded.wger_id, latin=excluded.latin,
                name_en=excluded.name_en, name_de=excluded.name_de,
                rbh_slug=excluded.rbh_slug,
                origin=excluded.origin, insertion=excluded.insertion,
                innervation=excluded.innervation, function=excluded.function,
                updated_at=datetime('now')
        """, (
            muscle_id,
            doc.get("wger_id") or meta.get("wger_id"),
            doc.get("latin") or meta.get("latin"),
            doc.get("name_en") or meta.get("name_en"),
            meta.get("name_de"),
            meta.get("rbh_slug"),
            1 if (doc.get("is_front") or meta.get("is_front")) else 0,
            doc.get("origin"),
            doc.get("insertion"),
            doc.get("innervation"),
            doc.get("function"),
        ))

        # exercise_muscles aus exercises-Block
        for ex_id, ex_data in (doc.get("exercises") or {}).items():
            conn.execute("""
                INSERT INTO exercise_muscles (exercise_id, muscle_id, role, function_in_exercise)
                VALUES (?, ?, NULL, ?)
                ON CONFLICT(exercise_id, muscle_id) DO UPDATE SET
                    function_in_exercise=excluded.function_in_exercise
            """, (ex_id, doc.get("muscle_id", yml.stem),
                  (ex_data or {}).get("function_in_exercise")))
        count += 1
    conn.commit()
    return count


def sync_exercises(conn: sqlite3.Connection) -> int:
    """Sync exercises from YAML files to SQLite, respecting tier priorities."""
    count = 0
    all_ymls = sorted(CATALOG_EXERCISES.glob("*.yml"))
    
    # Tier-Priorisierung (Expert gewinnt)
    bulk = [f for f in all_ymls if f.name.startswith("unreviewed_")]
    inbox = [f for f in all_ymls if f.name.startswith("inbox_")]
    expert = [f for f in all_ymls if f not in bulk and f not in inbox]
    
    sorted_files = bulk + inbox + expert
    
    for yml in sorted_files:
        doc = yaml.safe_load(yml.read_text(encoding="utf-8"))
        if not isinstance(doc, dict):
            continue
        for ex in doc.get("exercises", []):
            ex_id = ex.get("exercise_id") or ex.get("id")
            if not ex_id:
                continue
            conn.execute("""
                INSERT INTO exercises (exercise_id, name, display_name, category,
                                       movement_pattern, equipment, wger_id, unreviewed)
                VALUES (?,?,?,?,?,?,?,?)
                ON CONFLICT(exercise_id) DO UPDATE SET
                    name=excluded.name, category=excluded.category,
                    display_name=excluded.display_name,
                    movement_pattern=excluded.movement_pattern,
                    equipment=excluded.equipment,
                    wger_id=excluded.wger_id,
                    unreviewed=excluded.unreviewed,
                    updated_at=datetime('now')
            """, (
                ex_id,
                ex.get("name") or ex.get("display_name") or ex.get("german") or ex_id,
                ex.get("display_name") or ex.get("german"),
                ex.get("category"),
                ex.get("movement_pattern"),
                _j(ex.get("equipment")),
                ex.get("wger_id"),
                1 if (ex.get("unreviewed") or yml.name.startswith("unreviewed_")) else 0,
            ))

            # Muskel-Rollen aus Katalog-Kategorien auflösen
            # Wir verarbeiten von schwach nach stark, damit primary immer überschreibt.
            role_fields = [
                ("stabilizer", ex.get("stabilizers", [])),
                ("secondary",  ex.get("secondary_muscles", [])),
                ("primary",    ex.get("primary_muscles", [])),
            ]
            for role, categories in role_fields:
                for cat in (categories or []):
                    for muscle_id in CATEGORY_MUSCLES.get(cat, []):
                        conn.execute("""
                            INSERT INTO exercise_muscles (exercise_id, muscle_id, role)
                            VALUES (?,?,?)
                            ON CONFLICT(exercise_id, muscle_id) DO UPDATE SET
                                role=excluded.role
                        """, (ex_id, muscle_id, role))
            count += 1
    conn.commit()
    return count


def sync_teaching(conn: sqlite3.Connection) -> int:
    count = 0
    for yml in sorted(ANATOMY_TEACHING.glob("*.yml")):
        doc = yaml.safe_load(yml.read_text(encoding="utf-8"))
        if not isinstance(doc, dict):
            continue
        lessons = doc.get("lessons", [doc] if doc.get("exercise_id") else [])
        for lesson in lessons:
            ex_id = lesson.get("exercise_id")
            if not ex_id:
                continue
            lg = lesson.get("learning_goal") or {}
            conn.execute("""
                INSERT INTO anatomy_teaching
                    (exercise_id, title, learning_goal, joint_actions,
                     common_errors, feel_cues, coaching_cues, quiz_prompts, vault_tags)
                VALUES (?,?,?,?,?,?,?,?,?)
                ON CONFLICT(exercise_id) DO UPDATE SET
                    title=excluded.title, learning_goal=excluded.learning_goal,
                    joint_actions=excluded.joint_actions,
                    common_errors=excluded.common_errors,
                    feel_cues=excluded.feel_cues, coaching_cues=excluded.coaching_cues,
                    quiz_prompts=excluded.quiz_prompts, vault_tags=excluded.vault_tags,
                    updated_at=datetime('now')
            """, (
                ex_id,
                lesson.get("title"),
                _j(lg.get("short") or lg if isinstance(lg, str) else lg),
                _j(lesson.get("joint_actions")),
                _j(lesson.get("common_errors_explained")),
                _j(lesson.get("feel_cues")),
                _j(lesson.get("coaching_cues")),
                _j(lesson.get("quiz_prompts")),
                _j(lesson.get("vault_tags")),
            ))
            count += 1
    conn.commit()
    return count


def sync_scores(conn: sqlite3.Connection) -> int:
    if not SCORES_FILE.exists():
        return 0
    scores = json.loads(SCORES_FILE.read_text())
    count = 0
    for key, entry in scores.items():
        parts = key.rsplit(".", 1)
        if len(parts) != 2:
            continue
        muscle_id, field = parts
        conn.execute("""
            INSERT INTO flashcard_scores (muscle_id, field, correct, incorrect, last_seen)
            VALUES (?,?,?,?,?)
            ON CONFLICT(muscle_id, field) DO UPDATE SET
                correct=excluded.correct, incorrect=excluded.incorrect,
                last_seen=excluded.last_seen
        """, (muscle_id, field,
              entry.get("correct", 0),
              entry.get("incorrect", 0),
              entry.get("last")))
        count += 1
    conn.commit()
    return count


def sync_training(conn: sqlite3.Connection) -> int:
    if not TRAINING_DB.exists():
        return 0
    src = sqlite3.connect(str(TRAINING_DB))
    src.row_factory = sqlite3.Row
    rows = src.execute(
        "SELECT id, date, workout_id, exercise_id, sets, reps, weight, rpe, done "
        "FROM training_history WHERE done=1"
    ).fetchall()
    src.close()
    count = 0
    for r in rows:
        conn.execute("""
            INSERT INTO training_sessions (id, date, workout_id, exercise_id, sets, reps, weight, rpe, done)
            VALUES (?,?,?,?,?,?,?,?,?)
            ON CONFLICT(id) DO UPDATE SET
                sets=excluded.sets, reps=excluded.reps, weight=excluded.weight,
                rpe=excluded.rpe, done=excluded.done
        """, (r["id"], r["date"], r["workout_id"], r["exercise_id"],
              r["sets"], r["reps"], r["weight"], r["rpe"], r["done"]))
        count += 1
    conn.commit()
    return count


def sync_all() -> dict:
    conn = connect()
    return {
        "muscles":   sync_muscles(conn),
        "exercises": sync_exercises(conn),
        "teaching":  sync_teaching(conn),
        "scores":    sync_scores(conn),
        "sessions":  sync_training(conn),
    }


def query(sql: str, params: tuple = ()) -> list[dict]:
    conn = connect()
    rows = conn.execute(sql, params).fetchall()
    return [dict(r) for r in rows]
