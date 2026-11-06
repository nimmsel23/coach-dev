// local/tours.js — Radtouren-Aggregation für den Node-Build (server.mjs :9100).
// Baut bewusst NUR auf den bereits existierenden Session-Funktionen auf
// (getSessionHistory/saveSession/deleteSession aus ./sessions.js), statt
// eigene ~/.aos-Pfade zu konstruieren — server.mjs' /session*-Routen lösen
// die uid schon korrekt auf (~/.aos/fitness/users/<uid>/sessions/), siehe
// Pfad-Falle in ../../../CLAUDE.md.
import { getSessionHistory, saveSession, deleteSession } from "./sessions.js";
import { extractTours, aggregateTours, buildTourSessionPayload } from "../../tours/schema.js";

const DEFAULT_WINDOW = 365; // getSessionHistory() ist in local mode ein Alias auf getRecentSessions(n) → n=Anzahl Sessions, nicht Tage.

export async function getCyclingTours(limitSessions = DEFAULT_WINDOW) {
  const sessions = await getSessionHistory(limitSessions);
  return extractTours(sessions);
}

export async function getCyclingTourStats(limitSessions = DEFAULT_WINDOW) {
  return aggregateTours(await getCyclingTours(limitSessions));
}

export async function saveCyclingTour(tour) {
  const { date, id, sessionData } = buildTourSessionPayload(tour);
  const res = await saveSession(date, sessionData, id);
  return { ...res, date, id };
}

export async function deleteCyclingTour(date, id) {
  return deleteSession(date, id);
}
