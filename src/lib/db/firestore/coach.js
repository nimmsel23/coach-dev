/**
 * firestore/coach.js — Coach-Tab: globaler Feed aller Klienten-Workouts/Journale + Profile.
 */

import {
  doc, setDoc, getDoc, updateDoc, getDocs, writeBatch, serverTimestamp, collectionGroup, collection,
} from "firebase/firestore";

import { db } from "../../../firebase.js";
import { LOCAL_FITNESS_API_BASE } from "./core.js";
import { normalizeRoutineExercise } from "./routines.js";
import { createWorkout, getWorkout, updateWorkout } from "./workouts.js";

// Coach erstellt/liest/patcht ein Workout im Namen eines Klienten (Quick-
// Complete bei gemeinsam trainierter Session) — dünne Wrapper um die
// uidOverride-parametrisierten workouts.js-Funktionen, kein Parallelbau.
export async function createClientWorkout(clientUid, body) {
  return createWorkout(body, clientUid);
}

export async function getClientWorkout(clientUid, workoutId) {
  return getWorkout(workoutId, clientUid);
}

export async function updateClientWorkout(clientUid, workoutId, patch) {
  return updateWorkout(workoutId, patch, clientUid);
}

// Coach-Schreibpfad für Klienten-Routinen (Habit-Ziele setzen/Routine
// anlegen). Spiegelt firestore/routines.js 1:1, aber parametrisiert auf
// clientUid statt getUid() (das würde immer den eingeloggten Coach selbst
// treffen). "Basic" bewusst: kein Reorder/Template-Sets-Editor hier, nur
// Name+Ziel+Übungen hinzufügen — Feintuning macht der Klient selbst im
// Plan-Tab (views/Plan/RoutineBuilder.jsx).
export async function getClientRoutine(clientUid, routineId) {
  const exSnap = await getDocs(collection(db, "fitness", clientUid, "routines", routineId, "exercises"));
  const exercises = exSnap.docs
    .map((d) => normalizeRoutineExercise({ id: d.id, ...d.data() }))
    .sort((a, b) => a.order - b.order);
  return { routine: { id: routineId, exercises } };
}

export async function createClientRoutine(clientUid, { name, goal = null, category = null }) {
  const ref = doc(collection(db, "fitness", clientUid, "routines"));
  await setDoc(ref, {
    name, goal, category,
    created_at: new Date().toISOString(),
    exerciseCount: 0,
  });
  return { id: ref.id };
}

export async function addClientRoutineExercise(clientUid, routineId, body) {
  const exercisesCol = collection(db, "fitness", clientUid, "routines", routineId, "exercises");
  const exSnap = await getDocs(exercisesCol);
  const order = exSnap.size;
  const ref = doc(exercisesCol);
  const exercise = normalizeRoutineExercise({ ...body, id: ref.id }, order);
  const batch = writeBatch(db);
  batch.set(ref, exercise);
  batch.update(doc(db, "fitness", clientUid, "routines", routineId), { exerciseCount: order + 1 });
  await batch.commit();
  return { id: ref.id };
}

export async function setClientRoutineTarget(clientUid, routineId, patch) {
  await updateDoc(doc(db, "fitness", clientUid, "routines", routineId), patch);
  return { ok: true };
}

export async function deleteClientRoutine(clientUid, routineId) {
  const exSnap = await getDocs(collection(db, "fitness", clientUid, "routines", routineId, "exercises"));
  const batch = writeBatch(db);
  exSnap.docs.forEach((d) => batch.delete(d.ref));
  batch.delete(doc(db, "fitness", clientUid, "routines", routineId));
  await batch.commit();
  return { ok: true };
}

// Direkte Pro-Klient-Query (fitness/{uid}/sessions|journal|habitJournals),
// keine collectionGroup über alle User. Wichtig: getGlobalJournalFeed()
// deckelt global auf `limitCount` Items über ALLE Klienten hinweg, bevor
// überhaupt gefiltert wird — bei mehreren aktiven Usern (inkl. des Coaches
// selbst, der die App auch für eigene Sessions nutzt) fallen die Einträge
// eines bestimmten Klienten dadurch komplett aus dem Feed, noch bevor ein
// clientseitiger uid-Filter sie sehen könnte. Für "zeig mir Klient X" muss
// deshalb gezielt nach diesem einen Klienten gequeried werden.
export async function getClientJournalFeed(clientUid, limitCount = 100) {
  const feed = [];

  try {
    const snap = await getDocs(collection(db, "fitness", clientUid, "sessions"));
    for (const d of snap.docs) {
      const data = d.data();
      feed.push({
        id: d.id,
        userId: clientUid,
        path: d.ref.path,
        date: data.date || "Unbekannt",
        block: data.block || null,
        exercises: data.exercises || [],
        effort: data.effort ?? null,
        mood: data.mood || "",
        notes: data.notes || "",
        coachFeedback: data.coachFeedback || "",
        time: data.saved_at?.toDate?.()?.toISOString() || data.date || "",
        type: "workout",
      });
    }
  } catch (e) {
    console.error("Error in getClientJournalFeed sessions:", e);
  }

  try {
    const journalSnap = await getDocs(collection(db, "fitness", clientUid, "journal"));
    for (const d of journalSnap.docs) {
      const data = d.data();
      feed.push({
        id: d.id,
        userId: clientUid,
        path: d.ref.path,
        date: data.date || "Unbekannt",
        notes: data.text || "",
        tags: data.tags || [],
        coachFeedback: data.coachFeedback || "",
        time: data.time || data.date || "",
        type: "journal",
      });
    }
  } catch (e) {
    console.error("Error in getClientJournalFeed journal:", e);
  }

  try {
    const habitSnap = await getDocs(collection(db, "fitness", clientUid, "habitJournals"));
    for (const d of habitSnap.docs) {
      const data = d.data();
      feed.push({
        id: d.id,
        userId: clientUid,
        path: d.ref.path,
        habitId: data.habitId || null,
        date: data.date || "Unbekannt",
        notes: data.text || "",
        coachFeedback: data.coachFeedback || "",
        time: data.date || "",
        type: "habit_journal",
      });
    }
  } catch (e) {
    console.error("Error in getClientJournalFeed habitJournals:", e);
  }

  feed.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  return feed.slice(0, limitCount);
}

