const functions = require("firebase-functions/v1");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");
const { getAuth } = require("firebase-admin/auth");
const fs = require("fs");
const path = require("path");
const strava = require("./strava.js");
const clientWorkout = require("./clientWorkout.js");
const pushPrefs = require("./pushPrefs.js");
const { coverageScoresFromDashboard } = require("./coverageWindow.js");
const { NOTIFICATIONS, renderTemplate } = require("./texts.js");

initializeApp();

const TIME_ZONE = "Europe/Berlin";
const REMINDER_WINDOW_MINUTES = 5;
const REST_DAY_MIN_THRESHOLD_DAYS = 3;
const REST_DAY_COLD_START_DAYS = 7;
const REST_DAY_HISTORY_LIMIT = 120;
const REST_DAY_OVERDUE_FACTOR = 1.5;
const COVERAGE_GAP_THRESHOLD = 1.0;
const PPL_RATIO_ALERT_THRESHOLD = 0.15;
const REMINDER_TYPES = {
  workout: true,
  activeWorkout: true,
  habit: true,
  coverage: true,
  pplRatio: true,
  restday: true,
  clientWorkout: true,
};

// Kanonische Muscle-Group-IDs für den Coverage-Alert. Bewusst hier
// hardcodiert statt aus der KB gelesen (siehe src/lib/db/shared/muscle.js) —
// die volle KB-Auflösung (setKBMuscles + live /fitness/muscles/viz) in eine
// Cloud Function zu ziehen wäre eine eigene Baustelle. Deckt nur die groben
// Sammelgruppen ab, keine Sub-Muskel-Granularität.
const MUSCLE_GROUP_LABELS = {
  chest: "Brust",
  back: "Rücken",
  shoulders: "Schultern",
  arms: "Arme",
  core: "Rumpf",
  glutes: "Gesäß",
  quadriceps: "Quadrizeps",
  hamstrings: "Beinbeuger",
  calves: "Waden",
};

const PPL_BUCKETS = {
  push: ["chest", "shoulders", "arms"],
  pull: ["back", "arms"],
  legs: ["glutes", "quadriceps", "hamstrings", "calves"],
};

const PPL_BUCKET_LABELS = {
  push: "Push",
  pull: "Pull",
  legs: "Legs",
};

function notificationText(type, vars = {}) {
  const entry = NOTIFICATIONS[type] || {};
  return {
    title: renderTemplate(entry.title, vars),
    body: renderTemplate(entry.body, vars),
    link: entry.link || "/?tab=session",
  };
}

function getLocalDateParts(date = new Date(), timeZone = TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    date: `${byType.year}-${byType.month}-${byType.day}`,
    time: `${byType.hour}:${byType.minute}`,
    minutes: Number(byType.hour) * 60 + Number(byType.minute),
  };
}

function parseReminderMinutes(reminderTime) {
  if (typeof reminderTime !== "string" || !/^\d{2}:\d{2}$/.test(reminderTime)) return null;
  const [hour, minute] = reminderTime.split(":").map(Number);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  return hour * 60 + minute;
}

function isReminderDue(reminderTime, currentMinutes) {
  const targetMinutes = parseReminderMinutes(reminderTime);
  if (targetMinutes == null) return false;
  const delta = currentMinutes - targetMinutes;
  return delta >= 0 && delta < REMINDER_WINDOW_MINUTES;
}

function getEnabledTypes(data = {}) {
  return { ...REMINDER_TYPES, ...(data.types || {}) };
}

// Pausierte Geräte (devices[].paused) ausgenommen — siehe pushPrefs.activeTokens.
function normalizeTokens(data = {}, options) {
  return pushPrefs.activeTokens(data, options);
}

function exerciseHasTrainingSignal(exercise = {}) {
  if (!exercise || typeof exercise !== "object") return false;
  if (exercise.done === true) return true;

  const noteFields = [exercise.notes, exercise.comment, exercise.feedback]
    .filter((value) => typeof value === "string")
    .join(" ")
    .toLowerCase();
  if (/(done|completed|train|trained|workout|session|sent|yes|ja)/.test(noteFields)) return true;

  const numericFields = [exercise.sets, exercise.reps, exercise.weight, exercise.rpe, exercise.duration];
  if (numericFields.some((value) => Number(value) > 0)) return true;

  const setsArray = Array.isArray(exercise.setsArray) ? exercise.setsArray : [];
  return setsArray.some((set) => Number(set?.reps) > 0 || Number(set?.weight) > 0 || Number(set?.rpe) > 0);
}

