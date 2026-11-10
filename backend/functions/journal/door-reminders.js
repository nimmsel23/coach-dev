// Door-Erinnerungen: offene Daily Hits aus Google Tasks ("Door · Production") → Push-Text.
// Reine Logik ohne Firebase, damit tests/door-reminders.test.mjs sie ohne Netz prüft.
// Google Tasks speichert nur das Fälligkeits-DATUM (keine Uhrzeit, keine Erinnerung) — deshalb
// gibt es eine tägliche Erinnerungszeit je Nutzer (apps.door.reminderTime) statt Zeiten je Task.
const API = "https://tasks.googleapis.com/tasks/v1";
const LIST_PRODUCTION = "Door · Production";

function addDays(date, n) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Offene Hits, die heute oder früher fällig sind (due ist 00:00 UTC des Tages). */
function openHits(tasks, today) {
  return (tasks || [])
    .filter((t) => t.status !== "completed" && (t.title || "").trim() && t.due && t.due.slice(0, 10) <= today)
    .map((t) => ({ title: t.title.trim(), overdue: t.due.slice(0, 10) < today }));
}

/** { title, body } oder null, wenn nichts offen ist. */
function buildDoorReminder(tasks, today) {
  const hits = openHits(tasks, today);
  if (hits.length === 0) return null;
  const overdue = hits.filter((h) => h.overdue).length;
  const names = hits.slice(0, 3).map((h) => h.title).join(", ");
  const more = hits.length > 3 ? " …" : "";
  const head = `${hits.length} offene${hits.length === 1 ? "r Hit" : " Hits"} heute${overdue ? ` (${overdue} überfällig)` : ""}`;
  return { title: "Door · Production", body: `${head}: ${names}${more}` };
}

async function get(fetchImpl, accessToken, path, params) {
  const res = await fetchImpl(`${API}${path}?${new URLSearchParams(params)}`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`tasks ${res.status}`);
  return res.json();
}

/** Alle bis heute fälligen, offenen Tasks der Liste "Door · Production" (Liste fehlt → []). */
async function fetchDueTasks({ fetchImpl, accessToken, today }) {
  let listId = null;
  let pageToken;
  do {
    const data = await get(fetchImpl, accessToken, "/users/@me/lists", { maxResults: "100", ...(pageToken ? { pageToken } : {}) });
    listId = (data.items || []).find((l) => l.title === LIST_PRODUCTION)?.id || null;
    pageToken = listId ? null : data.nextPageToken;
  } while (pageToken);
  if (!listId) return [];
  const out = [];
  pageToken = undefined;
  do {
    const data = await get(fetchImpl, accessToken, `/lists/${encodeURIComponent(listId)}/tasks`, {
      maxResults: "100", showCompleted: "false", dueMax: `${addDays(today, 1)}T00:00:00.000Z`,
      ...(pageToken ? { pageToken } : {}),
    });
    out.push(...(data.items || []));
    pageToken = data.nextPageToken;
  } while (pageToken);
  return out;
}

module.exports = { LIST_PRODUCTION, openHits, buildDoorReminder, fetchDueTasks };
