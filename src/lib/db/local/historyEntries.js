// Lokaler Modus (SQLite via server.mjs): die Abfrage ist ohnehin lokal, ein
// Index bringt nichts — gleiche Rückgabeform wie firestore/workoutIndex.js.
import { getRecentSessions, getSessionHistory } from "./sessions.js";
import { toIndexEntry } from "../../../views/SixPack/workoutDoc.js";

export async function getHistoryEntries({ months = 6 } = {}) {
  const n = months * 10;
  const sessions = await getRecentSessions(n);
  const entries = (Array.isArray(sessions) ? sessions : [])
    .map((s) => toIndexEntry(s.id ? `${s.date}__${s.id}` : s.date, s))
    .filter(Boolean);
  return { entries, hasMore: (sessions?.length || 0) >= n };
}
export async function compactWorkoutIndex() { return { processed: 0 }; }

// Logbuch: lokal ist die Abfrage ohnehin lokal — kein Digest nötig (n = Anzahl Sessions).
export async function getLogbookSessions() {
  return getSessionHistory(2000);
}

// Digest-Gegenstück: lokal liegt alles in der lokalen Abfrage, sinceDate wird nur gefiltert.
export async function getDigestSessions({ sinceDate = null } = {}) {
  const list = await getSessionHistory(2000);
  return sinceDate ? (Array.isArray(list) ? list : []).filter((s) => s?.date && s.date >= sinceDate) : list;
}

// Lokal gibt es keinen Digest — Neuaufbau ist ein No-op (gleiche Form wie firestore/workoutIndex.js).
export async function refreshLogbookDigest() { return { months: 0, sessions: 0 }; }
