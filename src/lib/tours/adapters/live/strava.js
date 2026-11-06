// Strava — echter OAuth2-Live-Adapter (kein Stub wie garmin.js/googleFit.js).
// Der komplette OAuth-Austausch (client_secret, Token-Refresh) läuft
// serverseitig in server.mjs/strava-integration.mjs — hier nur die
// Browser-seitigen Redirect-/Fetch-Aufrufe. Setup-Anleitung: docs/STRAVA_SETUP.md.
import { getUid } from '@db';
const BASE = `${(import.meta.env.VITE_API_BASE || '').replace(/\/$/, '')}/tours/strava`;
const endpoint = route => `${BASE}/${route}?uid=${encodeURIComponent(getUid())}`;

export const stravaAdapter = {
  id: 'strava',
  label: 'Strava',
  live: true,
  configured: true, // echter Code-Pfad — ob Client-ID/Secret hinterlegt sind, klärt status()/connect() zur Laufzeit
  docsUrl: 'https://www.strava.com/settings/api',
  note: 'Strava-Account per OAuth verbinden — Radtouren werden danach automatisch importiert (kein Datei-Export nötig).',

  async status() {
    const res = await fetch(endpoint('status'));
    return res.json();
  },

  async connect() {
    window.location.href = endpoint('authorize');
  },

  async fetchTours() {
    const res = await fetch(endpoint('activities'));
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data?.error || 'Strava-Import fehlgeschlagen.');
    return data.tours;
  },

  async disconnect() {
    await fetch(endpoint('disconnect'), { method: 'POST' });
  },
};
