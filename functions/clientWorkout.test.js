const test = require("node:test");
const { NOTIFICATIONS } = require("./texts.js");
const texts = NOTIFICATIONS.clientWorkout;
const assert = require("node:assert/strict");
const {
  buildMessage, coachUids, coachUrl, deadTokens, sessionHasSignal, shouldNotify, DEFAULT_COACH_UIDS,
} = require("./clientWorkout.js");

const NOW = new Date("2026-10-15T10:00:00Z");
const COACH = DEFAULT_COACH_UIDS[0];
const KLIENT = "WM4bgRvDGxXD7SJHo8yWqaKFRQo2";
const mitInhalt = (extra = {}) => ({
  date: "2026-10-15", trainingsart: "Kraft", duration: 45,
  exercises: [{ id: "squat", setsArray: [{ reps: 5, weight: 100 }] }], ...extra,
});

test("leerer Auto-Save-Rahmen hat kein Signal", () => {
  assert.equal(sessionHasSignal({ date: "2026-10-15", session_id: "x", exercises: [] }), false);
  assert.equal(sessionHasSignal(null), false);
});

test("Dauer, Sätze, done und verschachtelte Slots zählen als Signal", () => {
  assert.equal(sessionHasSignal({ duration: 30 }), true);
  assert.equal(sessionHasSignal({ exercises: [{ done: true }] }), true);
  assert.equal(sessionHasSignal({ slots: [{ exercises: [{ setsArray: [{ reps: 8 }] }] }] }), true);
  assert.equal(sessionHasSignal({ exercises: [{ sets: 0, reps: 0 }] }), false);
});

test("erste Session mit Inhalt meldet", () => {
  const r = shouldNotify({ uid: KLIENT, before: { date: "2026-10-15" }, after: mitInhalt(), now: NOW });
  assert.deepEqual(r, { notify: true, reason: "neu" });
});

test("Autosave ohne Änderung der Lage meldet nicht erneut", () => {
  const r = shouldNotify({ uid: KLIENT, before: mitInhalt(), after: mitInhalt({ notes: "x" }), now: NOW });
  assert.equal(r.notify, false);
});

test("Abschluss meldet einmal nach", () => {
  const r = shouldNotify({ uid: KLIENT, before: mitInhalt(), after: mitInhalt({ finishedAt: "2026-10-15T09:00:00Z" }), now: NOW });
  assert.deepEqual(r, { notify: true, reason: "abgeschlossen" });
  const wieder = shouldNotify({
    uid: KLIENT, before: mitInhalt({ finishedAt: "x" }), after: mitInhalt({ finishedAt: "x", notes: "y" }), now: NOW,
  });
  assert.equal(wieder.notify, false);
});

test("Coach-eigene Sessions, Löschungen und alte Nachträge melden nicht", () => {
  assert.equal(shouldNotify({ uid: COACH, before: null, after: mitInhalt(), now: NOW }).reason, "coach-eigene-session");
  assert.equal(shouldNotify({ uid: KLIENT, before: mitInhalt(), after: null, now: NOW }).reason, "gelöscht");
  assert.equal(shouldNotify({ uid: KLIENT, before: null, after: mitInhalt({ deleted: true }), now: NOW }).reason, "gelöscht");
  assert.equal(shouldNotify({ uid: KLIENT, before: null, after: mitInhalt({ date: "2026-10-01" }), now: NOW }).reason, "zu-alt");
  assert.equal(shouldNotify({ uid: KLIENT, before: null, after: mitInhalt({ date: "2026-10-12" }), now: NOW }).notify, true);
});

test("COACH_URL aus der Umgebung, ohne Schrägstrich am Ende", () => {
  assert.equal(coachUrl({}), "https://vos-coach.web.app");
  assert.equal(coachUrl({ COACH_URL: "https://example.test/" }), "https://example.test");
});

test("COACH_UIDS aus der Umgebung überschreibt den Standard", () => {
  assert.deepEqual(coachUids({}), DEFAULT_COACH_UIDS);
  assert.deepEqual(coachUids({ COACH_UIDS: " a , b " }), ["a", "b"]);
});

test("Nachricht enthält keine Notizen, Gewichte oder Übungsnamen", () => {
  const msg = buildMessage({
    texts,
    uid: KLIENT, sid: "s1", clientName: "Matthias Muster", tokens: ["t1"],
    session: mitInhalt({ notes: "Knie zwickt, Arzttermin" }),
  });
  const text = JSON.stringify(msg);
  assert.equal(msg.data.title, "Matthias: Workout eingegangen");
  assert.equal(msg.data.body, "Kraft · 45 min");
  assert.equal(msg.data.tag, `client-workout-${KLIENT}`);
  assert.equal(msg.data.type, "clientWorkout");
  assert.ok(!text.includes("Knie") && !text.includes("squat") && !text.includes("100"));
  assert.deepEqual(msg.tokens, ["t1"]);
});

test("Abschluss-Titel und Fallbacks für Name/Inhalt", () => {
  const msg = buildMessage({
    texts,
    uid: KLIENT, sid: "s1", clientName: "", tokens: [], reason: "abgeschlossen",
    session: { date: "2026-10-15", exercises: [{ done: true }] },
  });
  assert.equal(msg.data.title, "Klient: Workout abgeschlossen");
  assert.equal(msg.data.body, "Session vom 2026-10-15");
  assert.equal(msg.data.link, `https://vos-coach.web.app/#/clients/${KLIENT}?date=2026-10-15`);
});

test("nur tote Tokens werden zum Entfernen vorgeschlagen", () => {
  const responses = [
    { success: true },
    { success: false, error: { code: "messaging/registration-token-not-registered" } },
    { success: false, error: { code: "messaging/internal-error" } },
  ];
  assert.deepEqual(deadTokens(["a", "b", "c"], responses), ["b"]);
});

test("Wortlaut kommt aus den übergebenen Texten (notifications.yaml), nicht aus dem Code", () => {
  const eigene = {
    ...texts, title: "{name} hat trainiert", body: "{details}!", minutes: "{minutes}'", detailSeparator: " / ",
  };
  const msg = buildMessage({
    uid: KLIENT, sid: "s1", clientName: "Matthias Muster", tokens: [], texts: eigene,
    session: mitInhalt(),
  });
  assert.equal(msg.data.title, "Matthias hat trainiert");
  assert.equal(msg.data.body, "Kraft / 45'!");
});

test("fehlende Texte sind ein harter Fehler statt stiller Standardwerte", () => {
  assert.throws(() => buildMessage({ uid: KLIENT, sid: "s", session: mitInhalt(), tokens: [] }), /texts/);
});

test("notifications.yaml enthält alle Schlüssel, die der Code braucht", () => {
  for (const key of ["title", "titleFinished", "body", "bodyDate", "bodyFallback", "nameFallback", "minutes", "detailSeparator"]) {
    assert.ok(typeof texts[key] === "string" && texts[key].length > 0, `clientWorkout.${key} fehlt in notifications.yaml`);
  }
  for (const key of ["testReminder", "testClientWorkout"]) {
    assert.ok(NOTIFICATIONS[key]?.title && NOTIFICATIONS[key]?.body, `${key} fehlt in notifications.yaml`);
  }
});
