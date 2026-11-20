/**
 * firestore/inbox.js — Coach-Inbox CRUD (Übungsanfragen/Review) für Firestore.
 */

import {
  collection, doc, addDoc, getDoc, getDocs, deleteDoc, updateDoc, onSnapshot,
  query, orderBy, serverTimestamp, collectionGroup,
} from "firebase/firestore";

import { db } from "../../../firebase.js";
import { getUid, LOCAL_FITNESS_API_BASE } from "./core.js";
import { normalizeExerciseRecord } from "../shared/exercise.js";
import { isGithubInboxItem, listGithubInboxPrs } from "./githubInbox.js";

const FIREBASE_COACH = import.meta.env.MODE === "coach";

// ── Coach-Worker (coach-sync.service auf dem Coach-Rechner) ──────────────────
// Die Web-App führt Inbox-Befehle nicht selbst aus: sie schreibt `coachCommands`
// (status queued), der Worker übernimmt sie und schreibt das Ergebnis zurück.
// Der Worker meldet sich alle <=15 s in `coachState/bridge` (`last_seen`).
const WORKER_STALE_MS = 60000;      // älter = Worker gilt als offline
const COMMAND_TIMEOUT_MS = 190000;  // so lange wartet die UI auf ein laufendes Ergebnis

const COACH_ERROR_TEXT = {
  coach_worker_offline: "Coach-Rechner offline – Befehl nicht gesendet",
  coach_command_timeout: "Keine Antwort vom Coach-Rechner – Ergebnis unklar, Liste neu laden",
  github_pr_close_on_github: "GitHub-PR bitte auf github.com/nimmsel23/fitness schließen",
};

function coachError(code, message) {
  const err = new Error(message || code);
  err.code = code;
  return err;
}

/** Kurztext für Toasts: bekannte Codes → Klartext, sonst Fallback. */
export function describeCoachError(err, fallback = "Fehlgeschlagen") {
  const code = err?.code || err?.message;
  return COACH_ERROR_TEXT[code] || (err?.message && !String(err.message).startsWith("coach_") ? err.message : fallback);
}

function workerStatus(data, now = Date.now()) {
  const lastSeen = data?.last_seen?.toDate?.() ?? null;
  if (!lastSeen) return { state: "unknown", lastSeen: null, ageMs: null, queued: 0, stale: 0 };
  const ageMs = now - lastSeen.getTime();
  return {
    state: ageMs > WORKER_STALE_MS ? "offline" : "online",
    lastSeen, ageMs,
    queued: data.queued || 0, stale: data.stale || 0, processing: data.processing || 0, errors: data.errors_since_start || 0, lastError: data.last_error || null,
  };
}

/**
 * Live-Status des Coach-Workers. `cb({state: online|offline|unknown, lastSeen, ageMs, queued, stale})`
 * kommt bei jeder Heartbeat-Änderung und alle 15 s neu bewertet (Alter wächst ohne neue Daten).
 * Gibt die Abmelde-Funktion zurück.
 */
export function watchCoachWorker(cb) {
  let last = null;
  const emit = () => cb(workerStatus(last));
  const unsub = onSnapshot(
    doc(db, "coachState", "bridge"),
    (snap) => { last = snap.exists() ? snap.data() : null; emit(); },
    () => { last = null; emit(); },
  );
  const timer = setInterval(emit, 15000);
  return () => { unsub(); clearInterval(timer); };
}

async function coachCommand(action, itemId, uid = null, payload = {}) {
  // Offline-Worker sofort melden, statt 190 s zu warten und einen Befehl abzulegen,
  // der erst Stunden später (oder nie) ausgeführt würde.
  try {
    const hb = await getDoc(doc(db, "coachState", "bridge"));
    if (workerStatus(hb.exists() ? hb.data() : null).state === "offline") {
      throw coachError("coach_worker_offline");
    }
  } catch (e) {
    if (e?.code === "coach_worker_offline") throw e;
    // Heartbeat nicht lesbar: unbekannt, Befehl trotzdem versuchen.
  }
  const ref = await addDoc(collection(db, "coachCommands"), {
    action, item_id: itemId, uid, payload,
    requested_by: getUid(), status: "queued", created_at: serverTimestamp(),
  });
  // Ergebnis per Live-Listener auf das Befehls-Dokument, kein Polling.
  return new Promise((resolve, reject) => {
    let unsub = () => {};
    const timer = setTimeout(() => { unsub(); reject(coachError("coach_command_timeout")); }, COMMAND_TIMEOUT_MS);
    const finish = (fn, value) => { clearTimeout(timer); unsub(); fn(value); };
    unsub = onSnapshot(ref, (snap) => {
      const data = snap.data();
      if (data?.status === "done") finish(resolve, data.result);
      else if (data?.status === "error") finish(reject, new Error(data.error || "coach_command_failed"));
    }, (e) => finish(reject, e));
  });
}

