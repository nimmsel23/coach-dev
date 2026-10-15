import { api } from "./core";

// ── Coach-Tab: globaler Feed aller Klienten-Workouts + Profile ───────────────

export async function getGlobalJournalFeed(limitCount = 100) {
  try {
    const data = await api.get(`/fitness/coach/feed?limit=${limitCount}`);
    return data?.feed || [];
  } catch {
    return [];
  }
}

// Gezielt nur die Einträge eines Klienten — umgeht den globalen
// limit-Cutoff von getGlobalJournalFeed() (siehe server.mjs-Kommentar).
export async function getClientJournalFeed(clientUid, limitCount = 100) {
  try {
    const data = await api.get(`/fitness/coach/feed?uid=${encodeURIComponent(clientUid)}&limit=${limitCount}`);
    return data?.feed || [];
  } catch {
    return [];
  }
}

// Coach beobachtet Habit-Fortschritt eines Klienten (read-only) — nutzt
// dieselben /routines + /workouts-Routen wie der Klient selbst, per
// ?uid=-Override (Python _uid_from_request() unterstützt das bereits für
// alle Routen, kein neuer Endpoint nötig). Fortschritt wird im UI-Layer
// aus routines+workouts berechnet (lib/habitProgress.js).
export async function getClientRoutinesProgress(clientUid) {
  try {
    const [routinesRes, workoutsRes] = await Promise.all([
      api.get(`/routines?uid=${encodeURIComponent(clientUid)}`),
      api.get(`/workouts?uid=${encodeURIComponent(clientUid)}`),
    ]);
    return { routines: routinesRes?.routines || [], workouts: workoutsRes?.workouts || [] };
  } catch {
    return { routines: [], workouts: [] };
  }
}

// Coach-Schreibpfad für Klienten-Routinen — nutzt dieselben Routen wie der
// Klient selbst, ?uid=-Override (siehe getClientRoutinesProgress oben, live
// bestätigt dass das auch für POST/PATCH/DELETE funktioniert, nicht nur GET).
// Einzelne Routine inkl. exercises (die Listen-Route /routines liefert
// bewusst keine exercises, siehe fitness/api/routers/workouts.py) — Coach-
// Pendant zu views/Plan/WorkoutList.jsx's on-demand Vorschau-Fetch.
export async function getClientRoutine(clientUid, routineId) {
  return api.get(`/routines/${routineId}?uid=${encodeURIComponent(clientUid)}`);
}

export async function createClientRoutine(clientUid, body) {
  return api.post(`/routines?uid=${encodeURIComponent(clientUid)}`, body);
}

export async function addClientRoutineExercise(clientUid, routineId, body) {
  return api.post(`/routines/${routineId}/exercises?uid=${encodeURIComponent(clientUid)}`, body);
}

export async function setClientRoutineTarget(clientUid, routineId, patch) {
  return api.patch(`/routines/${routineId}?uid=${encodeURIComponent(clientUid)}`, patch);
}

export async function deleteClientRoutine(clientUid, routineId) {
  return api.delete(`/routines/${routineId}?uid=${encodeURIComponent(clientUid)}`);
}

// Split-Zyklus-Konfiguration (Push/Pull/Legs x10) pro Klient — welche
// `block`-Tags gezählt werden + Zielzahl der Zyklen. Genutzt von
// ClientHabitCycle.jsx zusammen mit lib/habitProgress.js::computeSplitCycleProgress().
export async function getClientHabitCycleConfig(clientUid) {
  try {
    const data = await api.get(`/fitness/coach/habit-cycle/${encodeURIComponent(clientUid)}`);
    return data?.config || { tags: [], targetCycles: 0 };
  } catch {
    return { tags: [], targetCycles: 0 };
  }
}

export async function saveClientHabitCycleConfig(clientUid, config) {
  try {
    return await api.post(`/fitness/coach/habit-cycle/${encodeURIComponent(clientUid)}`, config);
  } catch {
    return { ok: false };
  }
}

export async function getAllUserProfiles() {
  try {
    const data = await api.get('/fitness/coach/profiles');
    return data?.profiles || {};
  } catch {
    return {};
  }
}

export async function saveCoachFeedback(userId, sessionId, type, text) {
  try {
    return await api.post('/fitness/coach/feedback', { userId, sessionId, text });
  } catch {
    return { ok: false };
  }
}

// Kommentar auf einem einzelnen Workout im neuen Routinen/Workouts-Modell
// (Plan-Tab, Strong-Modell) — saveCoachFeedback oben schreibt aufs alte
// Session-JSON-Modell, ein anderer Speicher. PATCH /workouts/:id ist
// bereits generisch (`workout.update(body)` in workouts.py), also reicht
// ein simples Patch mit ?uid=-Override, kein neuer Endpoint nötig.
export async function saveWorkoutFeedback(clientUid, workoutId, text) {
  return api.patch(`/workouts/${workoutId}?uid=${encodeURIComponent(clientUid)}`, { coachFeedback: text });
}

// Coach erstellt/liest/patcht ein Workout im Namen eines Klienten — für den
// Fall "Coach hat live mit dem Klienten trainiert, markiert das Template
// als heute erledigt" (quickCompleteRoutine-Äquivalent, siehe
// lib/quickComplete.js::quickCompleteClientRoutine).
export async function createClientWorkout(clientUid, body) {
  return api.post(`/workouts?uid=${encodeURIComponent(clientUid)}`, body);
}

export async function getClientWorkout(clientUid, workoutId) {
  return api.get(`/workouts/${workoutId}?uid=${encodeURIComponent(clientUid)}`);
}

export async function updateClientWorkout(clientUid, workoutId, patch) {
  return api.patch(`/workouts/${workoutId}?uid=${encodeURIComponent(clientUid)}`, patch);
}

// ── KI-Insights: Trainingslücken-Check + persistierte Drafts ────────────────
// Portiert aus fitness-log console (fitness/log/console/{gap_check,drafts}.py),
// hier als Einmal-Check statt Endlos-Loop. Gleiche Persistenz
// (~/.aos/fitness/console/drafts/), `fitness-log drafts` sieht dieselben Einträge.
export async function checkClientGaps(clientUid = null) {
  try {
    const qs = clientUid ? `?uid=${encodeURIComponent(clientUid)}` : '';
    const data = await api.get(`/fitness/coach/gaps${qs}`);
    return data?.gaps || [];
  } catch {
    return [];
  }
}

export async function getCoachDrafts({ uid = null, status = null } = {}) {
  try {
    const params = new URLSearchParams();
    if (uid) params.set('uid', uid);
    if (status) params.set('status', status);
    const qs = params.toString();
    const data = await api.get(`/fitness/coach/drafts${qs ? `?${qs}` : ''}`);
    return data?.drafts || [];
  } catch {
    return [];
  }
}

export async function reviewCoachDraft(draftId, uid, status) {
  return api.post(`/fitness/coach/drafts/${encodeURIComponent(draftId)}/review`, { uid, status });
}
