// adapters/index.js — Registry der Radtour-Importer. Erweiterbares
// Adapter-Pattern: FILE_ADAPTERS parsen tatsächlich lauffähig (kein
// externer API-Zugang nötig, reiner Client-seitiger Datei-Parse).
// LIVE_ADAPTERS sind Stubs mit `configured: false` — ehrlich markiert,
// bis echte API-Keys/OAuth-Clients existieren (siehe live/liveAdapter.js).
import { parseGpxFile } from './gpx.js';
import { parseTcxFile } from './tcx.js';
import { parseFitFile } from './fit.js';
import { googleFitAdapter } from './live/googleFit.js';
import { garminAdapter } from './live/garmin.js';
import { appleHealthAdapter } from './live/appleHealth.js';
import { huaweiAdapter } from './live/huawei.js';
// @tours-strava: Vite-Alias (vite.config.js), löst je nach Build-Modus auf
// ./strava.js (Dev/Node-Backend, server.mjs) oder ./strava.firestore.js
// (Firebase-Build, Cloud Functions) — analog zum bestehenden @db-Muster.
import { stravaAdapter } from '@tours-strava';

export const FILE_ADAPTERS = [
  { id: 'gpx', label: 'GPX', extensions: ['.gpx'], parse: parseGpxFile },
  { id: 'tcx', label: 'TCX', extensions: ['.tcx'], parse: parseTcxFile },
  { id: 'fit', label: 'FIT', extensions: ['.fit'], parse: parseFitFile },
];

// Strava zuerst: einziger Adapter mit echtem Code-Pfad (Self-Service-OAuth),
// die anderen drei bleiben ehrliche Stubs (Partner-Approval/kein API nötig).
export const LIVE_ADAPTERS = [
  stravaAdapter,
  googleFitAdapter,
  garminAdapter,
  appleHealthAdapter,
  huaweiAdapter,
];

export function findFileAdapterFor(filename) {
  const lower = String(filename || '').toLowerCase();
  return FILE_ADAPTERS.find((a) => a.extensions.some((ext) => lower.endsWith(ext))) || null;
}

/** Alle unterstützten Datei-Endungen, z.B. für <input accept="..."> */
export function fileAdapterAccept() {
  return FILE_ADAPTERS.flatMap((a) => a.extensions).join(',');
}
