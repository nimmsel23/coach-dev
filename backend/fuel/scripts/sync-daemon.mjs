// Fuel Firestore-Sync als eigener Dienst — ohne Fastify.
// Startet nur den stündlichen Pull-Scheduler + die Realtime-Katalog-Listener aus
// firestore-admin.mjs (dieselbe Engine wie im Server, kein zweiter Code-Pfad).
// Push läuft weiterhin beim Schreiben (Server-Routen); dieser Dienst zieht Cloud → lokal.
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Muss vor dem firestore-admin-Import laufen (FUEL_CLOUD_UID wird beim Modul-Load gelesen).
// Deploy-Layout: .env eine Ebene über scripts/. Dev-Layout (fuel-backend/scripts): .env im Nachbar-Repo fuel-dev.
for (const envPath of [path.join(__dirname, "..", ".env"), path.join(__dirname, "..", "..", "fuel-dev", ".env")]) {
  try {
    process.loadEnvFile(envPath);
    break;
  } catch {
    // .env optional
  }
}

const { startFirestorePullScheduler, getDb } = await import("../src/server/lib/firestore-admin.mjs");

if (!getDb()) {
  console.error("[fuel-sync] Firestore nicht verfügbar (Service-Account fehlt?) — Abbruch");
  process.exit(1);
}

startFirestorePullScheduler();

for (const sig of ["SIGTERM", "SIGINT"]) {
  process.on(sig, () => {
    console.log(`[fuel-sync] ${sig} — beende`);
    process.exit(0);
  });
}