// Coach beobachtet Habit-Fortschritt eines Klienten (read-only): direkte
// Query auf fitness/{clientUid}/routines + .../workouts, bypass getUid()
// (das würde immer den eingeloggten Coach selbst treffen, nicht den
// Klienten). Nur Meta-Felder nötig (targetCount/targetPeriodDays auf der
// Routine, routine_id/finished_at/sessionState auf dem Workout) — Fortschritt
// wird im UI-Layer aus beidem berechnet (lib/habitProgress.js), keine
// exercises-Subcollections nötig.
export async function getClientRoutinesProgress(clientUid) {
  try {
    const [routinesSnap, workoutsSnap] = await Promise.all([
      getDocs(collection(db, "fitness", clientUid, "routines")),
      getDocs(collection(db, "fitness", clientUid, "workouts")),
    ]);
    return {
      routines: routinesSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
      workouts: workoutsSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
    };
  } catch (e) {
    console.error("Error in getClientRoutinesProgress:", e);
    return { routines: [], workouts: [] };
  }
}

export async function getGlobalJournalFeed(limitCount = 50) {
  const feed = [];

  // 1. Workout Sessions
  try {
    const snap = await getDocs(collectionGroup(db, "sessions"));
    for (const d of snap.docs) {
      const data = d.data();
      const userId = d.ref.parent?.parent?.id || "unknown";
      feed.push({
        id: d.id,
        userId,
        path: d.ref.path,
        date: data.date || "Unbekannt",
        block: data.block || null,
        exercises: data.exercises || [],
        effort: data.effort ?? null,
        mood: data.mood || "",
        notes: data.notes || "",
        coachFeedback: data.coachFeedback || "",
        time: data.saved_at?.toDate?.()?.toISOString() || data.date || "",
        type: "workout",
      });
    }
  } catch (e) {
    console.error("Error in getGlobalJournalFeed sessions:", e);
  }

  // 2. Daily Journal Entries
  try {
    const journalSnap = await getDocs(collectionGroup(db, "journal"));
    for (const d of journalSnap.docs) {
      const data = d.data();
      const userId = d.ref.parent?.parent?.id || "unknown";
      feed.push({
        id: d.id,
        userId,
        path: d.ref.path,
        date: data.date || "Unbekannt",
        notes: data.text || "",
        tags: data.tags || [],
        coachFeedback: data.coachFeedback || "",
        time: data.time || data.date || "",
        type: "journal",
      });
    }
  } catch (e) {
    console.error("Error in getGlobalJournalFeed journal:", e);
  }

  // 3. Habit Journal Entries
  try {
    const habitSnap = await getDocs(collectionGroup(db, "habitJournals"));
    for (const d of habitSnap.docs) {
      const data = d.data();
      const userId = d.ref.parent?.parent?.id || "unknown";
      feed.push({
        id: d.id,
        userId,
        path: d.ref.path,
        habitId: data.habitId || null,
        date: data.date || "Unbekannt",
        notes: data.text || "",
        coachFeedback: data.coachFeedback || "",
        time: data.date || "",
        type: "habit_journal",
      });
    }
  } catch (e) {
    console.error("Error in getGlobalJournalFeed habitJournals:", e);
  }

  feed.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  return feed.slice(0, limitCount);
}

// Split-Zyklus-Konfiguration (Push/Pull/Legs x10) pro Klient — Pendant zu
// local/coach.js, hier direkt als Doc statt Datei.
export async function getClientHabitCycleConfig(clientUid) {
  try {
    const snap = await getDoc(doc(db, "fitness", clientUid, "settings", "habitCycle"));
    return snap.exists() ? { tags: [], targetCycles: 0, ...snap.data() } : { tags: [], targetCycles: 0 };
  } catch (e) {
    console.error("Error in getClientHabitCycleConfig:", e);
    return { tags: [], targetCycles: 0 };
  }
}

