/**
 * Firestore Mirror — fire-and-forget dual-write für server.mjs
 *
 * Schreibt Session, Journal und Plan nach Firestore ohne den lokalen
 * Node-Server zu blockieren. Wenn Firebase nicht konfiguriert ist → still skip.
 *
 * Config: ~/.env/firebase-fitness.json (Service Account)
 * Oder: GOOGLE_APPLICATION_CREDENTIALS + FIREBASE_FITNESS_PROJECT env vars
 */

import { createRequire } from "node:module";
import fs, { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { renderMd as journalRenderMd } from "./journal-store.mjs";

const SESSIONS_ROOT = join(homedir(), ".aos", "fitness", "users");

const CRED_PATH = join(homedir(), ".env", "firebase-fitness.json");
const PROJECT   = process.env.FIREBASE_FITNESS_PROJECT || "fitness-aos";

let _db = null;
let _unavailable = false;

async function getDb() {
  if (_db) return _db;
  if (_unavailable) return null;

  const credFile = process.env.GOOGLE_APPLICATION_CREDENTIALS || CRED_PATH;
  if (!existsSync(credFile)) {
    _unavailable = true;
    return null;
  }

  try {
    const require = createRequire(import.meta.url);
    const admin = require("firebase-admin");
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(credFile),
        projectId: PROJECT,
      });
    }
    _db = admin.firestore();
    console.log(`[firestore-mirror] aktiv → ${PROJECT}`);
    return _db;
  } catch (e) {
    console.warn(`[firestore-mirror] nicht verfügbar: ${e.message}`);
    _unavailable = true;
    return null;
  }
}

// Retry-Markierung statt stillem Schlucken: bei Fehlschlag landet der
// Datensatz in einer Pending-Datei, die der bestehende /firestore/sync-
// Endpoint (letzte 30 Sessions) beim nächsten Aufruf mit abarbeiten kann —
// kein neuer Scheduler, nur ein sichtbarer statt unsichtbarer Fehlerzustand.
function pendingRetryFile(uid) {
  return join(SESSIONS_ROOT, uid, ".pending-firestore-retries.json");
}

function appendPendingRetry(uid, entry) {
  const file = pendingRetryFile(uid);
  let list = [];
  try { list = JSON.parse(fs.readFileSync(file, "utf8")); } catch {}
  list.push({ ...entry, failedAt: new Date().toISOString() });
  try {
    fs.mkdirSync(join(SESSIONS_ROOT, uid), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(list.slice(-50), null, 2));
  } catch (e) {
    console.warn(`[firestore-mirror] Retry-Markierung fehlgeschlagen: ${e.message}`);
  }
}

function fire(fn, retryMeta = null) {
  fn().catch((e) => {
    console.warn(`[firestore-mirror] write fehler: ${e.message}`);
    if (retryMeta) appendPendingRetry(retryMeta.uid, retryMeta);
  });
}

export async function getFirestoreStatus() {
  const db = await getDb();
  return { ok: db !== null, project: db !== null ? PROJECT : null };
}

export async function mirrorSession(date, session, uid = "default") {
  const db = await getDb();
  if (!db) return;
  const targetId = session.session_id ? `${date}__${session.session_id}` : date;
  fire(
    () =>
      db.collection("fitness").doc(uid).collection("sessions").doc(targetId).set({
        ...session,
        date,
        // saved_at NICHT hier überschreiben: session.saved_at kommt bereits
        // aus freezeSnapshot() (echte Editierzeit, rev-synchron). Ein
        // erzwungenes "jetzt" bei jedem Push — auch bei reinen Resyncs ohne
        // inhaltliche Änderung (z.B. POST /firestore/sync) — täuschte dem
        // rev-Gleichstand-Tie-Break in mirror.py::on_session() eine neuere
        // Remote-Version vor, die dann zurückgepullt wurde und die lokale
        // Datei unnötig überschrieb (live reproduziert + Ursache der
        // historischen Massen-saved_at-Neuschreibung vom 2026-08-06).
      }),
    { kind: "session", uid, date, sessionId: session.session_id || null }
  );
}

export async function mirrorSessionDelete(date, uid = "default", sessionId = null) {
  const db = await getDb();
  if (!db) return;
  const targetId = sessionId ? `${date}__${sessionId}` : date;
  fire(() => db.collection("fitness").doc(uid).collection("sessions").doc(targetId).delete());
}

let _userDataWatchersStarted = false;

/**
 * Eingebetteter Realtime-Sync (Cloud → lokal) für Sessions — ersetzt den
 * separaten fitness-firestore-daemon.service/fitness-firestore-mirror.service
 * (Python, oneshot bzw. eigener Prozess). Läuft im selben Node-Prozess wie
 * server.mjs, kein externer Daemon mehr nötig. Deckt insbesondere Löschungen
 * ab (Firestore-Doc gelöscht → docChanges() liefert type "removed"), was der
 * alte oneshot-Pull nie konnte (der hat nur geschrieben, nie lokal gelöscht).
 */
