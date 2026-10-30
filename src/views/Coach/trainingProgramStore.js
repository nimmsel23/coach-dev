import { collection, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { createPlanApi } from '@plan/views/Plan/api.js';
import {
  createMacrocycle,
  deleteMacrocycle,
  listMacrocycles,
  publishMacrocycle,
} from '@db';

const programs = (uid) => collection(db, 'fitness', uid, 'coachTrainingPrograms');
const programRef = (uid, id) => doc(db, 'fitness', uid, 'coachTrainingPrograms', id);
const versions = (uid, id) => collection(db, 'fitness', uid, 'coachTrainingPrograms', id, 'versions');

export async function listCoachPrograms(uid) {
  const snap = await getDocs(programs(uid));
  return snap.docs.map((item) => ({ id: item.id, ...item.data() }))
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
}

export async function saveCoachProgram(uid, value) {
  const ref = value.id ? programRef(uid, value.id) : doc(programs(uid));
  const now = new Date().toISOString();
  const record = {
    name: String(value.name || '').trim(),
    goal: String(value.goal || '').trim(),
    description: String(value.description || '').trim(),
    durationWeeks: Math.max(1, Number(value.durationWeeks) || 1),
    workouts: Array.isArray(value.workouts) ? value.workouts : [],
    updatedAt: now,
  };
  if (!record.name) throw new Error('Gib dem Trainingsprogramm einen Namen.');
  if (value.id) await updateDoc(ref, record);
  else await setDoc(ref, { ...record, createdAt: now, headVersion: 0 });
  return { id: ref.id, ...record };
}

export async function publishCoachProgram(uid, program) {
  const ref = programRef(uid, program.id);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Trainingsprogramm wurde nicht gefunden.');
  const current = snap.data();
  if (!current.name || !current.workouts?.length) throw new Error('Füge zuerst mindestens eine Einheit hinzu.');
  const api = createPlanApi(uid);
  const workouts = await Promise.all(current.workouts.map(async (item) => {
    const result = await api.get(`/routines/${encodeURIComponent(item.templateId)}`);
    if (!result.routine?.exercises?.length) throw new Error(`Die Einheit „${item.label}“ enthält keine Übungen.`);
    return { ...item, exercises: result.routine.exercises };
  }));
  const number = (Number(current.headVersion) || 0) + 1;
  const version = {
    id: `v${number}`,
    number,
    publishedAt: new Date().toISOString(),
    snapshot: {
      name: current.name,
      goal: current.goal || '',
      description: current.description || '',
      durationWeeks: current.durationWeeks || 1,
      workouts,
    },
  };
  await setDoc(doc(versions(uid, program.id), version.id), version);
  await updateDoc(ref, { headVersion: number, publishedAt: version.publishedAt });
  return version;
}

export async function assignCoachProgram({ coachUid, clientUid, program }) {
  if (!clientUid || !coachUid || !program?.id || !program.headVersion) {
    throw new Error('Wähle einen Klienten und ein veröffentlichtes Trainingsprogramm.');
  }
  const versionSnap = await getDoc(doc(versions(coachUid, program.id), `v${program.headVersion}`));
  if (!versionSnap.exists()) throw new Error('Die veröffentlichte Programmversion fehlt.');
  const snapshot = versionSnap.data().snapshot;
  const clientApi = createPlanApi(clientUid);
  const prepared = [];
  const createdRoutineIds = [];
  let assignedId = null;
  try {
    for (const item of snapshot.workouts || []) {
      if (!item.exercises?.length) throw new Error(`Die Einheit „${item.label}“ enthält keine Übungen.`);
      const created = await clientApi.post('/routines', {
        name: `${snapshot.name} · ${item.label}`,
        goal: snapshot.goal,
        category: null,
      });
      createdRoutineIds.push(created.id);
      await clientApi.patch(`/routines/${encodeURIComponent(created.id)}`, { exercises: item.exercises });
      prepared.push({
        label: item.label || item.name || 'Trainingseinheit',
        targetCount: Number(item.targetCount) || 1,
        targetPeriodDays: Number(item.targetPeriodDays) || 7,
        weekdays: Array.isArray(item.weekdays) ? item.weekdays : [],
        restHoursAfter: Number(item.restHoursAfter) || 0,
        sourceTemplateId: created.id,
        exercises: item.exercises,
      });
    }

    const assigned = await createMacrocycle(clientUid, {
      name: snapshot.name,
      description: [snapshot.goal, snapshot.description].filter(Boolean).join(' · '),
      coachUid,
      totalWeeks: snapshot.durationWeeks,
      status: 'draft',
      routines: prepared,
    });
    if (!assigned?.id) throw new Error('Der Klientenplan konnte nicht angelegt werden.');
    assignedId = assigned.id;
    await publishMacrocycle(clientUid, assigned.id, {
      message: `Zugewiesen aus Coach-Programm v${program.headVersion}`,
      author: coachUid,
    });
    return assigned.id;
  } catch (error) {
    await Promise.allSettled([
      ...(assignedId ? [deleteMacrocycle(clientUid, assignedId)] : []),
      ...createdRoutineIds.map((id) => clientApi.delete(`/routines/${encodeURIComponent(id)}`)),
    ]);
    throw error;
  }
}

export async function listClientTrainingPlans(clientUid) {
  return listMacrocycles(clientUid);
}
