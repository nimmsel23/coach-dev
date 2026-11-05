/**
 * firestore/routines.js — Plan-Vorlagen (Routines) fuer den Firebase-Build.
 *
 * Spiegelt server.mjs' /routines-Endpunkte (JSON-Datei-Backend, nur lokal)
 * als Firestore-CRUD, damit der Plan-Tab auch im Firebase-Prod-Build
 * (isLocalMode() === false) tatsaechlich schreibt statt still zu no-oppen.
 *
 * Ablage: fitness/{uid}/routines/{routineId}  (Meta + exerciseCount)
 *         fitness/{uid}/routines/{routineId}/exercises/{exerciseId}
 */
import {
  collection,
  doc,
} from "firebase/firestore";
import { getDoc, getDocs, setDoc, updateDoc, writeBatch } from "./offline.js";

import { db } from "../../../firebase.js";
import { getUid } from "./core.js";

function normalizeRoutineExercise(exercise = {}, order = 0) {
  return {
    id: exercise.id,
    exercise_id: exercise.exercise_id ?? null,
    name: exercise.name || exercise.exercise_id || "Übung",
    primaryMuscles: Array.isArray(exercise.primaryMuscles) ? exercise.primaryMuscles : [],
    secondaryMuscles: Array.isArray(exercise.secondaryMuscles) ? exercise.secondaryMuscles : [],
    yuhonas_id: exercise.yuhonas_id || null,
    equipment: exercise.equipment || [],
    instructions: exercise.instructions || [],
    trackingType: exercise.trackingType || "weight_reps",
    templateSets: Array.isArray(exercise.templateSets) ? exercise.templateSets : [],
    target_sets: Number.isFinite(exercise.target_sets) ? exercise.target_sets : 3,
    target_reps: exercise.target_reps ?? "8-12",
    rest_seconds: Number.isFinite(Number(exercise.rest_seconds)) && exercise.rest_seconds != null ? Math.max(0, Number(exercise.rest_seconds)) : 90,
    weight_type: exercise.weight_type || "kg",
    effort: exercise.effort || "normal",
    rir: exercise.rir ?? null,
    tempo: exercise.tempo ?? null,
    drop_set: !!exercise.drop_set,
    notes: exercise.notes ?? null,
    moduleId: exercise.moduleId || null,
    protocolType: exercise.protocolType || null,
    progressionStage: exercise.progressionStage || null,
    order: Number.isFinite(exercise.order) ? exercise.order : order,
  };
}

function routinesCol(uid) { return collection(db, "fitness", uid, "routines"); }
function routineDoc(uid, id) { return doc(db, "fitness", uid, "routines", id); }
function exercisesCol(uid, routineId) { return collection(db, "fitness", uid, "routines", routineId, "exercises"); }
function exerciseDoc(uid, routineId, eid) { return doc(db, "fitness", uid, "routines", routineId, "exercises", eid); }

export async function listRoutines(uidOverride) {
  const uid = uidOverride || getUid();
  const snap = await getDocs(routinesCol(uid));
  const routines = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  return { routines };
}

export async function createRoutine(body, uidOverride) {
  const uid = uidOverride || getUid();
  const ref = doc(routinesCol(uid));
  await setDoc(ref, {
    name: body.name,
    goal: body.goal || null,
    category: body.category || null,
    created_at: new Date().toISOString(),
    exerciseCount: 0,
  });
  return { id: ref.id };
}

export async function getRoutine(routineId, uidOverride) {
  const uid = uidOverride || getUid();
  const metaSnap = await getDoc(routineDoc(uid, routineId));
  if (!metaSnap.exists()) throw new Error("Routine nicht gefunden");
  const exSnap = await getDocs(exercisesCol(uid, routineId));
  const exercises = exSnap.docs
    .map((d) => normalizeRoutineExercise({ id: d.id, ...d.data() }))
    .sort((a, b) => a.order - b.order);
  return { routine: { id: metaSnap.id, ...metaSnap.data(), exercises } };
}

export async function updateRoutine(routineId, patch, uidOverride) {
  const uid = uidOverride || getUid();
  const { exercises, ...meta } = patch;
  if (Array.isArray(exercises)) {
    const current = await getDocs(exercisesCol(uid, routineId));
    const batch = writeBatch(db);
    current.docs.forEach((d) => batch.delete(d.ref));
    exercises.forEach((ex, i) => {
      const ref = doc(exercisesCol(uid, routineId));
      batch.set(ref, normalizeRoutineExercise({ ...ex, id: ref.id, order: i }, i));
    });
    batch.update(routineDoc(uid, routineId), { ...meta, exerciseCount: exercises.length });
    await batch.commit();
  } else await updateDoc(routineDoc(uid, routineId), meta);
  return { ok: true };
}

export async function deleteRoutine(routineId, uidOverride) {
  const uid = uidOverride || getUid();
  const exSnap = await getDocs(exercisesCol(uid, routineId));
  const batch = writeBatch(db);
  exSnap.docs.forEach((d) => batch.delete(d.ref));
  batch.delete(routineDoc(uid, routineId));
  await batch.commit();
  return { ok: true };
}

export async function addRoutineExercise(routineId, body, uidOverride) {
  const uid = uidOverride || getUid();
  const exSnap = await getDocs(exercisesCol(uid, routineId));
  const order = exSnap.size;
  const ref = doc(exercisesCol(uid, routineId));
  const exercise = normalizeRoutineExercise({ ...body, id: ref.id }, order);
  const batch = writeBatch(db);
  batch.set(ref, exercise);
  batch.update(routineDoc(uid, routineId), { exerciseCount: order + 1 });
  await batch.commit();
  return { id: ref.id };
}

export async function updateRoutineExercise(routineId, eid, patch, uidOverride) {
  const uid = uidOverride || getUid();
  await updateDoc(exerciseDoc(uid, routineId, eid), patch);
  return { ok: true };
}

export async function deleteRoutineExercise(routineId, eid, uidOverride) {
  const uid = uidOverride || getUid();
  const exSnap = await getDocs(exercisesCol(uid, routineId));
  const batch = writeBatch(db);
  batch.delete(exerciseDoc(uid, routineId, eid));
  batch.update(routineDoc(uid, routineId), { exerciseCount: Math.max(0, exSnap.size - 1) });
  await batch.commit();
  return { ok: true };
}

export async function reorderRoutineExercises(routineId, order, uidOverride) {
  const uid = uidOverride || getUid();
  const batch = writeBatch(db);
  for (const { id, order: pos } of order || []) {
    batch.update(exerciseDoc(uid, routineId, id), { order: pos });
  }
  await batch.commit();
  return { ok: true };
}

export { normalizeRoutineExercise };
