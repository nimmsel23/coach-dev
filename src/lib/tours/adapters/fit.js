// adapters/fit.js — FIT-Datei-Import (natives Binärformat von Garmin/Polar/
// Suunto/Wahoo — Garmin Connect exportiert es 1:1, Strava/Komoot akzeptieren
// dasselbe Format als Upload).
// fit-file-parser (aktiv gepflegt, Stand 2026-09-23: v6.1.2, zuletzt
// veröffentlicht vor 16 Tagen) — importiert intern das npm-Polyfill-Paket
// "buffer" (kein Node-Built-in im Browser), separat als Dependency installiert.
import FitParser from 'fit-file-parser';
import { round1, round2 } from '../schema.js';

/**
 * @param {File} file
 * @returns {Promise<object>} RawTour (siehe lib/tours/schema.js)
 */
export async function parseFitFile(file) {
  const buffer = await file.arrayBuffer();
  const parser = new FitParser({
    mode: 'list',
    speedUnit: 'km/h',
    lengthUnit: 'km',
    elapsedRecordField: true,
  });

  let data;
  try {
    data = await parser.parseAsync(buffer);
  } catch (err) {
    throw new Error(`FIT konnte nicht gelesen werden: ${typeof err === 'string' ? err : err?.message || 'unbekannter Fehler'}`);
  }

  const session = Array.isArray(data?.sessions) ? data.sessions[0] : null;
  if (!session) {
    throw new Error('Keine Session-Zusammenfassung in dieser FIT-Datei gefunden.');
  }

  const distanceKm = session.total_distance != null ? session.total_distance : null;
  const durationSec = session.total_timer_time ?? session.total_elapsed_time ?? null;
  const durationMin = durationSec ? Math.round(durationSec / 60) : null;
  const avgSpeedKmh = session.avg_speed != null
    ? round1(session.avg_speed)
    : (distanceKm != null && durationSec ? round1(distanceKm / (durationSec / 3600)) : null);
  const maxSpeedKmh = session.max_speed != null ? round1(session.max_speed) : null;
  const elevationGainM = session.total_ascent != null ? Math.round(session.total_ascent) : null;
  const date = (session.start_time ? new Date(session.start_time) : new Date()).toISOString().slice(0, 10);

  return {
    source: 'fit',
    date,
    distanceKm: distanceKm != null ? round2(distanceKm) : null,
    durationMin,
    avgSpeedKmh,
    maxSpeedKmh,
    elevationGainM,
    notes: `Import aus FIT-Datei (${file.name})`,
  };
}
