// Neue Übungsanfrage in coachInbox → Push an den Coach (FCM Data-Message).
//
// Reine Funktionen ohne Firebase-Zugriff (`node --test`).
// Trigger: onCreate coachInbox/{id} in index.js.
// Der Coach-Sync (`publish_inbox`) legt dort neue Drafts an, sobald lokale
// inbox_*.yml erscheinen — das ist die kanonische „neue Anfrage“-Quelle.

const { renderTemplate } = require("./texts.js");
const { coachUids, coachUrl, deadTokens, DEFAULT_COACH_UIDS } = require("./clientWorkout.js");

// Nach einem Collection-Wipe republiziert der Sync alle offenen Drafts erneut.
// Ohne Altersgrenze würde das einen Push-Sturm auslösen.
const MAX_AGE_MS = 2 * 60 * 60 * 1000;

function parseTimestamp(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") {
    const d = value.toDate();
    return Number.isFinite(d?.getTime?.()) ? d.getTime() : null;
  }
  if (typeof value === "object" && typeof value.seconds === "number") {
    return value.seconds * 1000;
  }
  const ms = Date.parse(String(value));
  return Number.isFinite(ms) ? ms : null;
}

function exerciseTitle(item = {}) {
  const nested = Array.isArray(item.exercises) ? item.exercises[0] : null;
  const data = nested || item.enriched || item;
  const title = String(
    data.display_name || data.name || data.german || data.english || item.name || item.file_id || "",
  ).trim();
  return title || "Neue Übungsanfrage";
}

function itemStatus(item = {}) {
  return String(
    item.status
    || item.inbox_status
    || item.exercises?.[0]?.review_state?.status
    || item.enriched?.review_state?.status
    || "draft",
  );
}

function shouldNotify({ before, after, now = new Date() } = {}) {
  if (before) return { notify: false, reason: "update" };
  if (!after || typeof after !== "object") return { notify: false, reason: "gelöscht" };
  const status = itemStatus(after);
  if (status === "approved" || status === "rejected") return { notify: false, reason: "schon-erledigt" };

  const stamped = parseTimestamp(after.received_at)
    || parseTimestamp(after.generated_at)
    || parseTimestamp(after.enriched_at)
    || parseTimestamp(after.created_at);
  if (stamped != null && now.getTime() - stamped > MAX_AGE_MS) {
    return { notify: false, reason: "zu-alt" };
  }
  return { notify: true, reason: "neu" };
}

function buildMessage({ id, item, tokens, texts }) {
  if (!texts) throw new Error("buildMessage: texts (inboxRequest aus notifications.yaml) fehlt");
  const titleName = exerciseTitle(item);
  const status = itemStatus(item);
  const title = renderTemplate(texts.title, { name: titleName });
  const body = renderTemplate(texts.body, { status, name: titleName });
  const link = `${coachUrl()}/#/exercises`;

  return {
    data: {
      app: "fitness",
      type: "inboxRequest",
      title,
      body,
      link,
      tag: `inbox-request-${id}`,
      inboxId: String(id || ""),
      status,
    },
    tokens,
    webpush: {
      headers: { Urgency: "normal", TTL: "86400" },
    },
    android: { priority: "normal" },
  };
}

module.exports = {
  DEFAULT_COACH_UIDS,
  MAX_AGE_MS,
  buildMessage,
  coachUids,
  coachUrl,
  deadTokens,
  exerciseTitle,
  itemStatus,
  shouldNotify,
};