async function getSessionsForDate(userRef, date) {
  const snap = await userRef.collection("sessions").where("date", "==", date).get();
  return snap.docs.map((doc) => doc.data() || {});
}

async function hasCompletedTrainingToday(userRef, date) {
  const sessions = await getSessionsForDate(userRef, date);
  return sessions.some((session) =>
    Array.isArray(session.exercises) && session.exercises.some((exercise) => exerciseHasTrainingSignal(exercise))
  );
}

function parseIsoMillis(value) {
  if (typeof value !== "string") return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

// remindedFor: gate.startedAt des Workouts, für das schon erinnert wurde. Der Merker
// liegt bewusst im Push-Dokument (apps.fitness.activeWorkoutRemindedFor), nicht in der
// Session: der Client speichert Sessions per setDoc() ohne merge und löschte
// sessionGate.reminderSentAt bei jedem Autosave -> Erinnerung alle 5 Minuten.
async function getActiveWorkoutReminderCandidate(userRef, now = Date.now(), remindedFor = null) {
  const snap = await userRef.collection("sessions").orderBy("date", "desc").limit(20).get();
  let candidate = null;

  for (const doc of snap.docs) {
    const data = doc.data() || {};
    const gate = data.sessionGate || {};
    const startedAtMs = parseIsoMillis(gate.startedAt);
    if (!startedAtMs) continue;
    if (gate.endedAt) continue;
    if (gate.reminderSentAt) continue;
    if (remindedFor && remindedFor === gate.startedAt) continue;
    const elapsedMs = now - startedAtMs;
    if (elapsedMs < 60 * 60 * 1000) continue;
    if (!candidate || startedAtMs > candidate.startedAtMs) {
      candidate = { ref: doc.ref, data, startedAtMs, elapsedMs, startedAt: gate.startedAt };
    }
  }

  return candidate;
}

async function getDaysSinceLastCompletedTraining(userRef, todayDate) {
  const snap = await userRef.collection("sessions").orderBy("date", "desc").limit(REST_DAY_HISTORY_LIMIT).get();
  const today = new Date(`${todayDate}T12:00:00`);
  const trainingDates = new Set();
  for (const doc of snap.docs) {
    const session = doc.data() || {};
    const date = session.date;
    if (!date) continue;
    const exercises = Array.isArray(session.exercises) ? session.exercises : [];
    if (!exercises.some((exercise) => exerciseHasTrainingSignal(exercise))) continue;
    if (date < todayDate) trainingDates.add(date);
  }
  const dates = Array.from(trainingDates).sort((a, b) => b.localeCompare(a));
  if (dates.length === 0) return null;

  const last = new Date(`${dates[0]}T12:00:00`);
  const daysSince = Math.floor((today - last) / 86400000);
  const intervals = [];
  for (let i = 0; i < dates.length - 1; i += 1) {
    const newer = new Date(`${dates[i]}T12:00:00`);
    const older = new Date(`${dates[i + 1]}T12:00:00`);
    intervals.push(Math.floor((newer - older) / 86400000));
  }
  const averageRestDays = intervals.length
    ? intervals.reduce((sum, days) => sum + days, 0) / intervals.length
    : REST_DAY_COLD_START_DAYS;
  const thresholdDays = Math.max(
    REST_DAY_MIN_THRESHOLD_DAYS,
    Math.ceil(averageRestDays * REST_DAY_OVERDUE_FACTOR),
  );
  return { daysSince, lastSessionDate: dates[0], thresholdDays };
}

function getCoverageGaps(scores = {}, threshold = COVERAGE_GAP_THRESHOLD) {
  return Object.keys(MUSCLE_GROUP_LABELS).filter((id) => Number(scores[id] || 0) < threshold);
}

function sumScores(scores = {}, keys = []) {
  return keys.reduce((sum, key) => sum + Math.max(0, Number(scores[key] || 0)), 0);
}

function getLowPplBuckets(scores = {}, threshold = PPL_RATIO_ALERT_THRESHOLD) {
  const totals = {
    push: sumScores(scores, PPL_BUCKETS.push),
    pull: sumScores(scores, PPL_BUCKETS.pull),
    legs: sumScores(scores, PPL_BUCKETS.legs),
  };
  const overall = totals.push + totals.pull + totals.legs;
  if (overall <= 0) return [];

  return Object.entries(totals)
    .map(([bucket, total]) => ({ bucket, ratio: total / overall }))
    .filter(({ ratio }) => ratio < threshold)
    .sort((a, b) => a.ratio - b.ratio)
    .map(({ bucket, ratio }) => ({
      bucket,
      label: PPL_BUCKET_LABELS[bucket] || bucket,
      percent: Math.round(ratio * 100),
    }));
}

// 7-Tage-Coverage bezogen auf HEUTE (nicht auf den Zeitpunkt des letzten
// Speicherns). `null` = nichts Verlässliches bekannt → kein Hinweis senden.
async function getCoverageScores(userRef, todayDate) {
  const snap = await userRef.collection("analytics").doc("dashboard").get();
  if (!snap.exists) return null;
  return coverageScoresFromDashboard(snap.data() || {}, todayDate, { days: 7, timeZone: TIME_ZONE });
}

async function getOpenHabitsToday(userRef, date) {
  const [habitsSnap, recordsSnap] = await Promise.all([
    userRef.collection("habits").get(),
    userRef.collection("habitRecords").where("date", "==", date).where("completion", "==", "DONE").get(),
  ]);
  const doneIds = new Set(recordsSnap.docs.map((doc) => doc.data().habitId));
  return habitsSnap.docs
    .map((doc) => ({ uuid: doc.id, ...doc.data() }))
    .filter((habit) => !habit.deleted && !doneIds.has(habit.uuid));
}

async function sendReminder(uid, tokens, title, body, link, tag = "fitness-reminder") {
  if (!tokens || tokens.length === 0) return { sentCount: 0, failureCount: 0 };

  try {
    const message = {
      data: {
        app: "fitness",
        title,
        body,
        link: link || "/?tab=session",
        tag,
      },
      tokens,
    };
    const response = await getMessaging().sendEachForMulticast(message);
    // Abgemeldete Geräte (z. B. alte SW-Registrierungen) aufräumen, sonst wächst die Token-Liste
    // und jedes Gerät mit Altlast liefert dieselbe Meldung mehrfach.
    const dead = clientWorkout.deadTokens(tokens, response.responses);
    if (dead.length > 0) {
      try {
        const pushRef = getFirestore().collection("fitness").doc(uid).collection("settings").doc("push");
        const cleanup = { apps: { fitness: { tokens: FieldValue.arrayRemove(...dead) } } };
        const stored = (await pushRef.get()).data() || {};
        // normalizeTokens() zählt auch das Einzelfeld "token" mit — sonst würde ein toter Token dort weiter angeschrieben.
        if (dead.includes(stored.apps?.fitness?.token)) cleanup.apps.fitness.token = FieldValue.delete();
        await pushRef.set(cleanup, { merge: true });
      } catch (cleanupError) {
        console.error(`Token-Cleanup für ${uid} fehlgeschlagen:`, cleanupError);
      }
    }
    return {
      sentCount: response.successCount,
      failureCount: response.failureCount,
    };
  } catch (error) {
    console.error(`Error sending reminders to ${uid}:`, error);
    return { sentCount: 0, failureCount: tokens.length, error: error.message };
  }
}

exports.scheduledFitnessPushReminders = onSchedule(
  { schedule: "every 5 minutes", timeZone: TIME_ZONE, region: "europe-west1" },
  async () => {
    const { date, minutes } = getLocalDateParts();
    const db = getFirestore();
    let sentCount = 0;
    let failureCount = 0;

    try {
      // Direkter Scan über fitness/{uid} statt collectionGroup("push") — "push"
      // ist im Datenmodell eine Dokument-ID unter settings/, keine eigene
      // Collection, ein collectionGroup-Query fand hier nie etwas (Bug, siehe
      // functions/notifications.yaml-Nachbarcommit).
      const userRefs = await db.collection("fitness").listDocuments();

      for (const userRef of userRefs) {
        const uid = userRef.id;
        const pushSnap = await userRef.collection("settings").doc("push").get();
        if (!pushSnap.exists) continue;

        const stored = pushSnap.data() || {};
        const data = stored.apps?.fitness || {};
        if (!data.enabled) continue;

        const tokens = normalizeTokens(data);
        if (tokens.length === 0) continue;

        const types = getEnabledTypes(data);
        const notifications = [];
        let coverageScores = null;

        if (types.activeWorkout) {
          const candidate = await getActiveWorkoutReminderCandidate(userRef, Date.now(), data.activeWorkoutRemindedFor || null);
          if (candidate) {
            const elapsedMinutes = Math.max(60, Math.round(candidate.elapsedMs / 60000));
            notifications.push({
              ...notificationText("activeWorkout", { minutes: elapsedMinutes }),
              _sessionRef: candidate.ref,
              _gateStartedAt: candidate.startedAt,
            });
          }
        }

        if (!isReminderDue(data.reminderTime, minutes) && notifications.length === 0) continue;

        if (types.restday) {
          const restday = await getDaysSinceLastCompletedTraining(userRef, date);
          const alreadyNotified = data.restdayLastNotifiedSessionDate === restday?.lastSessionDate;
          if (restday && !alreadyNotified && restday.daysSince >= restday.thresholdDays) {
            notifications.push({
              ...notificationText("restday", { days: restday.daysSince }),
              _restdaySessionDate: restday.lastSessionDate,
            });
          }
        }

        // Workout-Reminder nur wenn Rest-Day-Check nicht schon gefeuert hat —
        // sonst bekommt der User bei "lange nicht trainiert" zwei sich
        // überschneidende Pushes zur selben Minute.
        if (types.workout && notifications.length === 0) {
          const trained = await hasCompletedTrainingToday(userRef, date);
          if (!trained) notifications.push(notificationText("workout"));
        }

        if (types.coverage) {
          coverageScores = coverageScores || await getCoverageScores(userRef, date);
          const gaps = coverageScores ? getCoverageGaps(coverageScores) : [];
          if (gaps.length > 0) {
            const regions = gaps.map((id) => MUSCLE_GROUP_LABELS[id] || id).join(", ");
            notifications.push(notificationText("coverage", { regions }));
          }
        }

        if (types.pplRatio) {
          coverageScores = coverageScores || await getCoverageScores(userRef, date);
          const lowBuckets = coverageScores ? getLowPplBuckets(coverageScores) : [];
          if (lowBuckets.length > 0) {
            const buckets = lowBuckets.map(({ label, percent }) => `${label} ${percent}%`).join(", ");
            notifications.push(notificationText("pplRatio", { buckets }));
          }
        }

        if (types.habit) {
          const openHabits = await getOpenHabitsToday(userRef, date);
          if (openHabits.length > 0) {
            const names = openHabits.map((h) => h.name).filter(Boolean).slice(0, 3).join(", ");
            notifications.push(notificationText("habit", { names: names || `${openHabits.length} Habit(s)` }));
          }
        }

        // Aktiv-Workout-Hinweis bleibt eigener Push (zeitkritisch, eigener Tag);
        // alle übrigen Reminder desselben Laufs gehen als EIN Digest raus —
        // vorher kamen pro Lauf bis zu vier Pushes gleichzeitig (Workout/Restday,
        // Coverage, PPL, Habit), und der SW hat sie ungetaggt gestapelt.
        const active = notifications.filter((n) => n._sessionRef);
        const digest = notifications.filter((n) => !n._sessionRef);

        for (const notification of active) {
          const result = await sendReminder(uid, tokens, notification.title, notification.body, notification.link, "fitness-active-workout");
          sentCount += result.sentCount || 0;
          failureCount += result.failureCount || 0;
          if ((result.sentCount || 0) > 0) {
            await pushSnap.ref.set({
              apps: { fitness: { activeWorkoutRemindedFor: notification._gateStartedAt } },
            }, { merge: true });
          }
        }

        if (digest.length > 0) {
          const [primary, ...rest] = digest;
          const body = [primary.body, ...rest.map((n) => `${n.title}: ${n.body}`)].join("\n");
          const result = await sendReminder(uid, tokens, primary.title, body, primary.link);
          sentCount += result.sentCount || 0;
          failureCount += result.failureCount || 0;
          const restday = digest.find((notification) => notification._restdaySessionDate);
          if (restday && (result.sentCount || 0) > 0) {
            await pushSnap.ref.set({
              apps: { fitness: { restdayLastNotifiedSessionDate: restday._restdaySessionDate } },
            }, { merge: true });
          }
        }
      }

      console.log(`Push reminders: ${sentCount} sent, ${failureCount} failed`);
      return { sentCount, failureCount };
    } catch (error) {
      console.error("Error in scheduledPushReminders:", error);
      return { error: error.message };
    }
  }
);

exports.onCoachFeedback = functions
  .region("europe-west1")
  .firestore.document("fitness/{uid}/sessions/{sid}")
  .onWrite(async (change, context) => {
    const { uid } = context.params;
    const newData = change.after.data() || {};
    const oldData = change.before.data() || {};

    if (!newData.coachFeedback || newData.coachFeedback === oldData.coachFeedback) {
      return null;
    }

    const db = getFirestore();
    const pushDoc = await db.collection("fitness").doc(uid).collection("settings").doc("push").get();
    const stored = pushDoc.data() || {};
    const pushData = stored.apps?.fitness || {};

    if (!pushData.enabled) return null;

    const tokens = normalizeTokens(pushData);
    if (tokens.length === 0) return null;

    const text = notificationText("coachFeedback");
    return sendReminder(uid, tokens, text.title, newData.coachFeedback.substring(0, 100), text.link);
  });

// ── Klienten-Workout → Push an den Coach ─────────────────────────────────
// Ein Klient speichert eine Session (fitness/{uid}/sessions/{sid}) → alle
// Coach-Geräte mit aktivem Push bekommen eine Data-Message, die
// firebase-messaging-sw.js anzeigt (Buttons, Gruppierung pro Klient).
// Entscheidungslogik + Nachrichtenaufbau: clientWorkout.js (mit Tests).
async function clientDisplayName(uid) {
  try {
    const user = await getAuth().getUser(uid);
    if (user.displayName) return user.displayName;
  } catch (error) {
    console.warn(`clientDisplayName(${uid}):`, error.code || error.message);
  }
  return "";
}

exports.onClientWorkout = functions
  .region("europe-west1")
  .firestore.document("fitness/{uid}/sessions/{sid}")
  .onWrite(async (change, context) => {
    const { uid, sid } = context.params;
    const before = change.before.exists ? change.before.data() : null;
    const after = change.after.exists ? change.after.data() : null;

    const decision = clientWorkout.shouldNotify({ uid, before, after });
    if (!decision.notify) return null;

    const db = getFirestore();
    const clientName = await clientDisplayName(uid);
    const results = [];

    for (const coachUid of clientWorkout.coachUids()) {
      const pushRef = db.collection("fitness").doc(coachUid).collection("settings").doc("push");
      const stored = (await pushRef.get()).data() || {};
      const pushData = stored.apps?.fitness || {};
      // Schalter aus dem Notification-Panel (Setup-Tab): Typ, Klient stumm, Modus, Ruhezeit
      const verdict = pushPrefs.allowsClientWorkout(pushData, uid, decision.reason);
      if (!verdict.allow) {
        results.push({ coachUid, skipped: verdict.why });
        continue;
      }

      const tokens = normalizeTokens(pushData);
      if (tokens.length === 0) continue;

      try {
        const message = clientWorkout.buildMessage({
          uid, sid, session: after, clientName, tokens, reason: decision.reason, texts: NOTIFICATIONS.clientWorkout,
        });
        const response = await getMessaging().sendEachForMulticast(message);
        const dead = clientWorkout.deadTokens(tokens, response.responses);
        if (dead.length > 0) {
          // Abgemeldete Geräte aufräumen, sonst wächst die Token-Liste ewig.
          const cleanup = { apps: { fitness: { tokens: FieldValue.arrayRemove(...dead) } } };
          if (dead.includes(pushData.token)) cleanup.apps.fitness.token = FieldValue.delete();
          await pushRef.set(cleanup, { merge: true });
        }
        results.push({ coachUid, sent: response.successCount, failed: response.failureCount, removed: dead.length });
      } catch (error) {
        console.error(`onClientWorkout: Push an Coach ${coachUid} fehlgeschlagen:`, error);
        results.push({ coachUid, error: error.message });
      }
    }
    return { uid, sid, reason: decision.reason, results };
  });

// ── Strava-Live-Import (Radtouren-Tab, Prod/Firebase-PWA) ──────────────────
// Logik in strava.js — dev-Pendant ist server.mjs/strava-routes.mjs
// (Node-Backend, nur lokal erreichbar). Setup: docs/STRAVA_SETUP.md.
function requireAuth(context) {
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Login erforderlich.");
  return context.auth.uid;
}

// Test-Push aus dem Notification-Panel: schickt an die eigenen Geräte (alle oder eines).
exports.sendTestPush = functions
  .region("europe-west1")
  .https.onCall(async (data, context) => {
    const uid = requireAuth(context);
    const kind = pushPrefs.TEST_KINDS.includes(data?.kind) ? data.kind : "reminder";
    const pushRef = getFirestore().collection("fitness").doc(uid).collection("settings").doc("push");
    const stored = (await pushRef.get()).data() || {};
    const pushData = stored.apps?.fitness || {};

    const wait = pushPrefs.testCooldownLeft(pushData.lastTestAt?.toMillis?.());
    if (wait > 0) {
      throw new functions.https.HttpsError("resource-exhausted", `Bitte ${Math.ceil(wait / 1000)} s warten.`);
    }
    // "clientWorkout" nur für den Coach (sonst würde ein Klient eine Coach-Demo sehen)
    if (kind === "clientWorkout" && !clientWorkout.coachUids().includes(uid)) {
      throw new functions.https.HttpsError("permission-denied", "Nur für den Coach.");
    }

    // Gezielter Test an ein Gerät funktioniert auch, wenn es pausiert ist.
    const all = normalizeTokens(pushData, { includePaused: Boolean(data?.token) });
    const tokens = data?.token ? all.filter((t) => t === data.token) : all;
    if (tokens.length === 0) {
      throw new functions.https.HttpsError("failed-precondition", "Kein registriertes Gerät.");
    }

    await pushRef.set({ apps: { fitness: { lastTestAt: FieldValue.serverTimestamp() } } }, { merge: true });
    const response = await getMessaging().sendEachForMulticast(pushPrefs.buildTestMessage(kind, tokens, NOTIFICATIONS));
    const dead = clientWorkout.deadTokens(tokens, response.responses);
    if (dead.length > 0) {
      const cleanup = { apps: { fitness: { tokens: FieldValue.arrayRemove(...dead) } } };
      if (dead.includes(pushData.token)) cleanup.apps.fitness.token = FieldValue.delete();
      if (Array.isArray(pushData.devices)) {
        cleanup.apps.fitness.devices = pushData.devices.filter((d) => !dead.includes(d.token));
      }
      await pushRef.set(cleanup, { merge: true });
    }
    return { sent: response.successCount, failed: response.failureCount, removed: dead.length };
  });


exports.stravaAuthorizeUrl = functions
  .region(strava.REGION)
  .https.onCall(async (_data, context) => {
    const uid = requireAuth(context);
    const url = await strava.buildAuthorizeUrl(getFirestore(), uid);
    return { url };
  });

exports.stravaCallback = functions
  .region(strava.REGION)
  .https.onRequest(async (req, res) => {
    const { code, state, error } = req.query;
    if (error) return res.redirect(`${strava.APP_URL}/#tours?strava_error=${encodeURIComponent(String(error))}`);
    if (!code || !state) return res.status(400).send("Strava: code/state fehlt im Callback.");
    try {
      await strava.exchangeCodeForTokens(getFirestore(), { code: String(code), state: String(state) });
      return res.redirect(`${strava.APP_URL}/#tours?strava_connected=1`);
    } catch (err) {
      console.error("[stravaCallback]", err);
      return res.redirect(`${strava.APP_URL}/#tours?strava_error=${encodeURIComponent(err.message)}`);
    }
  });

exports.stravaStatus = functions
  .region(strava.REGION)
  .https.onCall(async (_data, context) => {
    const uid = requireAuth(context);
    return strava.status(getFirestore(), uid);
  });

exports.stravaActivities = functions
  .region(strava.REGION)
  .https.onCall(async (data, context) => {
    const uid = requireAuth(context);
    const tours = await strava.fetchActivities(getFirestore(), uid, { perPage: data?.perPage || 30 });
    return { tours };
  });

exports.stravaDisconnect = functions
  .region(strava.REGION)
  .https.onCall(async (_data, context) => {
    const uid = requireAuth(context);
    await strava.disconnect(getFirestore(), uid);
    return { ok: true };
  });
