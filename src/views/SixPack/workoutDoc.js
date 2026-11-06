// Gemeinsames Workout-Format für ALLE Apps, die in fitness/{uid}/sessions
// schreiben (Fitness-App, Standalone-6Pack, …). Rein funktional, kein
// Firebase-Import — darf deshalb von überall importiert werden (die Fitness-App
// importiert diese Datei direkt aus dem 6pack-Submodul).
//
// Ablage: fitness/{uid}/sessions/{date}__{source}-{runId}   (ein Doc pro Einheit)
//   - Ein Schreiber pro Doc: jede App legt ihre Einheit neu an und fasst nie
//     das Tagesdokument fremder Apps an (der Editor überschreibt es per setDoc).
//   - Deterministische ID: runId entsteht beim Start des Workouts, ein erneutes
//     Senden überschreibt dasselbe Doc → keine Duplikate.
// Index: fitness/{uid}/workoutIndex/{YYYY-MM}.entries.{docId} = toIndexEntry()
//   (nur Zusammenfassung, für Sessions älter als INDEX_AFTER_DAYS).

export const WORKOUT_SCHEMA = 2;
export const INDEX_AFTER_DAYS = 7;

const pad = (n) => String(n).padStart(2, '0');

// Lokales Kalenderdatum (YYYY-MM-DD) — Workouts über Mitternacht zählen zum Starttag.
export function localDateOf(value = new Date()) {
  const d = value instanceof Date ? value : new Date(value);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function newRunId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

// Letzter Tag, dessen Sessions in den Index wandern (heute − 7). Neuere Tage
// werden live aus sessions gelesen, weil sie sich noch ändern können.
export function indexCutoffDate(now = new Date()) {
  const d = new Date(now);
  d.setDate(d.getDate() - INDEX_AFTER_DAYS);
  return localDateOf(d);
}

export function monthOf(date) {
  return String(date).slice(0, 7);
}

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// input.exercises: [{ name, seconds }]  (6Pack/Calisthenics: nur Dauer, kein Reps×Sets/Gewicht)
//               oder [{ name, sets: [{ reps?, seconds? }] }] (Kraft)
export function buildWorkoutDoc({
  source, app = source, userId = null,
  modality = 'strength', block, program = null,
  exercises = [], startedAt, endedAt, effort = null, notes = '',
  activity = null, // Activity im Fitness-Format, z. B. { type: 'hiit', muscleTarget: 'core', duration: 5 } (6Pack: die Session selbst)
  runId = newRunId(),
}) {
  const start = new Date(startedAt || Date.now());
  const end = new Date(endedAt || Date.now());
  const rpe = Number(effort);
  const date = localDateOf(start);
  const id = `${source}-${runId}`;

  return {
    id,
    date,
    docId: `${date}__${id}`,
    data: {
      schema: WORKOUT_SCHEMA,
      userId,
      date,
      session_id: id,
      source: { app },
      modality,
      sessionMode: modality === 'cardio' ? 'cardio' : 'strength',
      block,
      ...(program ? { program } : {}),
      ...(activity ? { activity } : {}),
      exercises: exercises.map((ex) => ({
        id: `${source}-${slug(ex.name)}`,
        name: ex.name,
        source,
        ...(ex.sets ? {} : { duration: Number(ex.seconds) || 0 }),
        setsArray: (ex.sets || []).map((s) => ({
          reps: s.reps != null ? String(s.reps) : '',
          weight: '',
          ...(s.seconds != null ? { duration: s.seconds } : {}),
        })),
      })),
      effort: Number.isFinite(rpe) && rpe >= 1 && rpe <= 10 ? rpe : null,
      mood: '',
      notes,
      sessionGate: {
        status: 'completed',
        startedAt: start.toISOString(),
        endedAt: end.toISOString(),
        gps: null,
      },
    },
  };
}

// Gleiche Logik wie lib/sessionGate.js::sessionHasLoggedWorkout (hier dupliziert,
// weil diese Datei keine App-Imports haben darf).
function hasLoggedWorkout(s) {
  if (Array.isArray(s.exercises) && s.exercises.length > 0) return true;
  if (String(s.block || '').trim()) return true;
  if (s.activity) return true;
  return !!s.sessionGate?.endedAt;
}

// Kompakte Verlaufs-Zeile für den Index. null = kein geloggtes Workout.
// Funktioniert auch für Altdaten (ohne schema/modality/source).
export function toIndexEntry(docId, s) {
  if (!s || typeof s !== 'object' || !hasLoggedWorkout(s)) return null;
  const exercises = Array.isArray(s.exercises) ? s.exercises : [];
  const gate = s.sessionGate || {};
  const startMs = Date.parse(gate.startedAt);
  const endMs = Date.parse(gate.endedAt);
  const gateMin = Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs
    ? Math.max(1, Math.round((endMs - startMs) / 60000))
    : null;
  const actMin = Number(s.activity?.duration);
  const setCount = exercises.reduce((n, ex) => n + (Array.isArray(ex.setsArray) ? ex.setsArray.length : (Number(ex.sets) || 0)), 0);
  const date = s.date || String(docId).split('__')[0];
  const src = typeof s.source === 'string' ? s.source : (s.source?.app || 'fitness');

  return {
    id: docId,
    date,
    block: s.block || null,
    sessionMode: s.sessionMode || null,
    modality: s.modality || (s.sessionMode === 'cardio' ? 'cardio' : 'strength'),
    source: src,
    startedAt: gate.startedAt || null,
    durationMin: gateMin ?? (Number.isFinite(actMin) && actMin > 0 ? actMin : null),
    effort: Number.isFinite(Number(s.effort)) && s.effort !== null && s.effort !== '' ? Number(s.effort) : null,
    exerciseCount: exercises.length,
    setCount,
    topExercises: exercises.map((ex) => ex.name).filter(Boolean).slice(0, 3),
    activity: s.activity ? { type: s.activity.type || null, duration: s.activity.duration ?? null } : null,
  };
}
