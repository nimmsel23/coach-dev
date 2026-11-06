/**
 * firestore/workouts.js — geloggte Workout-Instanzen (Strong-Modell) fuer
 * den Firebase-Build. Spiegelt server.mjs' /workouts-Endpunkte.
 *
 * Ablage: fitness/{uid}/workouts/{workoutId}  (Meta + exerciseCount)
 *         fitness/{uid}/workouts/{workoutId}/exercises/{exerciseId}  (sets als Array-Feld)
 *
 * Bewusst NICHT portiert: findLatestExercisePerformance() (Ghost-Reps/-Weight
 * aus der Trainingshistorie) — beim Anlegen aus einer Routine werden Ghost-
 * Werte auf die Template-Zielwerte statt auf echte Vergangenheitsdaten
 * gesetzt. Kleinerer, aber ehrlicher Funktionsumfang statt stiller Lücke.
 */
import {
  collection,
  doc,
} from "firebase/firestore";
import { getDoc, getDocs, updateDoc, writeBatch } from "./offline.js";

import { db } from "../../../firebase.js";
import { getUid } from "./core.js";
import { getRoutine } from "./routines.js";

function normalizeSetEntry(set = {}, index = 0) {
  return {
    id: set.id,
    order: Number.isFinite(set.order) ? set.order : index,
    setIndex: set.setIndex ?? index + 1,
    setType: set.setType || "normal",
    targetReps: set.targetReps ?? null,
    targetWeight: set.targetWeight ?? null,
    targetDistance: set.targetDistance ?? null,
    targetDuration: set.targetDuration ?? null,
    progressionStage: set.progressionStage ?? null,
    ghostReps: set.ghostReps ?? null,
    ghostWeight: set.ghostWeight ?? null,
    ghostDistance: set.ghostDistance ?? null,
    ghostDuration: set.ghostDuration ?? null,
    reps: set.reps ?? null,
    weight: set.weight ?? null,
    distance: set.distance ?? null,
    duration: set.duration ?? null,
    completed: !!set.completed,
  };
}

function normalizeTrackingType(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (["bodyweight_reps", "bodyweight", "bodyweight&reps"].includes(raw)) return "bodyweight_reps";
  if (["distance_time", "distance", "distance&time", "cardio"].includes(raw)) return "distance_time";
  if (["duration", "time", "timer"].includes(raw)) return "duration";
  return "weight_reps";
}

