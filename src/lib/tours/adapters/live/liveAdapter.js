// adapters/live/liveAdapter.js — gemeinsame Form für OAuth-/Live-Connector-
// Stubs. KEIN dieser Adapter ist tatsächlich verbunden — es gibt aktuell
// keine konfigurierten API-Keys/OAuth-Client-IDs für Google Fit/Garmin/
// Apple Health/Huawei Health in ~/.env/ (verifiziert 2026-09-23). Ein
// `connect()`-Aufruf wirft absichtlich, statt eine funktionierende
// Verbindung vorzutäuschen (Alpha-Code: Real/Raw/Relevant, keine Fake-Daten).
export function makeLiveAdapter({ id, label, docsUrl, note }) {
  return {
    id,
    label,
    configured: false,
    docsUrl,
    note,
    async connect() {
      throw new Error(
        `${label}: nicht konfiguriert. Es fehlt ein echter API-Key/OAuth-Client (siehe ~/.env/). ` +
        `TODO: Credentials besorgen, siehe ${docsUrl}.`
      );
    },
    async fetchTours() {
      throw new Error(`${label}: nicht konfiguriert — kein Live-Import möglich, solange kein API-Zugang eingerichtet ist.`);
    },
  };
}
