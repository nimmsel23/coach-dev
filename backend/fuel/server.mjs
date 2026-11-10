import path from "path";
import { fileURLToPath } from "url";

// Node lädt .env nie von selbst (kein dotenv im Projekt) — ohne diesen
// Schritt bleibt FUEL_CLOUD_UID (und jede andere Var aus .env) immer
// undefined, egal ob dev oder prod. Muss vor dem app.mjs-Import laufen,
// da firestore-admin.mjs process.env.FUEL_CLOUD_UID beim Modul-Load liest.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Deploy-Layout (flach): .env neben server.mjs. Dev-Layout: .env im Nachbar-Repo fuel-dev.
for (const envPath of [path.join(__dirname, ".env"), path.join(__dirname, "..", "fuel-dev", ".env")]) {
  try {
    process.loadEnvFile(envPath);
    break;
  } catch {
    // .env optional (z.B. CI) — fehlende Datei ist kein Fehler
  }
}

const { startServer } = await import("./src/server/app.mjs");

startServer().catch((err) => {
  console.error(err);
  process.exit(1);
});
