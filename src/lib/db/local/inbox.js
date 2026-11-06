import { api } from "./core";

export async function getInbox() {
  try {
    const data = await api.get("/fitness/inbox");
    return (data?.items || []).map((item) => ({ ...item, file_id: item.id }));
  } catch {
    return [];
  }
}

export async function getGlobalInbox() {
  return getInbox();
}

export async function approveInbox(id, userId) {
  try {
    return await api.post(`/fitness/inbox/${id}/approve`, userId ? { userId } : {});
  } catch {
    return { ok: false };
  }
}

export async function reenrichInbox(id, _userId = null, ex = null) {
  try {
    const data = ex?.exercises?.[0] || ex?.enriched || ex || {};
    return await api.post(`/fitness/inbox/${id}/reenrich`, {
      exercise_id: data.exercise_id || data.id,
      display_name: data.display_name || data.name || data.german,
      feedback: ex?.coachFeedback || ex?.feedback || null,
      current_data: data,
    });
  } catch {
    return { ok: false };
  }
}

export async function deleteInbox(id, _userId = null) {
  try {
    return await api.delete(`/fitness/inbox/${id}`);
  } catch {
    return { ok: false };
  }
}

export async function getInboxMergeCandidates() {
  try {
    const data = await api.get("/fitness/inbox/merge-candidates");
    return data?.candidates || {};
  } catch {
    return {};
  }
}

export async function linkInboxSource(id, source, sourceId, userId = null, currentData = null) {
  try {
    return await api.post(`/fitness/inbox/${id}/link-source`, {
      source,
      source_id: sourceId,
      uid: userId,
      doc_id: id,
      current_data: currentData,
    });
  } catch {
    return { ok: false };
  }
}

export async function getInboxDuplicates(id, userId = null) {
  try {
    const suffix = userId ? `?uid=${encodeURIComponent(userId)}` : "";
    return await api.get(`/fitness/inbox/${id}/duplicates${suffix}`);
  } catch {
    return { ok: false, has_duplicates: false, plan: null };
  }
}

export async function mergeInboxDuplicates(id, userId = null) {
  try {
    return await api.post(`/fitness/inbox/${id}/merge-duplicates`, userId ? { uid: userId } : {});
  } catch {
    return { ok: false, merged: false, plan: null };
  }
}

export async function sendToInbox(exerciseData) {
  try {
    return await api.post("/fitness/inbox", exerciseData);
  } catch {
    return { ok: false };
  }
}

export async function queueForEnrichment(ex) {
  if (!ex || ex.source === 'expert') return;
  // Vormals ein fetch() gegen http://localhost:9120 — der archivierte
  // aiohttp-catalog-Server, längst durch das FastAPI-Prod-Backend (:9150,
  // hinter server.mjs :9100 geproxied) abgelöst. Schlug immer still fehl
  // (try{}catch{}), Übungen wurden im lokalen Modus nie fürs Enrichment
  // vorgemerkt. /fitness/inbox/queue ist der reale, laufende Endpoint dafür
  // (fitness/api/routers/exercises.py) — über api.post statt hartcodierter
  // toter URL. Hinweis: Der Endpoint schreibt aktuell nach
  // fitness/catalog/kb/inbox/*.yml, NICHT in das vom Enrichment-Watcher
  // beobachtete ~/.aos/fitness/users/<uid>/inbox/*.json — dieser Bruch ist
  // separat als offene Aufgabe dokumentiert, hier nur der :9120-Dead-Link-Bug.
  try {
    await api.post("/fitness/inbox/queue", {
      exercise_id: ex.id || ex.exercise_id,
      name: ex.name || ex.display_name,
    });
  } catch {}
}