export async function startUserDataWatchers({ onSessionWrite, onSessionDelete } = {}) {
  if (_userDataWatchersStarted) return;
  const db = await getDb();
  if (!db) return;
  _userDataWatchersStarted = true;

  let uids;
  try {
    uids = fs.readdirSync(SESSIONS_ROOT).filter(d => {
      try { return fs.statSync(join(SESSIONS_ROOT, d)).isDirectory(); } catch { return false; }
    });
  } catch {
    uids = ["default"];
  }
  if (!uids.length) uids = ["default"];

  for (const uid of uids) {
    const sessDir = join(SESSIONS_ROOT, uid, "sessions");
    db.collection("fitness").doc(uid).collection("sessions").onSnapshot(
      snap => {
        for (const change of snap.docChanges()) {
          const docId = change.doc.id; // "YYYY-MM-DD" oder "YYYY-MM-DD__<sessionId>"
          const date = docId.split("__")[0];
          if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
          const file = join(sessDir, `${docId}.json`);

          if (change.type === "removed") {
            if (existsSync(file)) {
              try { fs.unlinkSync(file); } catch (e) { console.warn(`[firestore-mirror] delete lokal fehler ${file}: ${e.message}`); }
            }
            onSessionDelete?.(uid, docId);
            continue;
          }

          const data = change.doc.data();
          let local = null;
          try { local = JSON.parse(fs.readFileSync(file, "utf8")); } catch {}
          const cloudTs = data.saved_at || "";
          const localTs = local?.saved_at || "";
          // Push (mirrorSession) ist fire-and-forget lokal→Cloud — ohne diesen
          // Vergleich würde jeder eigene lokale Save sofort als "Cloud-Änderung"
          // zurückkommen und einen sinnlosen Round-Trip auslösen.
          if (local && localTs && cloudTs && localTs >= cloudTs) continue;

          try {
            fs.mkdirSync(sessDir, { recursive: true });
            fs.writeFileSync(file, JSON.stringify(data, null, 2));
            onSessionWrite?.(date, data);
          } catch (e) {
            console.warn(`[firestore-mirror] write lokal fehler ${file}: ${e.message}`);
          }
        }
      },
      err => console.warn(`[firestore-mirror] Listener-Fehler (${uid}): ${err.message}`)
    );
  }
  console.log(`[firestore-mirror] User-Data-Watcher aktiv für ${uids.length} uid(s): ${uids.join(", ")}`);
}

export async function mirrorJournal(date, entry, uid = "default") {
  const db = await getDb();
  if (!db) return;
  fire(() =>
    db.collection("fitness").doc(uid).collection("journal").add({
      ...entry,
      date,
      time: new Date().toISOString(),
    })
  );
}

// ── Read Layer (Firestore → direkt, kein lokaler Sync nötig) ─────────────────

export async function readJournal(uid, date) {
  const db = await getDb();
  if (!db) return null;
  try {
    const snap = await db.collection("fitness").doc(uid).collection("journal")
      .where("date", "==", date).limit(10).get();
    if (snap.empty) return null;
    // Gleiche Render-Regel wie die .md-Derivate (journal-store.mjs::renderMd)
    const entries = snap.docs.map(d => {
      const { text, time } = d.data();
      return { id: d.id, source: "journal", ts: (time || ""),
               body: `**${(time || "").slice(0, 16)}** ${text || ""}` };
    });
    return journalRenderMd(entries);
  } catch { return null; }
}

export async function listJournals(uid, limitCount = 50) {
  const db = await getDb();
  if (!db) return null;
  try {
    const [journalSnap, habitSnap] = await Promise.all([
      db.collection("fitness").doc(uid).collection("journal")
        .orderBy("date", "desc").limit(limitCount).get(),
      db.collection("fitness").doc(uid).collection("habitJournals")
        .orderBy("date", "desc").limit(limitCount).get(),
    ]);
    const seen = new Map();
    for (const d of [...journalSnap.docs, ...habitSnap.docs]) {
      const date = d.data().date;
      if (date && !seen.has(date)) seen.set(date, d.data().time || date);
    }
    return [...seen.entries()]
      .sort((a, b) => b[0].localeCompare(a[0])).slice(0, limitCount)
      .map(([date, mtime]) => ({ date, mtime }));
  } catch { return null; }
}

