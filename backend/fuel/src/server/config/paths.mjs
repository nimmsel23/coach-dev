import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";
import { getClientInfo } from "../lib/client-manager.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Deploy-Layout (flach): src/server/config -> drei Ebenen bis zum App-Root.
// Dev-Layout (eigenes Repo fuel-backend): Katalog/dist/public liegen im
// Nachbar-Repo fuel-dev, überschreibbar per FUEL_ROOT.
const BACKEND_ROOT = path.join(__dirname, "../../..");
const ROOT = process.env.FUEL_ROOT
  ? path.resolve(process.env.FUEL_ROOT)
  : path.basename(BACKEND_ROOT) === "fuel-backend"
    ? path.join(path.dirname(BACKEND_ROOT), "fuel-dev")
    : BACKEND_ROOT;

export const GLOBAL_DATA_DIR = process.env.AOS_FUEL_DATA_DIR
  ? path.resolve(process.env.AOS_FUEL_DATA_DIR)
  : path.join(os.homedir(), ".aos", "fuel");

export const CATALOGS_DIR = path.join(ROOT, "catalogs");
export const FUEL_DIR = path.join(GLOBAL_DATA_DIR, "fuel");
export const NUTRITION_DIR_REPO = path.join(ROOT, "catalogs", "nutrition");
export const NUTRITION_MEALS_DIR = path.join(NUTRITION_DIR_REPO, "meals");
export const NUTRITION_INGREDIENTS_DIR = path.join(NUTRITION_DIR_REPO, "ingredients");
export const SUPPLEMENTS_CATALOG_PATH = path.join(ROOT, "catalogs", "supplements", "catalog.yaml");
export const PUBLIC_DIR = path.join(ROOT, "public");
export const VITE_BUILD_DIR = process.env.FUEL_BUILD_DIR ? path.resolve(process.env.FUEL_BUILD_DIR) : path.join(ROOT, "dist");
export const STATIC_DIR = process.env.FUEL_STATIC_DIR ? path.resolve(process.env.FUEL_STATIC_DIR) : VITE_BUILD_DIR;

export function getPaths(clientId = null) {
  let baseDir = GLOBAL_DATA_DIR;
  
  if (clientId) {
    const client = getClientInfo(clientId);
    if (client) {
      // If client has a UID, they might have data in .aos/fuel/users/<uid>
      if (client.firebase_uid) {
        baseDir = path.join(GLOBAL_DATA_DIR, "users", client.firebase_uid);
      }
    }
  }

  const paths = {
    dataDir: baseDir,
    fuel: path.join(baseDir, "fuel"),
    nutrition: path.join(baseDir, "nutrition"),
    nutritionJournal: path.join(baseDir, "nutrition_journal"),
    supplements: path.join(baseDir, "supplements"),
    supplementsLog: path.join(baseDir, "supplements", "logs"),
    nutritionDb: path.join(baseDir, "nutrition", "nutrition.db"),
    // Repo-based catalogs
    nutritionMealsRepo: NUTRITION_MEALS_DIR,
    supplementsCatalogRepo: SUPPLEMENTS_CATALOG_PATH,
  };

  // Ensure directories exist
  if (!fs.existsSync(baseDir)) fs.mkdirSync(baseDir, { recursive: true });
  for (const p of [paths.fuel, paths.nutrition, paths.nutritionJournal, paths.supplements, paths.supplementsLog]) {
    if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
  }

  return paths;
}

// Backwards compatibility for single-user mode
export const DATA_DIR = GLOBAL_DATA_DIR;
export const NUTRITION_DIR = path.join(DATA_DIR, "nutrition");
export const NUTRITION_JOURNAL_DIR = path.join(DATA_DIR, "nutrition_journal");
export const NUTRITION_DB_PATH = path.join(NUTRITION_DIR, "nutrition.db");
export const SUPPLEMENTS_LOG_DIR = path.join(DATA_DIR, "supplements", "logs");

export function initializePaths() {
  getPaths(); // Initialize default paths
}
