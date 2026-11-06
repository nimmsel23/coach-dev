// Klienten-Workout → Push an den Coach (FCM, Data-Message für firebase-messaging-sw.js).
//
// Reine Funktionen ohne Firebase-Zugriff, damit sie mit `node --test` prüfbar sind.
// Der Trigger (`onClientWorkout` in index.js) liefert Firestore/Auth/Messaging dazu.
//
// Datenschutz: Klientendaten sind Gesundheitsdaten und landen im Sperrbildschirm.
// Die Meldung enthält deshalb nur Name, Trainingsart und Dauer — nie Notizen,
// Gewichte oder Übungsnamen.

// Gleiche Coach-UID wie in firestore.rules (isCoach). Per Env `COACH_UIDS`
// (kommagetrennt) überschreibbar, z.B. für Tests oder einen zweiten Coach.
const { renderTemplate } = require("./texts.js");

const DEFAULT_COACH_UIDS = ["59ole36uNpNwml5H6VDYCXyCME92"];

// Die Coach-Konsole ist eine eigene Hosting-Site (vos-coach, Repo coach-dev).
// Ihr Hash-Router (src/views/Coach/coachRoute.js) versteht #/clients/<uid>/<tab>?date=
const DEFAULT_COACH_URL = "https://vos-coach.web.app";

// Wie beim Desktop-Notifier (backend/sync/notify.py): ältere Sessions sind
// Nachträge/Importe und keine Meldung wert.
const MAX_AGE_DAYS = 3;

function coachUrl(env = process.env) {
  return String(env.COACH_URL || DEFAULT_COACH_URL).replace(/\/+$/, "");
}

function coachUids(env = process.env) {
  const raw = String(env.COACH_UIDS || "").split(",").map((s) => s.trim()).filter(Boolean);
  return raw.length ? raw : DEFAULT_COACH_UIDS;
}

function isPositive(value) {
  return Number(value) > 0;
}

function entryHasSignal(entry) {
  if (!entry || typeof entry !== "object") return false;
  if (entry.done === true) return true;
  if ([entry.sets, entry.reps, entry.weight, entry.rpe, entry.duration, entry.distance].some(isPositive)) return true;
  const setsArray = Array.isArray(entry.setsArray) ? entry.setsArray : [];
  if (setsArray.some((set) => isPositive(set?.reps) || isPositive(set?.weight) || isPositive(set?.rpe))) return true;
  // Slots (Plan-Slots) können Übungen verschachtelt tragen
  const nested = Array.isArray(entry.exercises) ? entry.exercises : [];
  return nested.some(entryHasSignal);
}

// Hat die Session überhaupt Trainingsinhalt? Ein leerer Auto-Save-Rahmen
// (nur date/session_id) soll niemanden anpingen.
function sessionHasSignal(session) {
  if (!session || typeof session !== "object") return false;
  if (isPositive(session.duration) || isPositive(session.effort)) return true;
  const lists = [session.exercises, session.slots, session.activities];
  return lists.some((list) => Array.isArray(list) && list.some(entryHasSignal));
}

function isoDay(value) {
  const text = String(value || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function ageInDays(date, now = new Date()) {
  const day = isoDay(date);
  if (!day) return null;
  const then = Date.parse(`${day}T00:00:00Z`);
  const today = Date.parse(`${now.toISOString().slice(0, 10)}T00:00:00Z`);
  return Math.round((today - then) / 86400000);
}

function isFinished(session) {
  return Boolean(session?.finishedAt || session?.completed === true || session?.status === "completed");
}

// Entscheidet, ob ein Firestore-Write eine Coach-Meldung auslöst.
// Autosave schreibt eine Session oft mehrfach — gemeldet wird nur
//   1. beim ersten Mal, an dem die Session Inhalt hat, und
//   2. wenn sie als abgeschlossen markiert wird.
// Gleicher Tag pro Klient+Session sorgt dafür, dass Folgemeldungen ersetzen statt stapeln.
function shouldNotify({ uid, before, after, coaches = coachUids(), now = new Date() }) {
  if (!after || typeof after !== "object") return { notify: false, reason: "gelöscht" };
  if (coaches.includes(uid)) return { notify: false, reason: "coach-eigene-session" };
  if (after.deleted === true) return { notify: false, reason: "gelöscht" };
  if (!sessionHasSignal(after)) return { notify: false, reason: "kein-inhalt" };

  const age = ageInDays(after.date, now);
  if (age != null && age > MAX_AGE_DAYS) return { notify: false, reason: "zu-alt" };

  const hadSignal = sessionHasSignal(before);
  if (!hadSignal) return { notify: true, reason: "neu" };
  if (isFinished(after) && !isFinished(before)) return { notify: true, reason: "abgeschlossen" };
  return { notify: false, reason: "unverändert" };
}

function clientLabel(name, fallback) {
  const text = String(name || "").trim();
  return text ? text.split(/\s+/)[0] : fallback;
}

// Baut die FCM-Nachricht (nur data-Felder; der SW zeigt die Notification an).
// `texts` = Abschnitt clientWorkout aus notifications.yaml (siehe texts.js).
function buildMessage({ uid, sid, session, clientName, tokens, texts, reason = "neu" }) {
  if (!texts) throw new Error("buildMessage: texts (clientWorkout aus notifications.yaml) fehlt");
  const name = clientLabel(clientName, texts.nameFallback);
  const date = isoDay(session?.date) || "";
  const art = String(session?.trainingsart || "").trim();
  const minutes = Number(session?.duration) > 0
    ? renderTemplate(texts.minutes, { minutes: Math.round(Number(session.duration)) })
    : "";
  const details = [art, minutes].filter(Boolean).join(texts.detailSeparator);
  const finished = reason === "abgeschlossen";
  const title = renderTemplate(finished ? texts.titleFinished : texts.title, { name });
  const body = details
    ? renderTemplate(texts.body, { details, name, date })
    : (date ? renderTemplate(texts.bodyDate, { date }) : texts.bodyFallback);
  const link = `${coachUrl()}/#/clients/${encodeURIComponent(uid)}${date ? `?date=${encodeURIComponent(date)}` : ""}`;

  return {
    data: {
      app: "fitness",
      type: "clientWorkout",
      title,
      body,
      link,
      // Ein Tag pro Klient: der SW fasst mehrere Workouts desselben Klienten zusammen.
      tag: `client-workout-${uid}`,
      clientUid: uid,
      clientName: name,
      sid: String(sid || ""),
      date,
    },
    tokens,
    webpush: {
      headers: { Urgency: "normal", TTL: "86400" },
    },
    android: { priority: "normal" },
  };
}

// Tokens, die FCM als tot meldet — werden aus den Coach-Einstellungen entfernt.
const DEAD_TOKEN_CODES = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
]);

function deadTokens(tokens, responses = []) {
  return tokens.filter((_token, index) => {
    const response = responses[index];
    return response && !response.success && DEAD_TOKEN_CODES.has(response.error?.code);
  });
}

module.exports = {
  DEFAULT_COACH_UIDS,
  MAX_AGE_DAYS,
  buildMessage,
  coachUids,
  coachUrl,
  deadTokens,
  sessionHasSignal,
  shouldNotify,
};
