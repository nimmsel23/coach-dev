import {
  collection, deleteDoc, doc, getDoc, getDocs, orderBy, query, runTransaction, setDoc, writeBatch,
} from 'firebase/firestore';
import { db } from '../../../firebase.js';

const planRef = (uid, id) => doc(db, 'fitness', uid, 'macrocycles', id);
const clone = (value) => JSON.parse(JSON.stringify(value));
const normalizeDays = (days) => Array.isArray(days)
  ? [...new Set(days.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))].sort((a, b) => a - b)
  : [];

function normalizeRoutine(routine = {}) {
  return {
    id: routine.id || `rt_${crypto.randomUUID()}`,
    label: String(routine.label || '').trim(),
    isDeload: !!routine.isDeload,
    restHoursAfter: Number(routine.restHoursAfter) || 0,
    targetCount: Math.max(0, Number(routine.targetCount) || 0),
    targetPeriodDays: Math.max(0, Number(routine.targetPeriodDays) || 0),
    sourceTemplateId: routine.sourceTemplateId || null,
    weekdays: normalizeDays(routine.weekdays),
    exercises: Array.isArray(routine.exercises) ? clone(routine.exercises) : [],
  };
}

function snapshotOf(plan) {
  return {
    name: plan.name || '',
    description: plan.description || '',
    totalWeeks: Number(plan.totalWeeks) || 10,
    routines: (plan.routines || []).map((routine) => ({
      ...routine,
      targetCount: Number(routine.targetCount) || 0,
      targetPeriodDays: Number(routine.targetPeriodDays) || 0,
      weekdays: normalizeDays(routine.weekdays),
      exercises: Array.isArray(routine.exercises) ? routine.exercises : [],
    })),
  };
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  return JSON.stringify(value ?? null);
}

export async function listMacrocycles(uid) {
  const snap = await getDocs(query(collection(db, 'fitness', uid, 'macrocycles'), orderBy('createdAt', 'desc')));
  return snap.docs.map((item) => {
    const data = item.data();
    return {
      id: item.id,
      ...data,
      routineCount: data.published?.routines?.length ?? data.routines?.length ?? 0,
      workingRoutineCount: data.routines?.length ?? 0,
    };
  });
}

async function loadCompletions(uid, id) {
  const snap = await getDocs(query(collection(db, 'fitness', uid, 'macrocycles', id, 'completions'), orderBy('completedAt', 'asc')));
  return snap.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export async function getMacrocycle(uid, id) {
  const snap = await getDoc(planRef(uid, id));
  if (!snap.exists()) return null;
  const macrocycle = { id: snap.id, ...snap.data() };
  const completions = await loadCompletions(uid, id);
  const routines = macrocycle.published?.routines || macrocycle.routines || [];
  const elapsedWeeks = Math.floor((Date.now() - new Date(macrocycle.createdAt).getTime()) / (7 * 86400000));
  const totalWeeks = Number(macrocycle.totalWeeks) || 10;
  const last = completions.at(-1);
  const lastRoutine = routines.find((routine) => routine.id === last?.routineId);
  const restUntil = lastRoutine?.restHoursAfter
    ? new Date(new Date(last.completedAt).getTime() + lastRoutine.restHoursAfter * 3600000)
    : null;
  return {
    ok: true,
    macrocycle,
    completions,
    nextRoutineIndex: routines.length ? completions.length % routines.length : 0,
    restingUntil: restUntil && restUntil > new Date() ? restUntil.toISOString() : null,
    currentWeek: Math.min(elapsedWeeks + 1, totalWeeks),
    totalWeeks,
    finished: elapsedWeeks >= totalWeeks,
  };
}

export async function createMacrocycle(uid, { name, coachUid, totalWeeks, status = 'draft', description = '', routines = [] }) {
  const ref = doc(collection(db, 'fitness', uid, 'macrocycles'));
  const now = new Date().toISOString();
  const record = {
    name: String(name || '').trim(),
    description: String(description || '').trim(),
    clientUid: uid,
    coachUid: coachUid || null,
    status,
    createdAt: now,
    updatedAt: now,
    totalWeeks: Math.max(1, Number(totalWeeks) || 10),
    routines: (routines || []).map(normalizeRoutine),
  };
  if (!record.name) throw new Error('Trainingsplan braucht einen Namen.');
  await setDoc(ref, record);
  return { id: ref.id, ...record };
}

export async function updateMacrocycle(uid, id, patch) {
  const ref = planRef(uid, id);
  return runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists()) throw new Error('Trainingsplan wurde nicht gefunden.');
    const current = { id: snap.id, ...snap.data() };
    const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
    if (patch.name !== undefined) next.name = String(patch.name).trim();
    if (patch.description !== undefined) next.description = String(patch.description).trim().slice(0, 2000);
    if (patch.routines) next.routines = patch.routines.map(normalizeRoutine);
    if (patch.status === 'published') {
      if (!next.routines.length || next.routines.some((routine) => !routine.exercises.length)) {
        throw new Error('Jede Einheit braucht Übungen, bevor du den Plan bereitstellst.');
      }
      const snapshot = snapshotOf(next);
      if (next.status === 'published' && stable(snapshot) === stable(next.published)) {
        throw new Error('Keine Änderungen seit der letzten Veröffentlichung.');
      }
      const number = (Number(current.headVersion) || 0) + 1;
      const publishedAt = new Date().toISOString();
      const message = String(patch.message || (number === 1 ? 'Erste Version' : 'Aktualisiert')).trim().slice(0, 200);
      const record = {
        id: `v${number}`,
        number,
        message,
        createdAt: publishedAt,
        author: patch.author || current.coachUid || null,
        parent: number > 1 ? `v${number - 1}` : null,
        snapshot,
      };
      transaction.set(doc(db, 'fitness', uid, 'macrocycles', id, 'versions', record.id), record);
      Object.assign(next, { status: 'published', publishedAt, published: snapshot, headVersion: number, headMessage: message });
    }
    transaction.set(ref, next);
    return next;
  });
}

