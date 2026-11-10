// Entscheidungslogik für onPlanPublished (ohne Firebase-Abhängigkeit, testbar).
// Nur ein NEUERER publishedAt-Stand eines Coach-Plans löst einen Push aus.
function isNewer(next, prev) {
  if (!prev) return true;
  const a = Date.parse(next);
  const b = Date.parse(prev);
  return Number.isFinite(a) && Number.isFinite(b) ? a > b : String(next) > String(prev);
}

function shouldNotifyPlanPublished(uid, before, after) {
  if (!after || after.status !== "published" || !after.publishedAt) return false;
  if (!isNewer(after.publishedAt, (before || {}).publishedAt)) return false;
  return Boolean(after.coachUid) && after.coachUid !== uid;
}

// Welcher Text (Schlüssel in notifications.yaml) mit welchen Platzhaltern gesendet wird.
function planPushContent(after) {
  const plan = after.published?.name || after.name || "Trainingsplan";
  const version = Number(after.headVersion) || 0;
  if (version > 1) {
    const message = typeof after.headMessage === "string" ? after.headMessage.trim() : "";
    return { type: "planUpdated", vars: { plan, detail: message ? `v${version}: ${message}` : `v${version}` } };
  }
  return { type: "planPublished", vars: { plan } };
}

module.exports = { shouldNotifyPlanPublished, planPushContent };
