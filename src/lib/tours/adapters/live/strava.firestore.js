// Strava — Firebase-Build-Variante (Cloud Functions statt Node-Backend).
// Wird per @tours-strava-Alias (vite.config.js) anstelle von strava.js
// geladen, wenn `npm run build:firebase`/`build:coach` läuft. Gleiche
// öffentliche Form wie strava.js (connect/fetchTours/status/disconnect),
// damit adapters/index.js + TourImportPanel.jsx unverändert bleiben.
import { functionsInstance, httpsCallable } from '../../../../firebase.js';

export const stravaAdapter = {
  id: 'strava',
  label: 'Strava',
  live: true,
  configured: true,
  docsUrl: 'https://www.strava.com/settings/api',
  note: 'Strava-Account per OAuth verbinden — Radtouren werden danach automatisch importiert (kein Datei-Export nötig).',

  async status() {
    const call = httpsCallable(functionsInstance, 'stravaStatus');
    const res = await call();
    return res.data;
  },

  async connect() {
    const call = httpsCallable(functionsInstance, 'stravaAuthorizeUrl');
    const res = await call();
    window.location.href = res.data.url;
  },

  async fetchTours() {
    const call = httpsCallable(functionsInstance, 'stravaActivities');
    const res = await call();
    return res.data.tours;
  },

  async disconnect() {
    const call = httpsCallable(functionsInstance, 'stravaDisconnect');
    await call();
  },
};
