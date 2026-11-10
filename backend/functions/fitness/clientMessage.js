// Klienten-Nachricht → Push an den Coach (FCM Data-Message für den SW).
//
// Reine Funktionen ohne Firebase (`node --test`).
// Trigger: onCreate coachConversations/{uid}/messages/{mid} in index.js.

const { renderTemplate } = require("./texts.js");
const { coachUids, coachUrl, deadTokens, DEFAULT_COACH_UIDS } = require("./clientWorkout.js");

const BODY_MAX = 120;

function clientLabel(name, fallback) {
  const text = String(name || "").trim();
  return text ? text.split(/\s+/)[0] : fallback;
}

function previewBody(body) {
  const text = String(body || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.length > BODY_MAX ? `${text.slice(0, BODY_MAX - 1)}…` : text;
}

function shouldNotify({ uid, after, coaches = coachUids() } = {}) {
  if (!after || typeof after !== "object") return { notify: false, reason: "gelöscht" };
  if (coaches.includes(uid)) return { notify: false, reason: "coach-eigene-konversation" };
  if (after.senderRole !== "client") return { notify: false, reason: "kein-klient" };
  if (coaches.includes(after.senderUid)) return { notify: false, reason: "coach-als-sender" };
  const body = String(after.body || "").trim();
  if (!body) return { notify: false, reason: "leer" };
  return { notify: true, reason: "neu" };
}

function buildMessage({ uid, mid, message, clientName, tokens, texts }) {
  if (!texts) throw new Error("buildMessage: texts (clientMessage aus notifications.yaml) fehlt");
  const name = clientLabel(clientName, texts.nameFallback);
  const preview = previewBody(message?.body) || texts.bodyFallback;
  const title = renderTemplate(texts.title, { name });
  const body = renderTemplate(texts.body, { preview, name });
  const link = `${coachUrl()}/#/clients/${encodeURIComponent(uid)}/messages`;

  return {
    data: {
      app: "fitness",
      type: "clientMessage",
      title,
      body,
      link,
      tag: `client-message-${uid}`,
      clientUid: String(uid || ""),
      clientName: name,
      mid: String(mid || ""),
    },
    tokens,
    webpush: {
      headers: { Urgency: "high", TTL: "86400" },
    },
    android: { priority: "high" },
  };
}

module.exports = {
  BODY_MAX,
  DEFAULT_COACH_UIDS,
  buildMessage,
  clientLabel,
  coachUids,
  coachUrl,
  deadTokens,
  previewBody,
  shouldNotify,
};
