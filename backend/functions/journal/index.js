const functions = require("firebase-functions/v1");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");

initializeApp();

// ── Google (Tasks + Calendar) dauerhaft verbinden ──
// Einrichtung: JOURNAL-V2.md, Abschnitt „Google dauerhaft verbinden“. Secret/Parameter:
//   firebase functions:secrets:set GOOGLE_OAUTH_CLIENT_SECRET   ·   GOOGLE_OAUTH_CLIENT_ID (beim Deploy abgefragt)
const { defineSecret, defineString } = require("firebase-functions/params");
const { createGoogleHandlers, assertExpectedGoogleUid } = require("./google");
const { buildDoorReminder, fetchDueTasks } = require("./door-reminders");
const GOOGLE_CLIENT_SECRET = defineSecret("GOOGLE_OAUTH_CLIENT_SECRET");
const GOOGLE_CLIENT_ID = defineString("GOOGLE_OAUTH_CLIENT_ID", { default: "" });
const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");

exports.getSmartLogQuota = functions.region("europe-west1").https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "login-required");
  const smartLog = require("./smart-log");
  smartLog.assertExpectedUid(context.auth.uid, data?.expected_uid);
  return smartLog.getQuotaStatus({ db: getFirestore(), uid: context.auth.uid });
});

// Fail-closed error mapping for analyzeSmartLog: every non-HttpsError leaves
// the callable with a defined HttpsError code and a message that carries the
// underlying cause (provider HTTP status, rejected provider answer, timeout)
// instead of a bare 500 "smart_log_failed" with empty details.
function smartLogFailure(error) {
  const message = String(error?.message || error || "unknown");
  const httpStatus = /^provider_http_(\d{3})$/.exec(message);
  if (httpStatus) {
    const status = Number(httpStatus[1]);
    if (status === 429) return ["resource-exhausted", `smart_log_provider_rate_limited (Gemini HTTP ${status})`];
    if (status === 408 || status === 504) return ["deadline-exceeded", `smart_log_provider_timeout (Gemini HTTP ${status})`];
    if (status >= 500) return ["unavailable", `smart_log_provider_unavailable (Gemini HTTP ${status})`];
    return ["internal", `smart_log_provider_rejected (Gemini HTTP ${status})`];
  }
  if (error?.name === "AbortError" || error?.name === "TimeoutError") {
    return ["deadline-exceeded", "smart_log_provider_timeout"];
  }
  if (error instanceof SyntaxError) {
    return ["internal", "smart_log_invalid_result (provider response not valid JSON)"];
  }
  if (message === "provider_empty_response" || /^schema_/.test(message)) {
    return ["internal", `smart_log_invalid_result (${message})`];
  }
  if (message === "fetch failed" || error instanceof TypeError) {
    return ["unavailable", "smart_log_provider_unreachable (network)"];
  }
  return ["internal", `smart_log_failed (${message.slice(0, 160)})`];
}

exports.analyzeSmartLog = functions
  .region("europe-west1")
  .runWith({ secrets: [GEMINI_API_KEY], timeoutSeconds: 60, memory: "256MB" })
  .https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "login-required");
    try {
      require("./smart-log").assertExpectedUid(context.auth.uid, data?.expected_uid);
      // A saved result can be replayed without a provider key. Let the
      // analysis layer reject only new requests when the secret is unavailable.
      let apiKey = "";
      try { apiKey = GEMINI_API_KEY.value() || ""; } catch { /* provider unavailable */ }
      return await require("./smart-log").analyze({
        db: getFirestore(),
        uid: context.auth.uid,
        data: data || {},
        apiKey,
        fetchImpl: fetch,
        now: new Date(),
      });
    } catch (error) {
      if (error instanceof functions.https.HttpsError) throw error;
      console.error("Smart Log analysis failed", error);
      const [code, reason] = smartLogFailure(error);
      throw new functions.https.HttpsError(code, reason);
    }
  });

const makeGoogleHandlers = () => {
  const col = getFirestore().collection("googleTokens");
  return createGoogleHandlers({
    fetchImpl: fetch,
    store: {
      get: async (uid) => (await col.doc(uid).get()).data() || null,
      set: (uid, value) => col.doc(uid).set(value),
      delete: (uid) => col.doc(uid).delete(),
    },
    clientId: GOOGLE_CLIENT_ID.value(),
    clientSecret: GOOGLE_CLIENT_SECRET.value(),
    HttpsError: functions.https.HttpsError,
  });
};

const googleCall = (fn) =>
  functions
    .region("europe-west1")
    .runWith({ secrets: [GOOGLE_CLIENT_SECRET] })
    .https.onCall(async (data, context) => {
      if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "login-required");
      assertExpectedGoogleUid(context.auth.uid, data, functions.https.HttpsError);
      return fn(makeGoogleHandlers(), context.auth.uid, data || {});
    });

exports.googleLinkConfig = googleCall((h) => h.linkConfig());
exports.googleLink = googleCall((h, uid, data) => h.link(uid, data.code));
exports.googleAccessToken = googleCall((h, uid) => h.accessToken(uid));
exports.googleUnlink = googleCall((h, uid) => h.unlink(uid));

const TIME_ZONE = "Europe/Berlin";
const REMINDER_WINDOW_MINUTES = 5;

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

