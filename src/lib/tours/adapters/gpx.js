// adapters/gpx.js — GPX-Datei-Import (Garmin Connect Export, Strava Export,
// Google Fit Takeout, so gut wie jeder Tracker kann GPX exportieren).
// Nutzt @we-gold/gpxjs (aktiv gepflegt, Stand 2026-09-23: v1.2.0, zuletzt
// aktualisiert 2026-07-04) — reine Browser-API (DOMParser), kein Node nötig.
import { parseGPX } from '@we-gold/gpxjs';
import { round1, round2 } from '../schema.js';

function computeMaxSpeedKmh(points) {
  if (!Array.isArray(points) || points.length < 2) return null;
  let max = 0;
  for (let i = 1; i < points.length; i++) {
    const p0 = points[i - 1];
    const p1 = points[i];
    if (!p0?.time || !p1?.time) continue;
    const dtH = (new Date(p1.time) - new Date(p0.time)) / 3_600_000;
    if (dtH <= 0) continue;
    const dLatRad = ((p1.latitude - p0.latitude) * Math.PI) / 180;
    const dLonRad = ((p1.longitude - p0.longitude) * Math.PI) / 180;
    const lat0Rad = (p0.latitude * Math.PI) / 180;
    const lat1Rad = (p1.latitude * Math.PI) / 180;
    const a = Math.sin(dLatRad / 2) ** 2 + Math.cos(lat0Rad) * Math.cos(lat1Rad) * Math.sin(dLonRad / 2) ** 2;
    const distM = 2 * 6371e3 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const speedKmh = (distM / 1000) / dtH;
    // GPS-Ausreißer (Sprünge durch schlechten Empfang) abfangen — realistische
    // Rad-Höchstgeschwindigkeit liegt praktisch nie über ~110 km/h.
    if (speedKmh > 0 && speedKmh < 110 && speedKmh > max) max = speedKmh;
  }
  return max > 0 ? round1(max) : null;
}

/**
 * @param {File} file
 * @returns {Promise<object>} RawTour (siehe lib/tours/schema.js)
 */
export async function parseGpxFile(file) {
  const text = await file.text();
  const [parsed, error] = parseGPX(text);
  if (error || !parsed) {
    throw new Error(`GPX konnte nicht gelesen werden: ${error?.message || 'unbekanntes Format'}`);
  }
  const track = parsed.tracks?.[0] || parsed.routes?.[0];
  if (!track || !Array.isArray(track.points) || track.points.length === 0) {
    throw new Error('Keine Track-Punkte in dieser GPX-Datei gefunden.');
  }

  const distanceKm = track.distance?.total != null ? track.distance.total / 1000 : null;
  const durationSec = track.duration?.movingDuration || track.duration?.totalDuration || null;
  const durationMin = durationSec ? Math.round(durationSec / 60) : null;
  const elevationGainM = track.elevation?.positive != null ? Math.round(track.elevation.positive) : null;
  const avgSpeedKmh = distanceKm != null && durationSec ? round1(distanceKm / (durationSec / 3600)) : null;
  const maxSpeedKmh = computeMaxSpeedKmh(track.points);
  const startTime = track.duration?.startTime || track.points[0]?.time || parsed.metadata?.time || null;
  const date = (startTime ? new Date(startTime) : new Date()).toISOString().slice(0, 10);

  return {
    source: 'gpx',
    date,
    distanceKm: distanceKm != null ? round2(distanceKm) : null,
    durationMin,
    avgSpeedKmh,
    maxSpeedKmh,
    elevationGainM,
    notes: `Import aus GPX-Datei (${file.name})`,
  };
}
