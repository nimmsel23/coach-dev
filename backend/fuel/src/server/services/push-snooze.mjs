import fs from "fs";
import path from "path";

// Snooze-State fuer den "Später"-Button auf Supplement-Notifications:
// {"2026-10-13": {"magnesium": 1760355600000}} — until-Timestamp (ms).
// Der Scheduler prueft das bei jedem 60s-Tick statt den Ping sofort erneut
// zu senden; abgelaufene Einträge raeumt sich diese Datei selbst leer.
const SNOOZE_MINUTES = 30;

function getSnoozePath(baseDataDir) {
  return path.join(baseDataDir, "supplements", "snooze.json");
}

function loadSnoozeState(baseDataDir) {
  try {
    const snoozePath = getSnoozePath(baseDataDir);
    if (!fs.existsSync(snoozePath)) return {};
    return JSON.parse(fs.readFileSync(snoozePath, "utf-8")) || {};
  } catch (error) {
    console.error("[push-snooze] Failed to load snooze state:", error);
    return {};
  }
}

function saveSnoozeState(baseDataDir, state) {
  const snoozePath = getSnoozePath(baseDataDir);
  fs.mkdirSync(path.dirname(snoozePath), { recursive: true });
  fs.writeFileSync(snoozePath, JSON.stringify(state, null, 2));
}

export function isSnoozed(baseDataDir, dateStr, itemId) {
  const state = loadSnoozeState(baseDataDir);
  const until = state[dateStr]?.[itemId];
  if (!until) return false;
  if (Date.now() >= until) return false;
  return true;
}

export function snoozeItems(baseDataDir, dateStr, itemIds) {
  const state = loadSnoozeState(baseDataDir);
  const until = Date.now() + SNOOZE_MINUTES * 60 * 1000;
  state[dateStr] = state[dateStr] || {};
  for (const itemId of itemIds) {
    state[dateStr][itemId] = until;
  }
  saveSnoozeState(baseDataDir, state);
  return until;
}
