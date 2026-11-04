/**
 * firestore/sessions.js — Session and Plan CRUD for Firestore.
 * Inbox-CRUD lebt in ./inbox.js.
 */

import {
  collection,
  doc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
} from "firebase/firestore";
import { setDoc, getDoc, getDocs, deleteDoc } from "./offline.js";

import { db } from "../../../firebase.js";
import { todayISO } from "../shared/utils.js";
import { getUid, hasAuthSession, pingBridge } from "./core.js";
import { getAllExercises } from "./kb.js";
import { updateAnalyticsDoc, scheduleWeeklyReportRefreshForDate } from "./analysis.js";
import { indexUpsert, indexRemove } from "./workoutIndex.js";
import { clearMonthlyReportCache } from "../../reportCache";
import {
  getSession as getLocalSession,
  saveSession as saveLocalSession,
  deleteSession as deleteLocalSession,
  listSessionsForDate as listLocalSessionsForDate,
  getRecentSessions as getLocalRecentSessions,
  getLatestSession as getLocalLatestSession,
  getSessionHistory as getLocalSessionHistory,
  getExerciseHistory as getLocalExerciseHistory,
  getLastExercisePerformance as getLocalLastExercisePerformance,
  buildWorkoutFromRoutine as getLocalBuildWorkoutFromRoutine,
  getPlan as getLocalPlan,
  savePlan as saveLocalPlan,
} from "../local/sessions.js";

// ── Sessions ──────────────────────────────────────────────────────────────────

// Index-Pflege für Sessions älter als 7 Tage (siehe workoutIndex.js). Darf einen
// Save/Delete nie scheitern lassen — der Index ist abgeleitet und wird bei der
// nächsten Verdichtung ohnehin repariert.
function reindex(fn) {
  Promise.resolve().then(fn).catch((err) => console.warn("[workoutIndex] Update fehlgeschlagen", err));
}

function hasTrainingSignal(ex) {
  if (!ex || typeof ex !== "object") return false;
  if (ex.done) return true;
  if (Number(ex.sets) > 0 || Number(ex.reps) > 0 || Number(ex.weight) > 0) return true;
  // Bodyweight-/AMRAP-Sätze haben oft weder Gewicht noch numerische Reps
  // (z.B. nur abgehakt) — ein bereits angelegter Satz-Eintrag zählt als
  // Trainingssignal, sonst stuft isActivityOnly() echte Workouts fälschlich
  // als reine Activity ein (siehe mergeActivityAddon).
  if (Array.isArray(ex.setsArray)) {
    return ex.setsArray.length > 0;
  }
  return false;
}

function isActivityOnly(sessionData) {
  // Explizit als eigenständige Ausdauer-Hauptsession angelegt (ModeSwitcher
  // → sessionMode: "cardio") darf NIE in eine andere Session desselben Tages
  // gemerged werden, selbst wenn exercises leer ist — sonst verschwindet die
  // bewusst geloggte Cardio-Session in der activity-Addon-Liste einer
  // bereits existierenden Kraft-Session.
  if (sessionData?.sessionMode === "cardio") return false;
  const exercises = Array.isArray(sessionData?.exercises) ? sessionData.exercises : [];
  return !!sessionData?.activity && !exercises.some(hasTrainingSignal);
}

function sameActivity(a, b) {
  return String(a?.type || "") === String(b?.type || "")
    && String(a?.duration || "") === String(b?.duration || "")
    && String(a?.notes || "") === String(b?.notes || "")
    && String(a?.swimStyle || "") === String(b?.swimStyle || "")
    && String(a?.muscleTarget || "") === String(b?.muscleTarget || "");
}

