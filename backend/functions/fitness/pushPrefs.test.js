const test = require("node:test");
const { NOTIFICATIONS } = require("./texts.js");
const assert = require("node:assert/strict");
const {
  activeTokens, allowsClientWorkout, allowsClientMessage, allowsInboxRequest,
  buildTestMessage, isQuietNow, testCooldownLeft,
} = require("./pushPrefs.js");

// 2026-10-15 ist Sommerzeit (MESZ, UTC+2)
const at = (hhmmBerlin) => new Date(`2026-10-15T${hhmmBerlin}:00+02:00`);
const quiet = { enabled: true, start: "22:00", end: "07:00" };

test("Ruhezeit über Mitternacht", () => {
  assert.equal(isQuietNow(quiet, at("23:30")), true);
  assert.equal(isQuietNow(quiet, at("03:00")), true);
  assert.equal(isQuietNow(quiet, at("06:59")), true);
  assert.equal(isQuietNow(quiet, at("07:00")), false);
  assert.equal(isQuietNow(quiet, at("21:59")), false);
  assert.equal(isQuietNow(quiet, at("12:00")), false);
});

test("Ruhezeit am Tag und Randfälle", () => {
  const mittag = { enabled: true, start: "12:00", end: "14:00" };
  assert.equal(isQuietNow(mittag, at("13:00")), true);
  assert.equal(isQuietNow(mittag, at("14:00")), false);
  assert.equal(isQuietNow({ ...quiet, enabled: false }, at("23:30")), false);
  assert.equal(isQuietNow({ enabled: true, start: "08:00", end: "08:00" }, at("08:00")), false);
  assert.equal(isQuietNow({ enabled: true, start: "kaputt", end: "07:00" }, at("03:00")), false);
  assert.equal(isQuietNow(undefined, at("03:00")), false);
});

test("Ruhezeit wird in Berliner Zeit gerechnet, nicht in UTC", () => {
  // 21:30 UTC = 23:30 Berlin (Sommerzeit) → ruhig; 19:30 UTC = 21:30 Berlin → nicht ruhig
  assert.equal(isQuietNow(quiet, new Date("2026-10-15T21:30:00Z")), true);
  assert.equal(isQuietNow(quiet, new Date("2026-10-15T19:30:00Z")), false);
});

test("Klienten-Workout: alle Schalter einzeln", () => {
  const basis = { enabled: true };
  const tag = at("12:00");
  assert.equal(allowsClientWorkout(basis, "U1", "neu", tag).allow, true);
  assert.equal(allowsClientWorkout({}, "U1", "neu", tag).why, "push-aus");
  assert.equal(allowsClientWorkout({ ...basis, types: { clientWorkout: false } }, "U1", "neu", tag).why, "typ-aus");
  assert.equal(allowsClientWorkout({ ...basis, mutedClients: ["U1"] }, "U1", "neu", tag).why, "klient-stumm");
  assert.equal(allowsClientWorkout({ ...basis, mutedClients: ["U2"] }, "U1", "neu", tag).allow, true);
  assert.equal(allowsClientWorkout({ ...basis, quietHours: quiet }, "U1", "neu", at("23:00")).why, "ruhezeit");
});

test("Modus 'nur abgeschlossene'", () => {
  const pd = { enabled: true, clientWorkoutMode: "finished" };
  assert.equal(allowsClientWorkout(pd, "U1", "neu", at("12:00")).why, "nur-abgeschlossene");
  assert.equal(allowsClientWorkout(pd, "U1", "abgeschlossen", at("12:00")).allow, true);
});

test("Test-Nachrichten sind als Test erkennbar und enthalten keine Klientendaten", () => {
  const w = buildTestMessage("clientWorkout", ["t"], NOTIFICATIONS);
  assert.match(w.data.title, /^Test/);
  assert.equal(w.data.type, "clientWorkout");
  assert.equal(w.data.clientUid, "test");
  assert.match(w.data.sid, /^test-/);
  const inbox = buildTestMessage("inboxRequest", ["t"], NOTIFICATIONS);
  assert.match(inbox.data.title, /^Test/);
  assert.equal(inbox.data.type, "inboxRequest");
  assert.match(inbox.data.link, /#\/exercises$/);
  const r = buildTestMessage("reminder", ["t"], NOTIFICATIONS);
  assert.match(r.data.title, /^Test/);
  assert.equal(r.data.type, undefined);
  assert.deepEqual(r.tokens, ["t"]);
});

test("Inbox-Anfrage: Schalter und Ruhezeit", () => {
  const tag = at("12:00");
  assert.equal(allowsInboxRequest({ enabled: true }, tag).allow, true);
  assert.equal(allowsInboxRequest({}, tag).why, "push-aus");
  assert.equal(allowsInboxRequest({ enabled: true, types: { inboxRequest: false } }, tag).why, "typ-aus");
  assert.equal(allowsInboxRequest({ enabled: true, quietHours: quiet }, at("23:00")).why, "ruhezeit");
});

test("Klienten-Nachricht: Schalter, Stumm und Ruhezeit", () => {
  const tag = at("12:00");
  const basis = { enabled: true };
  assert.equal(allowsClientMessage(basis, "U1", tag).allow, true);
  assert.equal(allowsClientMessage({}, "U1", tag).why, "push-aus");
  assert.equal(allowsClientMessage({ ...basis, types: { clientMessage: false } }, "U1", tag).why, "typ-aus");
  assert.equal(allowsClientMessage({ ...basis, mutedClients: ["U1"] }, "U1", tag).why, "klient-stumm");
  assert.equal(allowsClientMessage({ ...basis, quietHours: quiet }, "U1", at("23:00")).why, "ruhezeit");
  const demo = buildTestMessage("clientMessage", ["t"], NOTIFICATIONS);
  assert.equal(demo.data.type, "clientMessage");
  assert.match(demo.data.title, /^Test/);
});

test("Test-Cooldown", () => {
  assert.equal(testCooldownLeft(null, 1000), 0);
  assert.equal(testCooldownLeft(1000, 4000), 7000);
  assert.equal(testCooldownLeft(1000, 20000), 0);
});

test('activeTokens: pausierte Geräte bekommen nichts, gezielter Test schon', () => {
  const data = {
    token: 'a', tokens: ['a', 'b', 'c'],
    devices: [{ token: 'b', paused: true }, { token: 'c', paused: false }],
  };
  assert.deepEqual(activeTokens(data), ['a', 'c']);
  assert.deepEqual(activeTokens(data, { includePaused: true }), ['a', 'b', 'c']);
  assert.deepEqual(activeTokens({}), []);
  assert.deepEqual(activeTokens({ token: 'x' }), ['x']);
});
