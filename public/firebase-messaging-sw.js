/* Veralteter Root-Service-Worker (Scope "/"). Keine App registriert ihn mehr: Push läuft über
 *   Fitness: /fitness-messaging-sw.js (Scope /fitness-push/)   VitalOS: /vitalos-messaging-sw.js
 *   6Pack:   /sixpack-messaging-sw.js (Scope /sixpack-push/)
 * Auf Geräten mit alter Registrierung zeigte dieser SW JEDE Push-Nachricht ohne app-Filter an
 * (auch 6Pack-/andere Apps) und doppelte damit die Meldungen des dedizierten SW.
 * Er behandelt deshalb kein Push-Ereignis mehr und meldet sich beim Aktivieren selbst ab. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    try { await self.registration.unregister(); } catch (_) { /* nichts zu tun */ }
  })());
});
