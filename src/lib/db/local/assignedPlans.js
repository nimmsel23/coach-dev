import { api } from "./core";

// Alle Pläne, die dem aktuell eingeloggten Klienten zugewiesen wurden.
export async function getAssignedPlans(clientUid) {
  try {
    const data = await api.get(`/fitness/plans/assigned?uid=${encodeURIComponent(clientUid)}`);
    return data?.plans || [];
  } catch {
    return [];
  }
}

// Pläne, die dieser Coach diesem Klienten zugewiesen hat.
export async function getCoachAssignedPlans(coachUid, clientUid) {
  try {
    const data = await api.get(
      `/fitness/coach/plans/${encodeURIComponent(clientUid)}?coachUid=${encodeURIComponent(coachUid)}`
    );
    return data?.plans || [];
  } catch {
    return [];
  }
}

// Plan einem Klienten zuweisen (Coach baut lokal einen Plan und pusht ihn
// direkt in den User-Ordner des Klienten — kein Firestore nötig).
export async function assignPlanToClient(coachUid, clientUid, plan) {
  try {
    const data = await api.post(`/fitness/coach/plans/${encodeURIComponent(clientUid)}`, {
      coachUid,
      plan: typeof plan === "string" ? { id: plan } : plan,
    });
    return !!data?.ok;
  } catch (error) {
    console.error("Error assigning plan:", error);
    return false;
  }
}

export async function getPlanCompletions(clientUid, planId, date) {
  try {
    const data = await api.get(
      `/fitness/coach/plans/${encodeURIComponent(clientUid)}/${encodeURIComponent(planId)}/progress?date=${encodeURIComponent(date)}`
    );
    return data?.progress || null;
  } catch {
    return null;
  }
}

export async function updatePlanCompletions(clientUid, planId, date, doneExerciseIds) {
  try {
    await api.post(`/fitness/plans/${encodeURIComponent(planId)}/completions?uid=${encodeURIComponent(clientUid)}`, {
      date,
      doneExerciseIds: Array.isArray(doneExerciseIds) ? doneExerciseIds : [],
    });
    return true;
  } catch (error) {
    console.error("Error updating plan completions:", error);
    return false;
  }
}

export async function toggleExerciseCompletion(clientUid, planId, date, exerciseId) {
  try {
    await api.post(`/fitness/plans/${encodeURIComponent(planId)}/completions?uid=${encodeURIComponent(clientUid)}`, {
      date,
      exerciseId,
    });
    return true;
  } catch (error) {
    console.error("Error toggling exercise completion:", error);
    return false;
  }
}

export async function getClientPlanProgress(clientUid, planId) {
  try {
    const today = new Date().toISOString().split("T")[0];
    const data = await api.get(
      `/fitness/coach/plans/${encodeURIComponent(clientUid)}/${encodeURIComponent(planId)}/progress?date=${encodeURIComponent(today)}`
    );
    return data?.progress || null;
  } catch {
    return null;
  }
}
