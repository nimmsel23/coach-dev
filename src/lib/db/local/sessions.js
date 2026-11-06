import { api, localToday } from "./core";
import { calculateProgressTrend } from "../shared/progressTrend.js";
import { clearMonthlyReportCache } from "../../reportCache";

function exerciseSets(exercise) {
  if (Array.isArray(exercise?.setsArray) && exercise.setsArray.length > 0) return exercise.setsArray;
  if (Array.isArray(exercise?.sets) && exercise.sets.length > 0) return exercise.sets;
  return [];
}

function normalizeGhostSet(set = {}, index = 0) {
  return {
    setIndex: set.setIndex ?? index + 1,
    setType: set.setType || "normal",
    reps: set.reps ?? null,
    weight: set.weight ?? null,
    distance: set.distance ?? null,
    duration: set.duration ?? null,
  };
}

export async function getSession(date = localToday(), id = null) {
  try {
    const qs = id ? `?date=${date}&id=${encodeURIComponent(id)}` : `?date=${date}`;
    const data = await api.get(`/session${qs}`);
    return data?.data || null;
  } catch {
    return null;
  }
}

export async function saveSession(date = localToday(), sessionData, id = null) {
  const qs = id ? `?date=${date}&id=${encodeURIComponent(id)}` : `?date=${date}`;
  const res = await api.post(`/session${qs}`, sessionData || {});
  clearMonthlyReportCache();
  // sqliteSync durchreichen (server.mjs signalisiert damit einen verzögerten,
  // nicht-fatalen SQLite-Sync — der JSON-Save selbst war erfolgreich).
  return {
    ok: true,
    queued: res?.queued === true,
    offline: res?.offline === true,
    sqliteSync: res?.sqliteSync !== false,
  };
}

export async function listSessionsForDate(date = localToday()) {
  try {
    const data = await api.get(`/sessions?date=${date}`);
    return data?.sessions || [];
  } catch {
    return [];
  }
}

export async function deleteSession(date = localToday(), id = null) {
  const qs = id ? `?date=${date}&id=${encodeURIComponent(id)}` : `?date=${date}`;
  await api.delete(`/session${qs}`);
  clearMonthlyReportCache();
  return { ok: true };
}

// Entfernt einen einzelnen Finisher aus activityAddons, ohne die gesamte
// (Kraft-)Session zu löschen. Node proxied das an fitness-api (Python) —
// dort lebt die Merge/Addon-Logik, siehe firestore/sessions.js für den
// Firestore-Pfad mit derselben Signatur.
export async function deleteActivityAddon(date = localToday(), index) {
  try {
    const data = await api.delete(`/session/activity?date=${date}&index=${index}`);
    return { ok: true, activityAddons: data?.activityAddons || [] };
  } catch {
    return { ok: false, error: "delete_failed" };
  }
}

export async function getRecentSessions(n = 10) {
  try {
    const data = await api.get(`/session/history?limit=${n}`);
    return data?.sessions || [];
  } catch {
    return [];
  }
}

export async function getLatestSession() {
  const sessions = await getRecentSessions(1);
  return sessions.length > 0 ? sessions[0] : null;
}

export async function getSessionHistory(n = 60) {
  return getRecentSessions(n);
}

export async function getExerciseHistory(exerciseId, limit = 1) {
  const history = await getSessionHistory(Math.max(limit * 12, 30));
  return (Array.isArray(history) ? history : [])
    .filter(Boolean)
    .map((session) => ({
      ...session,
      exercises: Array.isArray(session.exercises) ? session.exercises : [],
    }))
    .flatMap((session) =>
      session.exercises
        .filter((exercise) => String(exercise.exercise_id || exercise.id || "") === String(exerciseId || ""))
        .map((exercise) => ({
          date: session.date || null,
          exercise,
          setsArray: exerciseSets(exercise).map(normalizeGhostSet),
        }))
    )
    .slice(0, limit);
}

export async function getLastExercisePerformance(exerciseId) {
  const [entry] = await getExerciseHistory(exerciseId, 1);
  return entry || null;
}

export async function buildWorkoutFromRoutine(routine, lookup = getLastExercisePerformance) {
  const exercises = [];
  for (const templateEx of routine?.exercises || []) {
    const lastPerformance = await lookup(templateEx.exercise_id);
    const lastSets = Array.isArray(lastPerformance?.setsArray) ? lastPerformance.setsArray : [];
    const templateSets = Array.isArray(templateEx.templateSets) && templateEx.templateSets.length > 0
      ? templateEx.templateSets
      : Array.from({ length: Math.max(1, Number(templateEx.target_sets) || 3) }, (_, index) => ({
          setIndex: index + 1,
          setType: templateEx.drop_set ? "drop" : "normal",
          targetReps: templateEx.target_reps ?? "8-12",
          targetWeight: templateEx.target_weight ?? null,
          targetDistance: templateEx.targetDistance ?? null,
          targetDuration: templateEx.targetDuration ?? null,
        }));

    exercises.push({
      exercise_id: templateEx.exercise_id,
      name: templateEx.name,
      trackingType: templateEx.trackingType || "weight_reps",
      rest_seconds: templateEx.rest_seconds ?? 90,
      order: templateEx.order ?? exercises.length,
      sets: templateSets.map((templateSet, index) => {
        const ghostSet = lastSets.find((set) => set.setIndex === (templateSet.setIndex ?? index + 1)) || lastSets[index] || {};
        return {
          setIndex: templateSet.setIndex ?? index + 1,
          setType: templateSet.setType || "normal",
          targetReps: templateSet.targetReps ?? null,
          targetWeight: templateSet.targetWeight ?? null,
          targetDistance: templateSet.targetDistance ?? null,
          targetDuration: templateSet.targetDuration ?? null,
          progressionStage: templateSet.progressionStage ?? templateEx.progressionStage ?? null,
          ghostReps: ghostSet.reps ?? templateSet.targetReps ?? null,
          ghostWeight: ghostSet.weight ?? templateSet.targetWeight ?? null,
          ghostDistance: ghostSet.distance ?? templateSet.targetDistance ?? null,
          ghostDuration: ghostSet.duration ?? templateSet.targetDuration ?? null,
          reps: null,
          weight: null,
          distance: null,
          duration: null,
          completed: false,
        };
      }),
    });
  }

  return {
    id: `wrk_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
    sourceRoutineId: routine?.id || null,
    routine_id: routine?.id || null,
    name: routine?.name || "Workout",
    started_at: new Date().toISOString(),
    finished_at: null,
    exercises,
  };
}

export async function getProgressTrend(exercise, lastN = 4) {
  const history = await getSessionHistory(lastN * 7);
  return calculateProgressTrend(history, exercise, lastN);
}

export async function getPlan() {
  return JSON.parse(localStorage.getItem("fitness-local-plan") || "null");
}

export async function savePlan(plan) {
  localStorage.setItem("fitness-local-plan", JSON.stringify(plan));
  return { ok: true };
}

export async function getPlanSuggestion(params) {
  try {
    if (typeof params === 'string' || !params) {
      const data = await api.get(`/plan/today?date=${params || localToday()}`);
      return data?.suggestion || null;
    }
    const qs = new URLSearchParams(params).toString();
    return await api.get(`/fitness/plan?${qs}`);
  } catch {
    return null;
  }
}

export { parseQuick } from "../shared/parse.js";
