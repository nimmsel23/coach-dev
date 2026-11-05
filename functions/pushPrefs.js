// Einstellungen des Notification-Panels (Setup-Tab) auswerten — rein, ohne Firebase.
// Dokument: fitness/{uid}/settings/push
//   enabled, tokens[], devices[{token,label,addedAt}], types{}, reminderTime,
//   quietHours{enabled,start,end}, mutedClients[], clientWorkoutMode: "all" | "finished"

const TIME_ZONE = "Europe/Berlin";
const TEST_COOLDOWN_MS = 10 * 1000;
const TEST_KINDS = ["reminder", "clientWorkout"];

function toMinutes(text) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(text || ""));
  if (!match) return null;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  return minutes < 24 * 60 ? minutes : null;
}

function minutesNow(now, timeZone) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(now);
  const get = (type) => Number(parts.find((p) => p.type === type)?.value);
  return get("hour") * 60 + get("minute");
}

// Ruhezeit darf über Mitternacht gehen (22:00 → 07:00). start == end gilt als aus.
function isQuietNow(quietHours, now = new Date(), timeZone = TIME_ZONE) {
  if (!quietHours?.enabled) return false;
  const start = toMinutes(quietHours.start);
  const end = toMinutes(quietHours.end);
  if (start == null || end == null || start === end) return false;
  const current = minutesNow(now, timeZone);
  return start < end ? current >= start && current < end : current >= start || current < end;
}

function allowsClientWorkout(pushData = {}, uid, reason, now = new Date()) {
  if (!pushData.enabled) return { allow: false, why: "push-aus" };
  if (pushData.types?.clientWorkout === false) return { allow: false, why: "typ-aus" };
  if (Array.isArray(pushData.mutedClients) && pushData.mutedClients.includes(uid)) return { allow: false, why: "klient-stumm" };
  if (pushData.clientWorkoutMode === "finished" && reason !== "abgeschlossen") return { allow: false, why: "nur-abgeschlossene" };
  if (isQuietNow(pushData.quietHours, now)) return { allow: false, why: "ruhezeit" };
  return { allow: true, why: "ok" };
}

// Test-Push: bewusst unverwechselbar ("Test"), damit er nie wie echte Klientendaten wirkt.
// `texts` = ganze notifications.yaml (testReminder / testClientWorkout).
function buildTestMessage(kind, tokens, texts, coachUrl = "https://vos-coach.web.app") {
  if (!texts) throw new Error("buildTestMessage: texts (notifications.yaml) fehlt");
  if (kind === "clientWorkout") {
    return {
      data: {
        app: "fitness",
        type: "clientWorkout",
        title: texts.testClientWorkout.title,
        body: texts.testClientWorkout.body,
        link: `${coachUrl.replace(/\/+$/, "")}/#/clients`,
        tag: "client-workout-test",
        clientUid: "test",
        clientName: "Test",
        sid: `test-${Date.now()}`,
        date: "",
      },
      tokens,
    };
  }
  return {
    data: {
      app: "fitness",
      title: texts.testReminder.title,
      body: texts.testReminder.body,
      link: texts.testReminder.link || "/?tab=session",
      tag: "fitness-test",
    },
    tokens,
  };
}

function testCooldownLeft(lastTestAtMs, nowMs = Date.now()) {
  if (!lastTestAtMs) return 0;
  return Math.max(0, TEST_COOLDOWN_MS - (nowMs - lastTestAtMs));
}

// Alle Tokens eines Nutzers (tokens[] + Einzelfeld token). Geräte mit paused=true bekommen nichts —
// außer includePaused (gezielter Test an ein pausiertes Gerät).
function activeTokens(data = {}, { includePaused = false } = {}) {
  const paused = new Set(
    includePaused ? [] : (Array.isArray(data.devices) ? data.devices : []).filter((d) => d?.paused === true).map((d) => d.token),
  );
  return Array.from(new Set([
    ...(Array.isArray(data.tokens) ? data.tokens : []),
    ...(data.token ? [data.token] : []),
  ].filter((t) => t && !paused.has(t))));
}

module.exports = {
  TEST_KINDS,
  activeTokens,
  allowsClientWorkout,
  buildTestMessage,
  isQuietNow,
  testCooldownLeft,
};
