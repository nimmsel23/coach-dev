import { execFile } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, "..", "..", "..");

// Fire-and-forget: prüft einen frisch angelegten Catalog-Eintrag per
// Haiku-CLI + WebSearch gegen offizielle Herstellerangaben (fuel/catalog_verify.py),
// korrigiert die YAML bei Treffer direkt. Läuft asynchron im Hintergrund,
// blockiert also nie die Catalog-Save-Response.
export function verifyCatalogItemAsync(itemId) {
  if (!itemId) return;
  execFile(
    "python3",
    ["-m", "fuel.catalog_verify", "verify-one", itemId],
    { cwd: REPO_ROOT, timeout: 130_000 },
    (error, stdout, stderr) => {
      if (error) {
        console.error(`[catalog-verify] ${itemId} failed:`, stderr || error.message);
        return;
      }
      console.log(`[catalog-verify] ${itemId}:`, stdout.trim());
    }
  );
}
