// adapters/tcx.js — TCX-Datei-Import (Garmin Connect Export, Training
// Center XML — Standardformat von Garmin-Geräten, auch von Strava/Polar
// exportierbar). Handgeschriebener DOMParser statt fremder Bibliothek: TCX
// ist ein simples, stabiles XML-Schema (<Lap>/<Trackpoint>-Elemente mit klar
// benannten Feldern), eine dedizierte npm-Lib (z.B. @tmcw/togeojson) würde
// hier nur GeoJSON-Geometrie liefern, keine Lap-Aggregate — für die reinen
// Kennzahlen (Distanz/Dauer/Höhenmeter/Speed) ist Handparsing robuster als
// ein zusätzlicher, im GPX/TCX/FIT-Ökosystem teils verwaister Dependency-Layer.
import { round1, round2 } from '../schema.js';

function text(el, tag) {
  const node = el?.getElementsByTagName(tag)?.[0];
  return node ? node.textContent.trim() : null;
}
function num(el, tag) {
  const v = text(el, tag);
  const n = v != null ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {File} file
 * @returns {Promise<object>} RawTour (siehe lib/tours/schema.js)
 */
export async function parseTcxFile(file) {
  const text_ = await file.text();
  const doc = new DOMParser().parseFromString(text_, 'application/xml');
  if (doc.querySelector('parsererror')) {
    throw new Error('TCX konnte nicht als XML gelesen werden.');
  }

  const laps = Array.from(doc.getElementsByTagName('Lap'));
  if (laps.length === 0) {
    throw new Error('Keine <Lap>-Daten in dieser TCX-Datei gefunden.');
  }

  let totalDistanceM = 0;
  let totalTimeSec = 0;
  let maxSpeedMs = 0;
  const trackpoints = [];

  for (const lap of laps) {
    totalDistanceM += num(lap, 'DistanceMeters') || 0;
    totalTimeSec += num(lap, 'TotalTimeSeconds') || 0;
    const lapMaxSpeed = num(lap, 'MaximumSpeed'); // m/s, Garmin-Extension, optional
    if (lapMaxSpeed && lapMaxSpeed > maxSpeedMs) maxSpeedMs = lapMaxSpeed;
    for (const tp of Array.from(lap.getElementsByTagName('Trackpoint'))) {
      trackpoints.push({
        time: text(tp, 'Time'),
        altitudeM: num(tp, 'AltitudeMeters'),
      });
    }
  }

  if (totalDistanceM === 0 && trackpoints.length > 1) {
    // Fallback: manche Exporte tragen DistanceMeters nur pro Trackpoint
    // (kumulativ), nicht pro Lap.
    const perPoint = laps.flatMap((lap) => Array.from(lap.getElementsByTagName('Trackpoint')).map((tp) => num(tp, 'DistanceMeters')).filter((v) => v != null));
    if (perPoint.length > 1) totalDistanceM = Math.max(...perPoint) - Math.min(...perPoint);
  }

  let elevationGainM = null;
  const altitudes = trackpoints.map((tp) => tp.altitudeM).filter((v) => v != null);
  if (altitudes.length > 1) {
    let gain = 0;
    for (let i = 1; i < altitudes.length; i++) {
      const delta = altitudes[i] - altitudes[i - 1];
      if (delta > 0) gain += delta;
    }
    elevationGainM = Math.round(gain);
  }

  if (!maxSpeedMs && trackpoints.length > 1) {
    // Kein Lap-MaximumSpeed vorhanden — grobe Schätzung über die Gesamtzeit
    // ist nicht möglich, ohne Segment-Distanzen; ohne Per-Punkt-Distanz
    // bleibt maxSpeedKmh dann bewusst null statt erfunden.
  }

  const durationMin = totalTimeSec ? Math.round(totalTimeSec / 60) : null;
  const distanceKm = totalDistanceM ? totalDistanceM / 1000 : null;
  const avgSpeedKmh = distanceKm != null && totalTimeSec ? round1(distanceKm / (totalTimeSec / 3600)) : null;
  const maxSpeedKmh = maxSpeedMs ? round1(maxSpeedMs * 3.6) : null;
  const startTime = text(laps[0], 'Id') || trackpoints[0]?.time || null;
  const date = (startTime ? new Date(startTime) : new Date()).toISOString().slice(0, 10);

  return {
    source: 'tcx',
    date,
    distanceKm: distanceKm != null ? round2(distanceKm) : null,
    durationMin,
    avgSpeedKmh,
    maxSpeedKmh,
    elevationGainM,
    notes: `Import aus TCX-Datei (${file.name})`,
  };
}