function mergeActivityAddon(base, incoming, sourceId = null) {
  const activity = incoming?.activity;
  if (!activity) return base || {};
  const merged = { ...(base || {}) };
  const entry = { ...activity };
  if (sourceId) entry._source_id = sourceId;

  const addons = Array.isArray(merged.activityAddons)
    ? merged.activityAddons.filter(Boolean).map(a => ({ ...a }))
    : [];
  if (merged.activity && !addons.some(a => sameActivity(a, merged.activity))) {
    addons.unshift({ ...merged.activity });
  }
  if (!addons.some(a => sameActivity(a, entry))) addons.push(entry);

  merged.activityAddons = addons;
  if (!merged.activity) merged.activity = addons[0];
  const exercises = Array.isArray(merged.exercises) ? merged.exercises : [];
  // Nur auf "cardio" umstufen, wenn wirklich keine Exercises existieren —
  // ein bereits gespeichertes Workout darf nie allein wegen einer
  // fehleranfälligen Trainingssignal-Heuristik aus der UI verschwinden
  // (ExerciseList wird nur bei sessionMode === "strength" gerendert).
  if (exercises.length === 0) {
    merged.sessionMode = "cardio";
    merged.exercises = exercises;
    merged.activity = addons[0];
  }
  return merged;
}

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

export async function getSession(date = todayISO(), id = null) {
  if (!hasAuthSession()) return getLocalSession(date, id);
  const targetId = id ? `${date}__${id}` : date;
  const snap = await getDoc(doc(db, "fitness", getUid(), "sessions", targetId));
  if (!snap.exists()) return { date, block: "", exercises: [], effort: null, mood: "", notes: "" };
  const data = snap.data() || {};
  return {
    date: data.date || date,
    block: "",
    effort: null,
    mood: "",
    notes: "",
    ...data,
    id: id || null,
    exercises: Array.isArray(data.exercises) ? data.exercises : [],
  };
}

export async function saveSession(date = todayISO(), sessionData, id = null) {
  if (!hasAuthSession()) return saveLocalSession(date, sessionData, id);
  if (isActivityOnly(sessionData)) {
    const canonicalRef = doc(db, "fitness", getUid(), "sessions", date);
    const canonicalSnap = await getDoc(canonicalRef);
    const base = canonicalSnap.exists()
      ? canonicalSnap.data() || {}
      : { ...sessionData, exercises: [] };
    const merged = mergeActivityAddon(base, sessionData, id);
    await setDoc(canonicalRef, {
      ...merged,
      date,
      session_id: null,
      saved_at: serverTimestamp(),
    });
    if (id) {
      await deleteDoc(doc(db, "fitness", getUid(), "sessions", `${date}__${id}`));
      reindex(() => indexRemove(`${date}__${id}`, date));
    }
    reindex(() => indexUpsert(date, { ...merged, date }));
    invalidateHistoryCache();
    pingBridge();
    updateAnalyticsDoc();
    scheduleWeeklyReportRefreshForDate(date).catch(() => {});
    clearMonthlyReportCache();
    return { ok: true, id: null, merged: true };
  }

  // Normaler (Nicht-Merge-)Save auf die kanonische Tagesdatei (id=null):
  // activityAddons, die durch einen früheren Finisher-Merge dort schon
  // liegen, dürfen nicht verschwinden, nur weil dieser Save-Call sie nicht
  // kennt (z.B. Autosave beim Editieren der Hauptsession) — setDoc()
  // überschreibt sonst das ganze Dokument (kein merge:true).
  let addonCarryOver = {};
  if (!id && !("activityAddons" in sessionData)) {
    const canonicalSnap = await getDoc(doc(db, "fitness", getUid(), "sessions", date));
    const existing = canonicalSnap.exists() ? canonicalSnap.data() || {} : {};
    if (existing.activityAddons) {
      addonCarryOver = { activityAddons: existing.activityAddons, activity: existing.activity };
    }
  }

  const targetId = id ? `${date}__${id}` : date;
  await setDoc(doc(db, "fitness", getUid(), "sessions", targetId), {
    ...addonCarryOver,
    ...sessionData,
    date,
    session_id: id || null,
    saved_at: serverTimestamp(),
  });
  reindex(() => indexUpsert(targetId, { ...addonCarryOver, ...sessionData, date }));
  invalidateHistoryCache();
  pingBridge();
  updateAnalyticsDoc(); // fire-and-forget
  scheduleWeeklyReportRefreshForDate(date).catch(() => {});
  clearMonthlyReportCache();
  return { ok: true, id };
}