function isoWeekInfo(date) {
  const [year, month, day] = date.split("-").map(Number);
  const thursday = new Date(Date.UTC(year, month - 1, day));
  const mondayIndex = (thursday.getUTCDay() + 6) % 7;
  thursday.setUTCDate(thursday.getUTCDate() - mondayIndex + 3);
  const isoYear = thursday.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  firstThursday.setUTCDate(firstThursday.getUTCDate() - ((firstThursday.getUTCDay() + 6) % 7) + 3);
  const week = 1 + Math.round((thursday - firstThursday) / 604800000);
  const start = new Date(thursday);
  start.setUTCDate(start.getUTCDate() - 3);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  const ymd = (value) => value.toISOString().slice(0, 10);
  return { key: `${isoYear}-W${String(week).padStart(2, "0")}`, start: ymd(start), end: ymd(end) };
}

function normalizeTokens(data = {}) {
  return Array.from(new Set([
    ...(Array.isArray(data.tokens) ? data.tokens : []),
    ...(data.token ? [data.token] : []),
  ].filter(Boolean)));
}

async function sendReminder(uid, tokens, title, body, link, app = "journal") {
  if (!tokens || tokens.length === 0) return { sentCount: 0, failureCount: 0 };

  try {
    const message = {
      data: {
        app,
        title,
        body,
        link: link || "/",
        tag: `${app}-reminder`,
      },
      tokens,
    };
    const response = await getMessaging().sendEachForMulticast(message);
    return {
      sentCount: response.successCount,
      failureCount: response.failureCount,
    };
  } catch (error) {
    console.error(`Error sending reminders to ${uid}:`, error);
    return { sentCount: 0, failureCount: tokens.length, error: error.message };
  }
}

exports.scheduledJournalPushReminders = onSchedule(
  { schedule: "every 5 minutes", timeZone: TIME_ZONE, region: "europe-west1" },
  async () => {
    const { date, minutes } = getLocalDateParts(new Date(), "Europe/Vienna");
    const db = getFirestore();
    let sentCount = 0;
    let failureCount = 0;

    try {
      // "push" is a settings document, not a collection group.
      const users = await db.collection("fitness").listDocuments();
      for (const user of users) {
        const doc = await user.collection("settings").doc("push").get();
        if (!doc.exists) continue;
        const stored = doc.data() || {};
        const data = stored.apps?.journal || {};
        if (!data.enabled) continue;

        const tokens = normalizeTokens(data);
        if (tokens.length === 0) continue;

        if (isReminderDue(data.reminderTime, minutes)) {
          const uid = user.id;
          const result = await sendReminder(
            uid,
            tokens,
            "Journal Reminder",
            "Time to write in your journal",
            "/"
          );
          sentCount += result.sentCount || 0;
          failureCount += result.failureCount || 0;
        }

        const tent = stored.apps?.tent || {};
        if (!tent.enabled || new Date(`${date}T12:00:00Z`).getUTCDay() !== 0
          || !isReminderDue(tent.reminderTime || "14:00", minutes)) continue;
        const week = isoWeekInfo(date);
        const tentEntries = await user.collection("journal")
          .where("date", ">=", week.start).where("date", "<=", week.end).get();
        const alreadyClosed = tentEntries.docs.some((entry) => {
          const tags = entry.data()?.tags || [];
          return tags.includes("tent") && tags.includes(week.key);
        });
        if (alreadyClosed) continue;
        const result = await sendReminder(
          user.id,
          normalizeTokens(tent),
          "General's Tent",
          `Dein Tent für ${week.key} ist noch offen. Zeit für Return & Report, Lessons Learned, Course Correction und New Targets.`,
          "/#tent2",
          "tent"
        );
        sentCount += result.sentCount || 0;
        failureCount += result.failureCount || 0;
      }

      console.log(`Push reminders: ${sentCount} sent, ${failureCount} failed`);
      return { sentCount, failureCount };
    } catch (error) {
      console.error("Error in scheduledPushReminders:", error);
      return { error: error.message };
    }
  }
);

// Door: täglich zur eingestellten Zeit die offenen Daily Hits (Google Tasks) als Push melden.
// Braucht die dauerhafte Google-Verbindung (googleTokens/{uid}) und apps.door in fitness/{uid}/settings/push.
exports.scheduledDoorReminders = functions
  .region("europe-west1")
  .runWith({ secrets: [GOOGLE_CLIENT_SECRET] })
  .pubsub.schedule("every 5 minutes")
  .timeZone(TIME_ZONE)
  .onRun(async () => {
    const { date, minutes } = getLocalDateParts();
    const db = getFirestore();
    const handlers = makeGoogleHandlers();
    let sentCount = 0;
    let failureCount = 0;
    try {
      const users = await db.collection("fitness").listDocuments();
      for (const user of users) {
        const doc = await user.collection("settings").doc("push").get();
        const data = doc.exists ? (doc.data() || {}).apps?.door || {} : {};
        if (!data.enabled) continue;
        const tokens = normalizeTokens(data);
        if (tokens.length === 0 || !isReminderDue(data.reminderTime, minutes)) continue;
        try {
          const { accessToken } = await handlers.accessToken(user.id);
          const reminder = buildDoorReminder(await fetchDueTasks({ fetchImpl: fetch, accessToken, today: date }), date);
          if (!reminder) continue;
          const result = await sendReminder(user.id, tokens, reminder.title, reminder.body, "/#door2/production", "door");
          sentCount += result.sentCount || 0;
          failureCount += result.failureCount || 0;
        } catch (error) {
          // nicht verbunden / Google gerade nicht erreichbar: dieser Nutzer wartet bis zum nächsten Tag
          failureCount += 1;
          console.warn(`Door reminder skipped for ${user.id}: ${error.message}`);
        }
      }
      console.log(`Door reminders: ${sentCount} sent, ${failureCount} failed`);
      return { sentCount, failureCount };
    } catch (error) {
      console.error("Error in scheduledDoorReminders:", error);
      return { error: error.message };
    }
  });
