// Garmin Connect API — https://developer.garmin.com/gc-developer-program/
// Braucht Partner-Zugang (Garmin genehmigt Zugriff manuell, kein Self-Service
// OAuth wie bei Google). Nicht konfiguriert, siehe liveAdapter.js.
import { makeLiveAdapter } from './liveAdapter.js';

export const garminAdapter = makeLiveAdapter({
  id: 'garmin_connect',
  label: 'Garmin Connect',
  docsUrl: 'https://developer.garmin.com/gc-developer-program/',
  note: 'Braucht genehmigten Garmin-Connect-Developer-Zugang (kein Self-Service-OAuth). Bis dahin: GPX/TCX/FIT-Export aus Garmin Connect manuell hochladen.',
});