function mapLocalInboxItems(data) {
  return (data?.items || []).map((item) => ({
    ...item,
    file_id: item.file_id || item.id,
    cache_source: "local_prod",
  }));
}

async function fetchLocalInbox() {
  const res = await fetch(`${LOCAL_FITNESS_API_BASE}/inbox`);
  if (!res.ok) throw new Error(`local_inbox_${res.status}`);
  return mapLocalInboxItems(await res.json());
}

function markFirestoreCacheItem(item) {
  return {
    ...item,
    cache_source: "firestore_cache",
    offline_cache: true,
  };
}

// ── Inbox ─────────────────────────────────────────────────────────────────────

export async function sendToInbox(exerciseData) {
  const uid = getUid();
  if (!FIREBASE_COACH) try {
    const res = await fetch(`${LOCAL_FITNESS_API_BASE}/inbox/queue`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...exerciseData, uid }),
    });
    if (res.ok) return await res.json();
  } catch {
    // Firestore is the offline/cache fallback when the local catalog server is absent.
  }

  try {
    const ref = await addDoc(collection(db, "fitness", uid, "inbox"), {
      ...exerciseData,
      userId: uid,
      received_at: serverTimestamp(),
      cache_source: "firestore_cache",
      sync_status: "pending_local",
    });
    return { ok: true, id: ref.id, cached: true };
  } catch (e) {
    console.error("Inbox Firestore push failed:", e);
    return { ok: false };
  }
}

/** ID-only Inbox-Draft (wger/yuhonas verlinken). Enrichment bewusst später. */
export async function createInboxDraft(payload = {}) {
  const body = {
    display_name: payload.display_name || payload.name || "",
    exercise_id: payload.exercise_id || payload.id || null,
    wger_id: payload.wger_id ?? null,
    yuhonas_id: payload.yuhonas_id ?? null,
    coaching_notes: payload.coaching_notes || null,
    force: Boolean(payload.force),
  };
  if (FIREBASE_COACH) {
    return coachCommand("create-draft", body.exercise_id || "new", getUid(), body);
  }
  const res = await fetch(`${LOCAL_FITNESS_API_BASE}/inbox/draft`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let detail = `draft_${res.status}`;
    try {
      const data = await res.json();
      detail = data?.detail || detail;
    } catch {
      // keep status fallback
    }
    throw coachError("create_inbox_draft_failed", String(detail));
  }
  return await res.json();
}

// Neue unbekannte Übungen werden zuerst als lokale Inbox-Drafts erzeugt. Der
// Firestore-Pfad darunter ist nur Cache/Offline-Warteschlange.
export async function queueForEnrichment(ex) {
  if (!ex || ex.source === "expert") return;
  await sendToInbox({
    exercise_id: ex.id || ex.exercise_id || null,
    name: ex.name || ex.display_name,
    status: "pending_review",
  });
}