// Entfernt einen einzelnen Finisher aus activityAddons, ohne die gesamte
// (Kraft-)Session zu löschen. Gegenstück zu mergeActivityAddon() oben.
export async function deleteActivityAddon(date = todayISO(), index) {
  if (!hasAuthSession()) return { ok: false, error: "local_mode_unsupported" };
  const ref = doc(db, "fitness", getUid(), "sessions", date);
  const snap = await getDoc(ref);
  if (!snap.exists()) return { ok: false, error: "not_found" };
  const data = snap.data() || {};
  const addons = Array.isArray(data.activityAddons) ? [...data.activityAddons] : [];
  if (index < 0 || index >= addons.length) return { ok: false, error: "addon_not_found" };
  addons.splice(index, 1);
  await setDoc(ref, {
    ...data,
    activityAddons: addons,
    activity: addons[0] || null,
    date,
    saved_at: serverTimestamp(),
  });
  reindex(() => indexUpsert(date, { ...data, activityAddons: addons, activity: addons[0] || null, date }));
  invalidateHistoryCache();
  pingBridge();
  updateAnalyticsDoc();
  scheduleWeeklyReportRefreshForDate(date).catch(() => {});
  clearMonthlyReportCache();
  return { ok: true, activityAddons: addons };
}

export async function deleteSession(date = todayISO(), id = null) {
  if (!hasAuthSession()) return deleteLocalSession(date, id);
  const targetId = id ? `${date}__${id}` : date;
  await deleteDoc(doc(db, "fitness", getUid(), "sessions", targetId));
  reindex(() => indexRemove(targetId, date));
  invalidateHistoryCache();
  pingBridge();
  updateAnalyticsDoc();
  scheduleWeeklyReportRefreshForDate(date).catch(() => {});
  clearMonthlyReportCache();
  return { ok: true };
}

export async function listSessionsForDate(date = todayISO()) {
  if (!hasAuthSession()) return listLocalSessionsForDate(date);
  const q = query(
    collection(db, "fitness", getUid(), "sessions"),
    where("date", "==", date)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data = d.data() || {};
    const suffix = d.id.includes("__") ? d.id.split("__")[1] : null;
    return {
      id: suffix,
      date: data.date || date,
      block: data.block || null,
      saved_at: data.saved_at?.toDate?.()?.toISOString() || data.saved_at || null,
      ...data,
      exercises: Array.isArray(data.exercises) ? data.exercises : [],
    };
  }).sort((a, b) => String(a.saved_at).localeCompare(String(b.saved_at)));
}

export async function getRecentSessions(n = 10) {
  if (!hasAuthSession()) return getLocalRecentSessions(n);
  const q = query(
    collection(db, "fitness", getUid(), "sessions"),
    orderBy("date", "desc"),
    limit(n),
  );
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => {
      const data = d.data() || {};
      const suffix = d.id.includes("__") ? d.id.split("__")[1] : null;
      return {
        id: suffix,
        ...data,
        exercises: Array.isArray(data.exercises) ? data.exercises : [],
      };
    })
    .filter(Boolean);
}

export async function getLatestSession() {
  if (!hasAuthSession()) return getLocalLatestSession();
  const sessions = await getRecentSessions(1);
  return sessions.length > 0 ? sessions[0] : null;
}

// Kurzlebiger Cache für getSessionHistory(days): Review, Recovery, Wochen-/
// Monatsbericht und Analytics-Update fragen im selben Moment dasselbe Fenster
// mehrfach ab (allein updateAnalyticsDoc 3× getSessionHistory(60)). Gleichzeitige
// Aufrufe teilen sich eine Query; Ergebnisse gelten HISTORY_TTL_MS. Jeder
// Schreibweg dieser Datei leert den Cache (invalidateHistoryCache).
const HISTORY_TTL_MS = 60 * 1000;
const historyCache = new Map(); // `${uid}:${days}` → { at, promise }

export function invalidateHistoryCache() { historyCache.clear(); }

function copyHistory(list) {
  return list.map((s) => ({ ...s, exercises: [...s.exercises] }));
}

export async function getSessionHistory(days = 90) {
  if (!hasAuthSession()) return getLocalSessionHistory(days);
  const key = `${getUid()}:${days}`;
  const hit = historyCache.get(key);
  if (hit && Date.now() - hit.at < HISTORY_TTL_MS) return copyHistory(await hit.promise);
  const promise = fetchSessionHistory(days);
  historyCache.set(key, { at: Date.now(), promise });
  try {
    return copyHistory(await promise);
  } catch (err) {
    if (historyCache.get(key)?.promise === promise) historyCache.delete(key);
    throw err;
  }
}