export async function readJournalFull(uid, date) {
  const db = await getDb();
  if (!db) return null;
  try {
    const [jSnap, hjSnap, hrSnap] = await Promise.all([
      db.collection("fitness").doc(uid).collection("journal")
        .where("date", "==", date).get(),
      db.collection("fitness").doc(uid).collection("habitJournals")
        .where("date", "==", date).get(),
      db.collection("fitness").doc(uid).collection("habitRecords")
        .where("date", "==", date).get(),
    ]);
    // Habit-Namen laden
    const habitIds = new Set([
      ...hjSnap.docs.map(d => d.data().habitId),
      ...hrSnap.docs.map(d => d.data().habitId),
    ]);
    const habitNames = {};
    await Promise.all([...habitIds].map(async hid => {
      const h = await db.collection("fitness").doc(uid).collection("habits").doc(hid).get();
      if (h.exists) habitNames[hid] = h.data().name || hid;
    }));

    // Entry-Objekte + gemeinsame Render-Regel (journal-store.mjs::renderMd),
    // damit dieser Firestore-Read dieselbe .md-Form wie das Datei-Derivat liefert.
    const entries = [];
    for (const d of jSnap.docs) {
      const { text, time } = d.data();
      if (text) entries.push({ id: d.id, source: "journal", ts: (time || ""),
                               body: `**${(time || "").slice(0, 16)}** ${text}` });
    }
    for (const d of hjSnap.docs) {
      const { text, habitId, coachFeedback, recorded_at, updated_at } = d.data();
      const name = habitNames[habitId] || habitId;
      let body = `**Habit: ${name}**\n${text || ""}`;
      if (coachFeedback) body += `\n> **Coach Feedback:** ${coachFeedback}`;
      const t = recorded_at || updated_at;
      const ts = t?.toDate ? t.toDate().toISOString().slice(0, 16) : (typeof t === "string" ? t.slice(0, 16) : "");
      entries.push({ id: d.id, source: "habit_journals", ts, body });
    }
    for (const d of hrSnap.docs) {
      const { habitId, completion, recorded_at } = d.data();
      const name = habitNames[habitId] || habitId;
      const time = recorded_at?.toDate ? recorded_at.toDate().toISOString().slice(0, 16)
                 : (typeof recorded_at === "string" ? recorded_at.slice(0, 16) : "");
      entries.push({ id: d.id, source: "habit_records", ts: time,
                     body: `**${name}** ${completion || "DONE"} _${time}_` });
    }
    return entries.length ? journalRenderMd(entries) : null;
  } catch { return null; }
}

export async function readSessions(uid, limitCount = 50) {
  const db = await getDb();
  if (!db) return null;
  try {
    const snap = await db.collection("fitness").doc(uid).collection("sessions")
      .orderBy("date", "desc").limit(limitCount).get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch { return null; }
}

/**
 * Pull ALL sessions for uid from Firestore — keine Limit-Heuristik, da
 * Sessions selten und Dokumente klein sind. Liefert rohes Array.
 * Konsumenten entscheiden Konflikt-Strategie (saved_at-Vergleich).
 */
export async function pullAllSessions(uid = "default") {
  const db = await getDb();
  if (!db) return null;
  try {
    const snap = await db.collection("fitness").doc(uid).collection("sessions").get();
    return snap.docs.map(d => {
      const data = d.data();
      // doc-id ist entweder "YYYY-MM-DD" oder "YYYY-MM-DD__<session_id>"
      const docDate = (data.date) || d.id.split("__")[0];
      return { docId: d.id, date: docDate, data };
    });
  } catch (e) {
    console.warn(`[firestore-mirror] pullAllSessions fehler: ${e.message}`);
    return null;
  }
}

export async function pullJournalTree(uid = "default") {
  const db = await getDb();
  if (!db) return null;
  try {
    const userRef = db.collection("fitness").doc(uid);
    const [journalSnap, habitJournalSnap, habitRecordSnap, habitsSnap] = await Promise.all([
      userRef.collection("journal").get(),
      userRef.collection("habitJournals").get(),
      userRef.collection("habitRecords").get(),
      userRef.collection("habits").get(),
    ]);

    const habitNames = new Map();
    for (const doc of habitsSnap.docs) {
      habitNames.set(doc.id, doc.data()?.name || doc.id);
    }

    return {
      journal: journalSnap.docs.map((d) => ({ id: d.id, data: d.data() || {} })),
      habitJournals: habitJournalSnap.docs.map((d) => ({ id: d.id, data: d.data() || {} })),
      habitRecords: habitRecordSnap.docs.map((d) => ({ id: d.id, data: d.data() || {} })),
      habitNames: Object.fromEntries(habitNames),
    };
  } catch (e) {
    console.warn(`[firestore-mirror] pullJournalTree fehler: ${e.message}`);
    return null;
  }
}

export async function readSession(uid, date) {
  const db = await getDb();
  if (!db) return null;
  try {
    const snap = await db.collection("fitness").doc(uid).collection("sessions")
      .where("date", "==", date).limit(5).get();
    if (snap.empty) return null;
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch { return null; }
}

export async function mirrorPlan(plan, uid = "default") {
  const db = await getDb();
  if (!db) return;
  fire(() =>
    db.collection("fitness").doc(uid).collection("plan").doc("active").set({
      ...plan,
      updated_at: new Date().toISOString(),
    })
  );
}
