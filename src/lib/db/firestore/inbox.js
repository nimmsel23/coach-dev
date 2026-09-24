/**
 * firestore/inbox.js — Coach-Inbox CRUD (Übungsanfragen/Review) für Firestore.
 */

import {
  collection, doc, addDoc, getDoc, getDocs, deleteDoc, updateDoc,
  query, orderBy, serverTimestamp, collectionGroup,
} from "firebase/firestore";

import { db } from "../../../firebase.js";
import { getUid, LOCAL_FITNESS_API_BASE } from "./core.js";
import { normalizeExerciseRecord } from "../shared/exercise.js";

const FIREBASE_COACH = import.meta.env.MODE === "coach";

async function coachCommand(action, itemId, uid = null, payload = {}) {
  const ref = await addDoc(collection(db, "coachCommands"), {
    action, item_id: itemId, uid, payload,
    requested_by: getUid(), status: "queued", created_at: serverTimestamp(),
  });
  const deadline = Date.now() + 190000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const snap = await getDoc(ref);
    const data = snap.data();
    if (data?.status === "done") return data.result;
    if (data?.status === "error") throw new Error(data.error || "coach_command_failed");
  }
  throw new Error("coach_command_timeout");
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

export async function getGlobalInbox() {
  if (FIREBASE_COACH) {
    const snap = await getDocs(collection(db, "coachInbox"));
    return snap.docs.map((entry) => ({ ...entry.data(), file_id: entry.id }));
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
