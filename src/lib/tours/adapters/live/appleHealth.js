// Apple Health — kein öffentliches REST-API-Live-Sync für Web-Apps (HealthKit
// ist iOS-nativ). Realistischer Weg bleibt der manuelle "Health"-App-Export
// (ZIP mit export.xml, in GPX/TCX konvertierbar) statt einer Live-Verbindung.
import { makeLiveAdapter } from './liveAdapter.js';

export const appleHealthAdapter = makeLiveAdapter({
  id: 'apple_health',
  label: 'Apple Health',
  docsUrl: 'https://developer.apple.com/documentation/healthkit',
  note: 'Kein Web-API-Live-Sync möglich (HealthKit ist iOS-nativ) — Weg bleibt manueller Export aus der Health-App (export.xml) → GPX/TCX-Import oben nutzen.',
});