async function fetchSessionHistory(days) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffISO = cutoff.toISOString().slice(0, 10);

  const q = query(
    collection(db, "fitness", getUid(), "sessions"),
    where("date", ">=", cutoffISO),
    orderBy("date", "desc"),
  );
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => {
      const data = d.data() || {};
      const suffix = d.id.includes("__") ? d.id.split("__")[1] : null;
      return {
        id: suffix,
        ...data,
        exercises: Array.isArray(data.exercises) ? data.exercises : [],
      };
    })
    .filter(Boolean);
}

export async function getExerciseHistory(exerciseId, limitCount = 1) {
  if (!hasAuthSession()) return getLocalExerciseHistory(exerciseId, limitCount);
  const history = await getSessionHistory(Math.max(limitCount * 14, 90));
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
    .slice(0, limitCount);
}

export async function getLastExercisePerformance(exerciseId) {
  if (!hasAuthSession()) return getLocalLastExercisePerformance(exerciseId);
  const [entry] = await getExerciseHistory(exerciseId, 1);
  return entry || null;
}

export async function buildWorkoutFromRoutine(routine, lookup = getLastExercisePerformance) {
  if (!hasAuthSession()) return getLocalBuildWorkoutFromRoutine(routine, lookup);
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

// Stub — Fuel/Nutrition lives in a separate repo/Firestore layer.
export async function getMealsHistory(_limit) { return []; }

// ── Plan ──────────────────────────────────────────────────────────────────────

export async function getPlan() {
  if (!hasAuthSession()) return getLocalPlan();
  const snap = await getDoc(doc(db, "fitness", getUid(), "plan"));
  if (!snap.exists()) return null;
  return snap.data();
}

export async function savePlan(plan) {
  if (!hasAuthSession()) return saveLocalPlan(plan);
  await setDoc(doc(db, "fitness", getUid(), "plan"), {
    ...plan,
    updated_at: serverTimestamp(),
  });
  return { ok: true };
}

// Mirrors catalog/kb/rules/program_rules.yml — update both when rules change.
const PROGRAM_RULES = {
  default_split: "full_body",
  templates: {
    push_day: { slots: [
      { name: "main_chest_press",        choose_from: ["041","104"] },
      { name: "secondary_press",         choose_from: ["045","023"] },
      { name: "shoulder_press_or_raise", choose_from: ["022","301"] },
      { name: "chest_isolation",         choose_from: ["103","pec_deck"] },
      { name: "triceps_isolation",       choose_from: ["502","503"] },
    ]},
    pull_day: { slots: [
      { name: "vertical_pull",              choose_from: ["020","021","201"] },
      { name: "horizontal_pull",            choose_from: ["042","043","044"] },
      { name: "secondary_row_or_pulldown",  choose_from: ["201","043","044"] },
      { name: "rear_delt_or_face_pull",     choose_from: ["302","303"] },
      { name: "biceps_movement",            choose_from: ["504","505","506","507"] },
    ]},
    legs_day: { slots: [
      { name: "main_squat",         choose_from: ["061","060","062"] },
      { name: "main_hinge",         choose_from: ["081","080","082"] },
      { name: "unilateral_or_machine", choose_from: ["063","064","062"] },
      { name: "hamstring_isolation", choose_from: ["402","082"] },
      { name: "calves",             choose_from: ["701"] },
      { name: "core_optional",      choose_from: ["601","602","603","604","605","606"] },
    ]},
  },
};

const DOW_FALLBACK = {
  Mo: { block: "Push",      exercises: ["Incline Dumbbell Press","Dips","Lateral Raise","Cable Fly","Triceps Extension"] },
  Di: { block: "Pull",      exercises: ["Pull-Up","Row","Lat Pulldown","Face Pull","Biceps Curl"] },
  Mi: { block: "Legs",      exercises: ["Squat","Romanian Deadlift","Lunge","Leg Curl","Calf Raise"] },
  Do: { block: "Upper",     exercises: ["Bench Press","Row","Overhead Press","Pulldown","Curl"] },
  Fr: { block: "Lower",     exercises: ["Deadlift","Split Squat","Hip Thrust","Leg Curl","Calf Raise"] },
  Sa: { block: "Full Body", exercises: ["Squat","Press","Row","Hinge","Carry"] },
  So: { block: "Recovery",  exercises: ["Mobility","Walk","Core Breathing"] },
};

function dowSuggestionForDate(dateStr) {
  const safe = (typeof dateStr === "string" && /^\d{4}-\d{2}-\d{2}/.test(dateStr))
    ? dateStr
    : new Date().toISOString().slice(0, 10);
  const dow = ["So","Mo","Di","Mi","Do","Fr","Sa"][new Date(safe + "T12:00:00").getDay()];
  const f = DOW_FALLBACK[dow] || DOW_FALLBACK.So;
  return { day: dow, block: f.block, exercises: f.exercises };
}

export async function getPlanSuggestion(arg) {
  if (typeof arg === "string" || arg == null) {
    return dowSuggestionForDate(arg);
  }
  const { template, goal, day } = arg;
  const templateName = template?.trim() || (day ? `${day.trim()}_day` : "") || PROGRAM_RULES.default_split;
  const templateDef = PROGRAM_RULES.templates[templateName];
  if (!templateDef) return null;

  const exercises = await getAllExercises();
  const byId = Object.fromEntries(exercises.map((e) => [e.exercise_id || e.id, e]));
  const exerciseIds = new Set(Object.keys(byId));

  const selected = new Set();
  const slots = templateDef.slots.map((slot) => {
    const available = slot.choose_from.filter((id) => exerciseIds.has(id) && !selected.has(id));
    const pick = available[0] || null;
    if (pick) selected.add(pick);
    return { name: slot.name, choose_from: slot.choose_from, selected_exercise: pick };
  });

  const ROLE_WEIGHTS = { primary: 1.0, secondary: 0.5, stabilizer: 0.2 };
  const DEFAULT_SETS = 1;
  const DEFAULT_RPE = 8;

  const resolvedExercises = [...selected].map((id) => {
    const ex = byId[id];
    if (!ex) return null;
    return {
      ...ex,
      id: ex.exercise_id || ex.id,
      name: ex.display_name || ex.german || ex.name || id,
      primaryMuscles:   ex.primary_muscles   || ex.primaryMuscles   || [],
      secondaryMuscles: ex.secondary_muscles || ex.secondaryMuscles || [],
      stabilizers: ex.stabilizers || [],
    };
  }).filter(Boolean);

  const muscle_scores = {};
  const body_region_scores = {};
  for (const ex of resolvedExercises) {
    const addScore = (muscles, weight) => {
      for (const m of muscles) {
        const key = m.toLowerCase().replace(/\s+/g, "_");
        muscle_scores[key] = (muscle_scores[key] || 0) + DEFAULT_SETS * weight;
        body_region_scores[key] = (body_region_scores[key] || 0) + DEFAULT_SETS * weight;
      }
    };
    addScore(ex.primaryMuscles || [], ROLE_WEIGHTS.primary);
    addScore(ex.secondaryMuscles || [], ROLE_WEIGHTS.secondary);
    addScore(ex.stabilizers || [], ROLE_WEIGHTS.stabilizer);
  }

  const round2 = (v) => Math.round(v * 100) / 100;
  const coverage_summary = {
    sets: DEFAULT_SETS, rpe: DEFAULT_RPE,
    selected_exercises: resolvedExercises.map((ex) => ({ exercise: ex.exercise_id || ex.id, sets: DEFAULT_SETS, rpe: DEFAULT_RPE })),
    muscle_scores: Object.fromEntries(Object.entries(muscle_scores).sort().map(([k, v]) => [k, round2(v)])),
    body_region_scores: Object.fromEntries(Object.entries(body_region_scores).sort().map(([k, v]) => [k, round2(v)])),
    unmapped_muscles: [],
  };

  return { ok: true, template: templateName, goal: goal || null, slots, exercises: resolvedExercises, coverage_summary };
}

// Inbox-Funktionen (getInbox, getGlobalInbox, approveInbox, reenrichInbox,
// deleteInbox, sendToInbox, queueForEnrichment) leben jetzt in ./inbox.js.

// ── Misc ──────────────────────────────────────────────────────────────────────

export async function exportFitnessData(_payload) { return null; }
export async function getConfig() { return { ok: true, source: "firestore" }; }