export async function publishMacrocycle(uid, id, options = {}) {
  return updateMacrocycle(uid, id, { ...options, status: 'published' });
}

export async function addRoutine(uid, id, routine) {
  return runTransaction(db, async (transaction) => {
    const ref = planRef(uid, id);
    const snap = await transaction.get(ref);
    if (!snap.exists()) throw new Error('Trainingsplan wurde nicht gefunden.');
    const current = snap.data();
    const added = normalizeRoutine(routine);
    const updated = { ...current, routines: [...(current.routines || []), added], updatedAt: new Date().toISOString() };
    transaction.update(ref, { routines: updated.routines, updatedAt: updated.updatedAt });
    return { ...updated, id: snap.id };
  });
}

export async function updateRoutine(uid, id, routineId, patch) {
  return runTransaction(db, async (transaction) => {
    const ref = planRef(uid, id);
    const snap = await transaction.get(ref);
    if (!snap.exists()) throw new Error('Trainingsplan wurde nicht gefunden.');
    const current = snap.data();
    const routines = (current.routines || []).map((routine) => routine.id === routineId
      ? normalizeRoutine({ ...routine, ...patch })
      : routine);
    const updatedAt = new Date().toISOString();
    transaction.update(ref, { routines, updatedAt });
    return { ...current, id: snap.id, routines, updatedAt };
  });
}

export async function deleteRoutine(uid, id, routineId) {
  return runTransaction(db, async (transaction) => {
    const ref = planRef(uid, id);
    const snap = await transaction.get(ref);
    if (!snap.exists()) throw new Error('Trainingsplan wurde nicht gefunden.');
    const current = snap.data();
    const routines = (current.routines || []).filter((routine) => routine.id !== routineId);
    const updatedAt = new Date().toISOString();
    transaction.update(ref, { routines, updatedAt });
    return { ...current, id: snap.id, routines, updatedAt };
  });
}

export async function completeRoutine(uid, id, routineId, exercises = []) {
  const ref = doc(collection(db, 'fitness', uid, 'macrocycles', id, 'completions'));
  const record = { routineId, completedAt: new Date().toISOString(), exercises };
  await setDoc(ref, record);
  return { id: ref.id, ...record };
}

export async function getLastPerformance(uid, id, routineId) {
  const completions = await loadCompletions(uid, id);
  return completions.filter((item) => item.routineId === routineId).at(-1) || null;
}

export async function listPlanVersions(uid, id) {
  const snap = await getDocs(collection(db, 'fitness', uid, 'macrocycles', id, 'versions'));
  return snap.docs.map((item) => item.data()).sort((a, b) => a.number - b.number);
}

export async function restorePlanVersion(uid, id, versionId) {
  const snap = await getDoc(doc(db, 'fitness', uid, 'macrocycles', id, 'versions', String(versionId)));
  if (!snap.exists()) throw new Error('Planversion wurde nicht gefunden.');
  const snapshot = snap.data().snapshot;
  return updateMacrocycle(uid, id, {
    name: snapshot.name,
    description: snapshot.description,
    totalWeeks: snapshot.totalWeeks,
    routines: snapshot.routines,
    status: 'draft',
  });
}

export async function markPlanRead(uid, id, version) {
  const n = Number(version);
  if (!Number.isInteger(n) || n < 1) return false;
  const ref = doc(db, 'fitness', uid, 'macrocycles', id, 'receipts', `v${n}`);
  await setDoc(ref, { planId: id, version: n, readAt: new Date().toISOString() }, { merge: true });
  return true;
}

export async function listPlanReceipts(uid, id) {
  const snap = await getDocs(collection(db, 'fitness', uid, 'macrocycles', id, 'receipts'));
  return snap.docs.map((item) => item.data()).sort((a, b) => a.version - b.version);
}

export async function deleteMacrocycle(uid, id) {
  for (const name of ['versions', 'completions', 'receipts']) {
    const snap = await getDocs(collection(db, 'fitness', uid, 'macrocycles', id, name));
    for (let start = 0; start < snap.docs.length; start += 400) {
      const batch = writeBatch(db);
      snap.docs.slice(start, start + 400).forEach((item) => batch.delete(item.ref));
      await batch.commit();
    }
  }
  await deleteDoc(planRef(uid, id));
  return true;
}
