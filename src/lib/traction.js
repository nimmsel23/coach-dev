import { collectionGroup, doc, increment, onSnapshot, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { db } from '@db';

const VALID_SECTIONS = new Set([
  'session', 'review', 'learn', 'atlas', 'settings', 'focus', 'anamnese', 'inbox', 'gate',
  'today', 'timer', 'skills', 'plan', 'history', 'logbuch', 'muscles', 'readiness', 'verlauf',
  'protokoll', 'exercises', 'anatomy', 'quiz', 'strength',
]);

function localDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Vienna', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function safeSection(section) {
  return VALID_SECTIONS.has(section) ? section : 'other';
}

export async function recordFitnessUsage(uid, section, { pageView = false, appOpen = false } = {}) {
  if (!db || !uid) return;
  const sectionId = safeSection(section);
  const ref = doc(db, 'fitness', uid, 'tractionDaily', localDateKey());
  const increments = {
    date: localDateKey(),
    lastSeenAt: serverTimestamp(),
    lastSection: sectionId,
  };
  if (pageView) increments.sections = { [sectionId]: increment(1) };
  if (appOpen) increments.appOpens = increment(1);
  await setDoc(ref, increments, { merge: true });
}

export function watchFitnessTraction(onData, onError) {
  if (!db) return () => {};
  const since = new Date();
  since.setDate(since.getDate() - 6);
  const queryStart = localDateKey(since);
  const daysQuery = query(collectionGroup(db, 'tractionDaily'), where('date', '>=', queryStart));
  return onSnapshot(daysQuery, (snapshot) => {
    onData(snapshot.docs.map((entry) => ({
      uid: entry.ref.parent.parent?.id || '',
      id: entry.id,
      ...entry.data(),
    })));
  }, onError);
}
