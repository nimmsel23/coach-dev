const test = require("node:test");
const assert = require("node:assert/strict");
const { NOTIFICATIONS } = require("./texts.js");
const {
  buildMessage, exerciseTitle, itemStatus, shouldNotify, MAX_AGE_MS,
} = require("./inboxRequest.js");

const texts = NOTIFICATIONS.inboxRequest;
const NOW = new Date("2026-11-10T10:00:00Z");

test("Titel aus nested exercise oder name", () => {
  assert.equal(exerciseTitle({ exercises: [{ display_name: "Jefferson Curl" }] }), "Jefferson Curl");
  assert.equal(exerciseTitle({ name: "Dips" }), "Dips");
  assert.equal(exerciseTitle({ file_id: "inbox_x" }), "inbox_x");
  assert.equal(exerciseTitle({}), "Neue Übungsanfrage");
});

test("Status-Fallback", () => {
  assert.equal(itemStatus({ status: "ai_enriched" }), "ai_enriched");
  assert.equal(itemStatus({}), "draft");
});

test("nur Create meldet, Updates und Erledigtes nicht", () => {
  const item = { name: "Curl", generated_at: "2026-11-10T09:50:00Z" };
  assert.deepEqual(shouldNotify({ before: null, after: item, now: NOW }), { notify: true, reason: "neu" });
  assert.equal(shouldNotify({ before: item, after: { ...item, status: "ai_enriched" }, now: NOW }).reason, "update");
  assert.equal(shouldNotify({ before: null, after: { ...item, status: "approved" }, now: NOW }).reason, "schon-erledigt");
  assert.equal(shouldNotify({ before: null, after: null, now: NOW }).reason, "gelöscht");
});

test("alte Republishes nach Wipe melden nicht", () => {
  const old = new Date(NOW.getTime() - MAX_AGE_MS - 1000).toISOString();
  assert.equal(shouldNotify({
    before: null,
    after: { name: "Alt", generated_at: old },
    now: NOW,
  }).reason, "zu-alt");
});

test("Nachricht verlinkt Anfragen und trägt inboxId", () => {
  const msg = buildMessage({
    id: "inbox_jefferson_curl_pipeline",
    item: { name: "Jefferson Curl", status: "draft", exercises: [{ display_name: "Jefferson Curl" }] },
    tokens: ["t1"],
    texts,
  });
  assert.equal(msg.data.type, "inboxRequest");
  assert.equal(msg.data.title, "Anfrage: Jefferson Curl");
  assert.equal(msg.data.inboxId, "inbox_jefferson_curl_pipeline");
  assert.match(msg.data.link, /#\/exercises$/);
  assert.deepEqual(msg.tokens, ["t1"]);
});