function newId() {
  return (crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`);
}

function normalizeWorkoutExercise(exercise = {}, order = 0) {
  return {
    id: exercise.id,
    exercise_id: exercise.exercise_id ?? null,
    name: exercise.name || exercise.exercise_id || "Übung",
    trackingType: normalizeTrackingType(exercise.trackingType || exercise.weight_type),
    primaryMuscles: Array.isArray(exercise.primaryMuscles) ? exercise.primaryMuscles : [],
    secondaryMuscles: Array.isArray(exercise.secondaryMuscles) ? exercise.secondaryMuscles : [],
    yuhonas_id: exercise.yuhonas_id || null,
    rest_seconds: Number(exercise.rest_seconds) || 90,
    notes: exercise.notes ?? null,
    order: Number.isFinite(exercise.order) ? exercise.order : order,
    sets: Array.isArray(exercise.sets) ? exercise.sets.map((s, i) => normalizeSetEntry(s, i)) : [],
  };
}

function defaultTemplateSets(routineExercise = {}) {
  if (Array.isArray(routineExercise.templateSets) && routineExercise.templateSets.length > 0) {
    return routineExercise.templateSets;
  }
  const count = Math.max(1, Number(routineExercise.target_sets) || 3);
  return Array.from({ length: count }, (_, i) => ({
    setIndex: i + 1,
    setType: routineExercise.drop_set ? "drop" : "normal",
    targetReps: routineExercise.target_reps ?? "8-12",
    targetWeight: null,
  }));
}

function buildWorkoutExerciseFromRoutine(routineExercise = {}) {
  const templateSets = defaultTemplateSets(routineExercise);
  return normalizeWorkoutExercise({
    id: newId(),
    exercise_id: routineExercise.exercise_id,
    name: routineExercise.name,
    primaryMuscles: routineExercise.primaryMuscles,
    secondaryMuscles: routineExercise.secondaryMuscles,
    yuhonas_id: routineExercise.yuhonas_id,
    trackingType: routineExercise.trackingType,
    rest_seconds: routineExercise.rest_seconds,
    order: routineExercise.order,
    sets: templateSets.map((templateSet, index) => normalizeSetEntry({
      id: newId(),
      setType: templateSet.setType,
      targetReps: templateSet.targetReps,
      targetWeight: templateSet.targetWeight,
      targetDistance: templateSet.targetDistance,
      targetDuration: templateSet.targetDuration,
      ghostReps: templateSet.targetReps ?? null,
      ghostWeight: templateSet.targetWeight ?? null,
    }, index)),
  }, routineExercise.order);
}

function workoutsCol(uid) { return collection(db, "fitness", uid, "workouts"); }
function workoutDoc(uid, id) { return doc(db, "fitness", uid, "workouts", id); }
function exercisesCol(uid, workoutId) { return collection(db, "fitness", uid, "workouts", workoutId, "exercises"); }
function exerciseDoc(uid, workoutId, eid) { return doc(db, "fitness", uid, "workouts", workoutId, "exercises", eid); }

export async function listWorkouts() {
  const uid = getUid();
  const snap = await getDocs(workoutsCol(uid));
  const workouts = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => new Date(b.started_at || 0) - new Date(a.started_at || 0));
  return { workouts };
}

// uidOverride: Coach erstellt ein Workout im Namen eines Klienten (Quick-
// Complete bei gemeinsamer Session) — siehe views/Coach/ClientTrainingPlans.jsx.
// Ohne Override identisch zum Self-Service-Fall.
export async function createWorkout(body, uidOverride) {
  const uid = uidOverride || getUid();
  let exercises = [];
  let name = body.name;
  if (body.routine_id) {
    const { routine } = await getRoutine(body.routine_id, uidOverride);
    name = name || routine.name;
    exercises = routine.exercises
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((ex) => buildWorkoutExerciseFromRoutine(ex));
  }

  const ref = doc(workoutsCol(uid));
  const workout = {
    routine_id: body.routine_id || null,
    sourceRoutineId: body.routine_id || null,
    sourcePlanId: body.sourcePlanId || null,
    sourcePlanRoutineId: body.sourcePlanRoutineId || null,
    sourcePlanVersion: body.sourcePlanVersion || null,
    sourceAssignmentId: body.sourceAssignmentId || null,
    name: name || `Workout ${new Date().toLocaleDateString("de-AT", { day: "2-digit", month: "2-digit" })}`,
    started_at: new Date().toISOString(),
    finished_at: null,
    sessionState: "work",
    protocolMeta: { moduleId: body.moduleId || null, protocolType: body.protocolType || null, requiresReview: true },
    eventLog: [],
    exerciseCount: exercises.length,
  };

  const batch = writeBatch(db);
  batch.set(ref, workout);
  for (const ex of exercises) {
    batch.set(exerciseDoc(uid, ref.id, ex.id), ex);
  }
  await batch.commit();
  return { id: ref.id };
}

export async function getWorkout(workoutId, uidOverride) {
  const uid = uidOverride || getUid();
  const metaSnap = await getDoc(workoutDoc(uid, workoutId));
  if (!metaSnap.exists()) throw new Error("Workout nicht gefunden");
  const exSnap = await getDocs(exercisesCol(uid, workoutId));
  const exercises = exSnap.docs
    .map((d) => normalizeWorkoutExercise({ id: d.id, ...d.data() }))
    .sort((a, b) => a.order - b.order)
    .map((ex) => ({ ...ex, sets: ex.sets.slice().sort((a, b) => a.order - b.order) }));
  return { workout: { id: metaSnap.id, ...metaSnap.data(), exercises } };
}

export async function updateWorkout(workoutId, patch, uidOverride) {
  const uid = uidOverride || getUid();
  const { exercises, ...meta } = patch || {};
  if (Object.keys(meta).length > 0) {
    await updateDoc(workoutDoc(uid, workoutId), meta);
  }
  if (Array.isArray(exercises)) {
    const exSnap = await getDocs(exercisesCol(uid, workoutId));
    const batch = writeBatch(db);
    exSnap.docs.forEach((d) => batch.delete(d.ref));
    exercises.forEach((ex, index) => {
      const normalized = normalizeWorkoutExercise({ ...ex, id: ex.id || newId() }, index);
      batch.set(exerciseDoc(uid, workoutId, normalized.id), normalized);
    });
    batch.update(workoutDoc(uid, workoutId), { exerciseCount: exercises.length });
    await batch.commit();
  }
  return { ok: true };
}

export async function deleteWorkout(workoutId) {
  const uid = getUid();
  const exSnap = await getDocs(exercisesCol(uid, workoutId));
  const batch = writeBatch(db);
  exSnap.docs.forEach((d) => batch.delete(d.ref));
  batch.delete(workoutDoc(uid, workoutId));
  await batch.commit();
  return { ok: true };
}

export async function addWorkoutExercise(workoutId, body) {
  const uid = getUid();
  const exSnap = await getDocs(exercisesCol(uid, workoutId));
  const order = exSnap.size;
  const ref = doc(exercisesCol(uid, workoutId));
  const exercise = normalizeWorkoutExercise({
    id: ref.id,
    exercise_id: body.exercise_id,
    name: body.name,
    primaryMuscles: body.primaryMuscles,
    secondaryMuscles: body.secondaryMuscles,
    yuhonas_id: body.yuhonas_id,
    trackingType: body.trackingType,
    sets: Array.from({ length: 3 }, (_, i) => normalizeSetEntry({ id: newId() }, i)),
  }, order);
  const batch = writeBatch(db);
  batch.set(ref, exercise);
  batch.update(workoutDoc(uid, workoutId), { exerciseCount: order + 1 });
  await batch.commit();
  return { id: ref.id };
}

export async function deleteWorkoutExercise(workoutId, eid) {
  const uid = getUid();
  const exSnap = await getDocs(exercisesCol(uid, workoutId));
  const batch = writeBatch(db);
  batch.delete(exerciseDoc(uid, workoutId, eid));
  batch.update(workoutDoc(uid, workoutId), { exerciseCount: Math.max(0, exSnap.size - 1) });
  await batch.commit();
  return { ok: true };
}

export async function reorderWorkoutExercises(workoutId, order) {
  const uid = getUid();
  const batch = writeBatch(db);
  for (const { id, order: pos } of order || []) {
    batch.update(exerciseDoc(uid, workoutId, id), { order: pos });
  }
  await batch.commit();
  return { ok: true };
}

export async function addSet(workoutId, eid) {
  const uid = getUid();
  const ref = exerciseDoc(uid, workoutId, eid);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Übung nicht gefunden");
  const sets = Array.isArray(snap.data().sets) ? snap.data().sets : [];
  const last = sets[sets.length - 1] || {};
  const set = normalizeSetEntry({
    id: newId(),
    setType: last.setType || "normal",
    targetReps: last.targetReps ?? null,
    targetWeight: last.targetWeight ?? null,
    targetDistance: last.targetDistance ?? null,
    targetDuration: last.targetDuration ?? null,
  }, sets.length);
  await updateDoc(ref, { sets: [...sets, set] });
  return { id: set.id };
}

export async function updateSet(workoutId, eid, sid, patch) {
  const uid = getUid();
  const ref = exerciseDoc(uid, workoutId, eid);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Übung nicht gefunden");
  const sets = (snap.data().sets || []).map((s) => (s.id === sid ? { ...s, ...patch } : s));
  await updateDoc(ref, { sets });
  return { ok: true };
}

export async function deleteSet(workoutId, eid, sid) {
  const uid = getUid();
  const ref = exerciseDoc(uid, workoutId, eid);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Übung nicht gefunden");
  const sets = (snap.data().sets || []).filter((s) => s.id !== sid);
  await updateDoc(ref, { sets });
  return { ok: true };
}
