// firestore/tours.js — Radtouren-Aggregation für den Firebase-Build.
// Gleiche Logik wie local/tours.js, aber auf firestore/sessions.js aufgesetzt
// (das selbst intern auf local/sessions.js zurückfällt, wenn !hasAuthSession()
// — Coach-Solo-Nutzung ohne Login bleibt also automatisch funktionsfähig).
import { getSessionHistory, saveSession, deleteSession } from "./sessions.js";
import { getDigestSessions } from "./workoutIndex.js";
import { hasAuthSession } from "./core.js";
import { todayISO } from "../shared/utils.js";
import { addDaysISO } from "../shared/dates.js";
import { extractTours, aggregateTours, buildTourSessionPayload } from "../../tours/schema.js";

const DEFAULT_WINDOW_DAYS = 365; // firestore/sessions.js::getSessionHistory(days) ist ein echtes Tage-Fenster.

export async function getCyclingTours(days = DEFAULT_WINDOW_DAYS) {
  // Eingeloggt: Monats-Digests (activity + activityAddons) statt jede Session des Fensters.
  const sessions = hasAuthSession()
    ? await getDigestSessions({ sinceDate: addDaysISO(todayISO(), -days) })
    : await getSessionHistory(days);
  return extractTours(sessions);
}

export async function getCyclingTourStats(days = DEFAULT_WINDOW_DAYS) {
  return aggregateTours(await getCyclingTours(days));
}

export async function saveCyclingTour(tour) {
  const { date, id, sessionData } = buildTourSessionPayload(tour);
  const res = await saveSession(date, sessionData, id);
  return { ...res, date, id };
}

export async function deleteCyclingTour(date, id) {
  return deleteSession(date, id);
}