export async function getInbox() {
  try {
    return await fetchLocalInbox();
  } catch {
    // Continue with Firestore as last-known/offline cache.
  }

  const q = query(
    collection(db, "fitness", getUid(), "inbox"),
    orderBy("received_at", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => markFirestoreCacheItem({ file_id: d.id, ...d.data() }));
}

function mapCoachInboxDocs(docs) {
  return docs.map((entry) => ({
    ...entry.data(),
    file_id: entry.id,
    cache_source: entry.data()?.cache_source || "firestore_cache",
  }));
}

/**
 * Live-Liste der Coach-Inbox (Firestore `coachInbox`). Optional mit GitHub-PRs gemerged.
 * Callback: `cb(items[])`. Gibt Unsubscribe zurück.
 */
export function watchCoachInbox(cb, { includeGithub = true } = {}) {
  let firestoreItems = [];
  let prs = [];
  let cancelled = false;

  const emit = () => {
    if (cancelled) return;
    const prIds = new Set(prs.map((p) => p.file_id));
    cb([...prs, ...firestoreItems.filter((item) => !prIds.has(item.file_id))]);
  };

  const unsub = onSnapshot(
    collection(db, "coachInbox"),
    (snap) => {
      firestoreItems = mapCoachInboxDocs(snap.docs);
      emit();
    },
    () => {
      firestoreItems = [];
      emit();
    },
  );

  if (includeGithub && FIREBASE_COACH) {
    listGithubInboxPrs()
      .then((data) => {
        if (cancelled) return;
        prs = Array.isArray(data) ? data : [];
        emit();
      })
      .catch(() => {
        if (!cancelled) {
          prs = [];
          emit();
        }
      });
  }

  return () => {
    cancelled = true;
    unsub();
  };
}

export async function getGlobalInbox() {
  if (FIREBASE_COACH) {
    // Übergang: GitHub-PRs (KB-SOT) zuerst, Firestore coachInbox als Cache/Altbestand.
    let prs = [];
    try {
      prs = await listGithubInboxPrs();
    } catch (e) {
      console.warn("github inbox prs unavailable", e);
    }
    const snap = await getDocs(collection(db, "coachInbox"));
    const firestoreItems = mapCoachInboxDocs(snap.docs);
    const prIds = new Set(prs.map((p) => p.file_id));
    return [...prs, ...firestoreItems.filter((item) => !prIds.has(item.file_id))];
  }
  try {
    return await fetchLocalInbox();
  } catch {
    // Continue with Firestore as last-known/offline cache.
  }

  try {
    const snap = await getDocs(collectionGroup(db, "inbox"));
    return snap.docs
      .map((d) => markFirestoreCacheItem({
        file_id: d.id,
        userId: d.ref.parent?.parent?.id || null,
        ...d.data(),
      }))
      .filter((item) => item.status !== "approved" && item.status !== "rejected");
  } catch (e) {
    console.error("getGlobalInbox error:", e);
    return [];
  }
}

export async function approveInbox(id, userId, ex = null) {
  const targetUid = userId || getUid();
  let exercise = ex?.exercises?.[0] || ex?.enriched || ex || null;

  if (!exercise) {
    try {
      const snap = await getDoc(doc(db, "fitness", targetUid, "inbox", id));
      if (snap.exists()) {
        const data = snap.data();
        exercise = data.enriched || data;
      }
    } catch {
      // Firestore is only a cache/data helper here; local approve remains authoritative.
    }
  }

  const currentData = exercise ? normalizeExerciseRecord(exercise) : null;
  if (FIREBASE_COACH && isGithubInboxItem({ file_id: id, ...(ex || {}) })) {
    if (ex?.html_url && typeof window !== "undefined") window.open(ex.html_url, "_blank", "noopener");
    return { ok: true, deferred: "github_pr", url: ex?.html_url || null };
  }
  if (FIREBASE_COACH) return coachCommand("approve", id, targetUid, { current_data: currentData });
  try {
    const res = await fetch(`${LOCAL_FITNESS_API_BASE}/inbox/${id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        uid: targetUid,
        doc_id: id,
        current_data: currentData,
      }),
    });
    if (res.ok) return await res.json();
    return { ok: false, error: `local_approve_${res.status}` };
  } catch (e) {
    return { ok: false, error: "local_unreachable", detail: String(e) };
  }
}

// Jagt einen bestehenden Firestore-Inbox-Eintrag nochmal frisch durch die
// lokale Fitness-Prod-Kette (:6100 -> Python/Gemini/Review) und schreibt den
// angereicherten Draft von dort zurueck. Ohne lokalen Prod-Server gibt es kein
// finales Reenrich mehr: Firestore ist hier nur Cache, nicht Enrichment-Owner.
export async function reenrichInbox(id, userId, ex) {
  const targetUid = userId || getUid();
  const data = ex?.exercises?.[0] || ex?.enriched || ex || {};
  const feedback = ex?.coachFeedback || ex?.feedback || null;
  if (FIREBASE_COACH && isGithubInboxItem({ file_id: id, ...(ex || {}) })) {
    // Cloud-Fallback: Enrich-Inbox workflow; UI öffnet den PR zur Kontrolle.
    if (ex?.html_url && typeof window !== "undefined") window.open(ex.html_url, "_blank", "noopener");
    return { ok: true, deferred: "github_pr_enrich", url: ex?.html_url || null };
  }
  if (FIREBASE_COACH) return coachCommand("reenrich", id, targetUid, {
    exercise_id: data.exercise_id || data.id,
    display_name: data.display_name || data.name || data.german,
    feedback, current_data: data,
  });
  try {
    const res = await fetch(`${LOCAL_FITNESS_API_BASE}/inbox/${id}/reenrich`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        exercise_id: data.exercise_id || data.id,
        display_name: data.display_name || data.name || data.german,
        uid: targetUid,
        doc_id: id,
        feedback,
        current_data: data,
      }),
    });
    if (res.ok) return await res.json();
    return { ok: false, error: `local_reenrich_${res.status}` };
  } catch (e) {
    return { ok: false, error: "local_unreachable", detail: String(e) };
  }
}

export async function deleteInbox(id, userId) {
  const targetUid = userId || getUid();
  if (FIREBASE_COACH && isGithubInboxItem({ file_id: id })) {
    return { ok: false, error: "github_pr_close_on_github" };
  }
  if (FIREBASE_COACH) return coachCommand("delete", id, targetUid);
  try {
    const res = await fetch(`${LOCAL_FITNESS_API_BASE}/inbox/${id}`, { method: "DELETE" });
    if (res.ok) return await res.json();
  } catch {
    // Firestore cache cleanup remains useful when local is unavailable.
  }

  const inboxRef = doc(db, "fitness", targetUid, "inbox", id);
  const snap = await getDoc(inboxRef);
  if (snap.exists() && targetUid !== getUid()) {
    await updateDoc(inboxRef, { status: "rejected", rejected_at: serverTimestamp() });
  } else {
    await deleteDoc(inboxRef);
  }
  return { ok: true };
}

// Braucht den lokalen Coach-Rechner mit Fitness-Prod-Server (:6100), da die
// Fuzzy-Matches gegen unreviewed_wger.yml/unreviewed_yuhonas.yml laufen —
// nicht im Firebase-Build gebundelt. Liefert bei Nichterreichbarkeit einfach
// leer statt einen Fehler zu werfen; Kandidaten sind ein optionaler Hinweis,
// kein kritischer Pfad.
export async function getInboxMergeCandidates() {
  if (FIREBASE_COACH) {
    const snap = await getDoc(doc(db, "coachState", "mergeCandidates"));
    return snap.data()?.candidates || {};
  }
  try {
    const res = await fetch(`${LOCAL_FITNESS_API_BASE}/inbox/merge-candidates`);
    if (!res.ok) return {};
    const data = await res.json();
    return data?.candidates || {};
  } catch {
    return {};
  }
}

export async function linkInboxSource(id, source, sourceId, userId, currentData = null) {
  const targetUid = userId || getUid();
  if (FIREBASE_COACH) return coachCommand("link-source", id, targetUid, {
    source, source_id: sourceId, current_data: currentData,
  });
  const res = await fetch(`${LOCAL_FITNESS_API_BASE}/inbox/${id}/link-source`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source,
      source_id: sourceId,
      uid: targetUid,
      doc_id: id,
      current_data: currentData,
    }),
  });
  if (!res.ok) return { ok: false };
  return await res.json();
}

export async function getInboxDuplicates(id, userId) {
  const targetUid = userId || getUid();
  if (FIREBASE_COACH) return coachCommand("duplicates", id, targetUid);
  const res = await fetch(`${LOCAL_FITNESS_API_BASE}/inbox/${id}/duplicates?uid=${encodeURIComponent(targetUid)}`);
  if (!res.ok) return { ok: false, has_duplicates: false, plan: null };
  return await res.json();
}

export async function mergeInboxDuplicates(id, userId) {
  const targetUid = userId || getUid();
  if (FIREBASE_COACH) return coachCommand("merge-duplicates", id, targetUid);
  const res = await fetch(`${LOCAL_FITNESS_API_BASE}/inbox/${id}/merge-duplicates`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uid: targetUid }),
  });
  if (!res.ok) return { ok: false, merged: false, plan: null };
  return await res.json();
}

// Source correction/search use the existing authorized worker command transport.
export async function editExerciseSources(id, payload) {
  let result;
  if (FIREBASE_COACH) result = await coachCommand('link-source', id, getUid(), payload);
  else {
    const response = await fetch(`${LOCAL_FITNESS_API_BASE}/inbox/${encodeURIComponent(id)}/link-source`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(`Quellenaktion fehlgeschlagen (${response.status})`);
    result = await response.json();
  }
  if (result?.ok && payload.operation === 'set') {
    const { invalidateExerciseSearch } = await import('./kb.js');
    invalidateExerciseSearch();
  }
  return result;
}
