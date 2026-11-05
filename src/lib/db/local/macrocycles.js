import { api } from "./core";

// Makrozyklen — rotierender Trainingszyklus (Push/Pull/Legs o.ä.), kein Kalender.
// Pfadpräfix des Coach-Servers; Plan/Coach setzen VITE_COACH_API_PREFIX (z. B. "api/"), Standard "/".
const PREFIX = import.meta.env.VITE_COACH_API_PREFIX || "/";
const base = (clientUid) => `${PREFIX}fitness/coach/macrocycles/${encodeURIComponent(clientUid)}`;

export async function listMacrocycles(clientUid) {
  try {
    const data = await api.get(base(clientUid));
    return data?.macrocycles || [];
  } catch {
    return [];
  }
}

// Gibt { macrocycle, completions, nextRoutineIndex } zurück.
export async function getMacrocycle(clientUid, cycleId) {
  try {
    const data = await api.get(`${base(clientUid)}/${encodeURIComponent(cycleId)}`);
    return data?.ok ? data : null;
  } catch {
    return null;
  }
}

export async function createMacrocycle(clientUid, { name, coachUid, totalWeeks, status = "draft", description = "", routines }) {
  const data = await api.post(base(clientUid), { name, coachUid, totalWeeks, status, description, ...(routines ? { routines } : {}) });
  return data?.macrocycle || null;
}

export async function deleteMacrocycle(clientUid, cycleId) {
  await api.delete(`${base(clientUid)}/${encodeURIComponent(cycleId)}`);
  return true;
}

export async function addRoutine(clientUid, cycleId, { label, isDeload, restHoursAfter, targetCount, targetPeriodDays, sourceTemplateId, exercises = [], weekdays = [] }) {
  const data = await api.post(`${base(clientUid)}/${encodeURIComponent(cycleId)}/routines`, { label, isDeload, restHoursAfter, targetCount, targetPeriodDays, sourceTemplateId, exercises, weekdays });
  return data?.macrocycle || null;
}

export async function updateRoutine(clientUid, cycleId, routineId, patch) {
  const data = await api.put(`${base(clientUid)}/${encodeURIComponent(cycleId)}/routines/${encodeURIComponent(routineId)}`, patch);
  return data?.macrocycle || null;
}

export async function deleteRoutine(clientUid, cycleId, routineId) {
  const data = await api.delete(`${base(clientUid)}/${encodeURIComponent(cycleId)}/routines/${encodeURIComponent(routineId)}`);
  return data?.macrocycle || null;
}

export async function completeRoutine(clientUid, cycleId, routineId, exercises) {
  const data = await api.post(`${base(clientUid)}/${encodeURIComponent(cycleId)}/complete`, { routineId, exercises });
  return data?.completion || null;
}

export async function getLastPerformance(clientUid, cycleId, routineId) {
  try {
    const data = await api.get(`${base(clientUid)}/${encodeURIComponent(cycleId)}/routines/${encodeURIComponent(routineId)}/last`);
    return data?.last || null;
  } catch {
    return null;
  }
}

// Veröffentlichen legt eine Version an (message = Commit-Nachricht).
export async function publishMacrocycle(clientUid, cycleId, { message = '', author = null } = {}) {
  const data = await api.patch(`${base(clientUid)}/${encodeURIComponent(cycleId)}`, { status: 'published', message, author });
  return data?.macrocycle || null;
}

export async function listPlanVersions(clientUid, cycleId) {
  const data = await api.get(`${base(clientUid)}/${encodeURIComponent(cycleId)}/versions`);
  return data?.versions || [];
}

export async function markPlanRead(clientUid, cycleId, version) {
  try {
    const data = await api.post(`${base(clientUid)}/${encodeURIComponent(cycleId)}/receipts`, { version });
    return !!data?.ok;
  } catch { return false; }
}

export async function listPlanReceipts(clientUid, cycleId) {
  const data = await api.get(`${base(clientUid)}/${encodeURIComponent(cycleId)}/receipts`);
  return data?.receipts || [];
}

export async function restorePlanVersion(clientUid, cycleId, versionId) {
  const data = await api.post(`${base(clientUid)}/${encodeURIComponent(cycleId)}/restore`, { version: versionId });
  return data?.macrocycle || null;
}

// Name, Coach-Hinweis (description) oder Status (draft/published) ändern.
export async function updateMacrocycle(clientUid, cycleId, patch) {
  const data = await api.patch(`${base(clientUid)}/${encodeURIComponent(cycleId)}`, patch);
  return data?.macrocycle || null;
}
