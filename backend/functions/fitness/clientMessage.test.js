const test = require("node:test");
const assert = require("node:assert/strict");
const { NOTIFICATIONS } = require("./texts.js");
const {
  buildMessage, previewBody, shouldNotify, DEFAULT_COACH_UIDS, BODY_MAX,
} = require("./clientMessage.js");

const texts = NOTIFICATIONS.clientMessage;
const COACH = DEFAULT_COACH_UIDS[0];
const KLIENT = "WM4bgRvDGxXD7SJHo8yWqaKFRQo2";

test("nur Client-Nachrichten an den Coach melden", () => {
  const msg = { body: "Hallo", senderRole: "client", senderUid: KLIENT };
  assert.deepEqual(shouldNotify({ uid: KLIENT, after: msg }), { notify: true, reason: "neu" });
  assert.equal(shouldNotify({ uid: KLIENT, after: { ...msg, senderRole: "coach" } }).reason, "kein-klient");
  assert.equal(shouldNotify({ uid: COACH, after: msg }).reason, "coach-eigene-konversation");
  assert.equal(shouldNotify({ uid: KLIENT, after: { ...msg, body: "  " } }).reason, "leer");
  assert.equal(shouldNotify({ uid: KLIENT, after: null }).reason, "gelöscht");
});

test("Preview kürzt lange Texte", () => {
  assert.equal(previewBody("  Hi  "), "Hi");
  assert.equal(previewBody("a".repeat(BODY_MAX + 10)).length, BODY_MAX);
  assert.ok(previewBody("a".repeat(BODY_MAX + 10)).endsWith("…"));
});

test("Nachricht verlinkt Chat und trägt mid", () => {
  const msg = buildMessage({
    uid: KLIENT,
    mid: "m1",
    message: { body: "Knie zwickt etwas" },
    clientName: "Matthias Muster",
    tokens: ["t1"],
    texts,
  });
  assert.equal(msg.data.type, "clientMessage");
  assert.equal(msg.data.title, "Matthias: Nachricht");
  assert.equal(msg.data.body, "Knie zwickt etwas");
  assert.equal(msg.data.mid, "m1");
  assert.equal(msg.data.tag, `client-message-${KLIENT}`);
  assert.match(msg.data.link, new RegExp(`#/clients/${KLIENT}/messages$`));
  assert.deepEqual(msg.tokens, ["t1"]);
});