export async function saveClientHabitCycleConfig(clientUid, config) {
  try {
    await setDoc(doc(db, "fitness", clientUid, "settings", "habitCycle"), {
      tags: Array.isArray(config?.tags) ? config.tags : [],
      targetCycles: Number(config?.targetCycles) || 0,
      updated_at: serverTimestamp(),
    });
    return { ok: true };
  } catch (e) {
    console.error("Error in saveClientHabitCycleConfig:", e);
    return { ok: false };
  }
}

export async function getAllUserProfiles() {
  const profiles = {};

  try {
    const snap = await getDocs(collectionGroup(db, "profile"));
    snap.docs.forEach((d) => {
      const uid = d.ref.parent?.parent?.id;
      if (uid) profiles[uid] = { ...profiles[uid], ...d.data() };
    });
  } catch {}

  try {
    const snapSettings = await getDocs(collectionGroup(db, "settings"));
    snapSettings.docs.forEach((d) => {
      const uid = d.ref.parent?.parent?.id;
      if (uid) {
        const data = d.data();
        profiles[uid] = {
          displayName: data.displayName || data.name || profiles[uid]?.displayName || profiles[uid]?.email || uid,
          email: data.email || profiles[uid]?.email || "",
          ...profiles[uid],
          ...data,
        };
      }
    });
  } catch {}

  return profiles;
}

export async function saveCoachFeedback(userId, entryId, type, text, habitId = null, date = null) {
  if (type === "habit_journal" || type === "habit") {
    const targetHabitId = habitId || entryId.split("__")[0];
    const targetDate = date || entryId.split("__")[1];
    const ref = doc(db, "fitness", userId, "habitJournals", `${targetHabitId}__${targetDate}`);
    await setDoc(ref, { coachFeedback: String(text || "").trim(), updated_at: serverTimestamp() }, { merge: true });
  } else if (type === "workout" || type === "session") {
    const ref = doc(db, "fitness", userId, "sessions", entryId);
    await setDoc(ref, { coachFeedback: String(text || "").trim(), updated_at: serverTimestamp() }, { merge: true });
  } else {
    const ref = doc(db, "fitness", userId, "journal", entryId);
    await setDoc(ref, { coachFeedback: String(text || "").trim() }, { merge: true });
  }
  return { ok: true };
}

// Kommentar auf einem einzelnen Workout im neuen Routinen/Workouts-Modell
// (Plan-Tab, Strong-Modell, fitness/{uid}/workouts/{id}) — eigene Collection,
// saveCoachFeedback oben deckt die ab (sessions/journal/habitJournals).
export async function saveWorkoutFeedback(clientUid, workoutId, text) {
  await updateDoc(doc(db, "fitness", clientUid, "workouts", workoutId), {
    coachFeedback: String(text || "").trim(),
  });
  return { ok: true };
}

// ── KI-Insights: Trainingslücken-Check + persistierte Drafts ────────────────
// Die eigentliche Logik (Gemini/Haiku-Check, Datei-Persistenz unter
// ~/.aos/fitness/console/drafts/) läuft nur im Python-Backend, nicht
// portierbar nach reinem Firestore — identischer Fall wie
// getInboxMergeCandidates() oben. Im echten Coach-Build (import.meta.env.MODE
// === "coach") ist LOCAL_FITNESS_API_BASE bewusst "" (kein Heimnetz-Zugriff
// von remote) — liefert dann leer statt Fehler, Gap-Badges/Drafts bleiben im
// Remote-Coach-Build schlicht aus, kein kritischer Pfad.
export async function checkClientGaps(clientUid = null) {
  if (!LOCAL_FITNESS_API_BASE) return [];
  try {
    const qs = clientUid ? `?uid=${encodeURIComponent(clientUid)}` : '';
    const res = await fetch(`${LOCAL_FITNESS_API_BASE}/coach/gaps${qs}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data?.gaps || [];
  } catch {
    return [];
  }
}

export async function getCoachDrafts({ uid = null, status = null } = {}) {
  if (!LOCAL_FITNESS_API_BASE) return [];
  try {
    const params = new URLSearchParams();
    if (uid) params.set('uid', uid);
    if (status) params.set('status', status);
    const qs = params.toString();
    const res = await fetch(`${LOCAL_FITNESS_API_BASE}/coach/drafts${qs ? `?${qs}` : ''}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data?.drafts || [];
  } catch {
    return [];
  }
}

export async function reviewCoachDraft(draftId, uid, status) {
  if (!LOCAL_FITNESS_API_BASE) return { ok: false };
  try {
    const res = await fetch(`${LOCAL_FITNESS_API_BASE}/coach/drafts/${encodeURIComponent(draftId)}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid, status }),
    });
    return { ok: res.ok };
  } catch {
    return { ok: false };
  }
}
