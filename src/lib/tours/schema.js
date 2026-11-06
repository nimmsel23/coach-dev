/**
 * lib/tours/schema.js — Kanonisches Radtour-Zielschema + reine Aggregations-
 * Helfer. Kein I/O hier (kein fetch/localStorage/Firestore) — die eigentliche
 * CRUD-Anbindung sitzt in lib/db/local/tours.js bzw. lib/db/firestore/tours.js,
 * beide bauen auf getSessionHistory()/saveSession()/deleteSession() auf statt
 * eigene ~/.aos-Pfade zu konstruieren (siehe Pfad-Falle in ../CLAUDE.md).
 *
 * Session-JSON bleibt SOT: eine Radtour ist einfach eine Session mit
 * `sessionMode: 'cardio'` und `activity.type === 'cycling'` — exakt das
 * Format, das ActivitySection.jsx (Session/Ausdauertraining-Modal) bereits
 * schreibt. Diese Datei fügt dem `activity`-Objekt additiv drei neue,
 * optionale Felder hinzu (avgSpeedKmh, maxSpeedKmh, elevationGainM), analog
 * zu distanceKm (Commit 24e36a0).
 */

export const CYCLING_TYPE = 'cycling';

export function round1(v) {
  return v == null || Number.isNaN(v) ? null : Math.round(v * 10) / 10;
}
export function round2(v) {
  return v == null || Number.isNaN(v) ? null : Math.round(v * 100) / 100;
}

function toNum(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** Ist dieses activity-Objekt eine Radtour? */
export function isCyclingActivity(activity) {
  return !!activity && activity.type === CYCLING_TYPE;
}

/**
 * Extrahiert alle Radtouren aus einer Liste von Session-Objekten (wie sie
 * getSessionHistory()/getRecentSessions() liefern). Eine Session kann eine
 * Radtour über zwei Wege enthalten:
 *  - als Haupt-Activity (sessionMode === 'cardio', activity.type === 'cycling')
 *  - als Finisher-Addon nach einem Krafttraining (activityAddons[])
 * Beide Fälle werden bereits von ActivitySection.jsx/useSession.js erzeugt —
 * hier wird nur gelesen, nichts Neues erfunden.
 */
export function extractTours(sessions) {
  const list = Array.isArray(sessions) ? sessions : [];
  const tours = [];

  for (const session of list) {
    if (!session || !session.date) continue;
    const candidates = [];
    if (isCyclingActivity(session.activity)) candidates.push(session.activity);
    if (Array.isArray(session.activityAddons)) {
      for (const addon of session.activityAddons) {
        if (isCyclingActivity(addon) && addon !== session.activity) candidates.push(addon);
      }
    }
    for (const activity of candidates) {
      tours.push(normalizeTourFromActivity(session, activity));
    }
  }

  return tours.sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

function normalizeTourFromActivity(session, activity) {
  const distanceKm = toNum(activity.distanceKm);
  const durationMin = toNum(activity.duration);
  let avgSpeedKmh = toNum(activity.avgSpeedKmh);
  if (avgSpeedKmh == null && distanceKm != null && durationMin) {
    avgSpeedKmh = round1(distanceKm / (durationMin / 60));
  }
  return {
    date: session.date,
    sessionId: session.id || null,
    source: activity._importSource || 'manual',
    distanceKm,
    durationMin,
    avgSpeedKmh,
    maxSpeedKmh: toNum(activity.maxSpeedKmh),
    elevationGainM: toNum(activity.elevationGainM),
    notes: activity.notes || '',
    muscleTarget: activity.muscleTarget || null,
  };
}

/** Distanz-gewichtete Durchschnittsgeschwindigkeit über mehrere Touren. */
export function aggregateTours(tours) {
  const list = Array.isArray(tours) ? tours : [];
  const totalKm = round2(list.reduce((sum, t) => sum + (t.distanceKm || 0), 0));
  const totalDurationMin = list.reduce((sum, t) => sum + (t.durationMin || 0), 0);
  const totalElevationM = list.reduce((sum, t) => sum + (t.elevationGainM || 0), 0);
  const bestMaxSpeedKmh = list.reduce((max, t) => (t.maxSpeedKmh != null && t.maxSpeedKmh > max ? t.maxSpeedKmh : max), 0) || null;
  const longestKm = list.reduce((max, t) => (t.distanceKm != null && t.distanceKm > max ? t.distanceKm : max), 0) || null;
  const avgSpeedKmh = totalDurationMin > 0 ? round1(totalKm / (totalDurationMin / 60)) : null;
  return {
    count: list.length,
    totalKm,
    totalDurationMin,
    totalElevationM: totalElevationM || null,
    avgSpeedKmh,
    bestMaxSpeedKmh,
    longestKm,
  };
}

/**
 * Baut aus einer geparsten/manuellen Tour einen speicherbaren Session-Payload
 * inkl. eindeutiger id (damit mehrere Touren am selben Tag nicht denselben
 * Datei-Slot überschreiben, siehe server.mjs sessionFileName()).
 */
export function buildTourSessionPayload(tour, { idPrefix = 'tour' } = {}) {
  const date = tour.date || new Date().toISOString().slice(0, 10);
  const id = tour.id || `${idPrefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const activity = {
    type: CYCLING_TYPE,
    duration: tour.durationMin != null ? String(tour.durationMin) : '',
    distanceKm: tour.distanceKm != null ? String(tour.distanceKm) : '',
    avgSpeedKmh: tour.avgSpeedKmh != null ? String(tour.avgSpeedKmh) : '',
    maxSpeedKmh: tour.maxSpeedKmh != null ? String(tour.maxSpeedKmh) : '',
    elevationGainM: tour.elevationGainM != null ? String(tour.elevationGainM) : '',
    notes: tour.notes || '',
    muscleTarget: tour.muscleTarget || 'full',
  };
  if (tour.source && tour.source !== 'manual') activity._importSource = tour.source;

  const sessionData = {
    date,
    block: 'Radtour',
    sessionMode: 'cardio',
    exercises: [],
    activity,
    effort: null,
    mood: '',
    notes: tour.notes || '',
    saved_at: new Date().toISOString(),
  };
  return { date, id, sessionData };
}
