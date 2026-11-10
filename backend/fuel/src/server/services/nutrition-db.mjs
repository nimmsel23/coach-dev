import { OMEGA3_KEYS } from "../../shared/config/omega3.mjs";
import { mealDetails } from "../../client/lib/mealDetails.js";
import Database from "better-sqlite3";
import path from "path";
import { NUTRITION_DB_PATH } from "../config/paths.mjs";
import { MICRO_KEYS } from "../../shared/config/dach.mjs";
import { pushNutritionLog } from "../lib/firestore-admin.mjs";
import { addDeletedMealId, addDeletedMealIds, getDeletedMealIds, removeDeletedMealId } from "./log-tombstones.mjs";

const dbByPath = new Map();

function resolveDbPath(options = {}) {
  return options.nutritionDbPath
    || (options.nutritionDir ? path.join(options.nutritionDir, "nutrition.db") : null)
    || NUTRITION_DB_PATH;
}

function getDb(options = {}) {
  const dbPath = resolveDbPath(options);
  let db = dbByPath.get(dbPath);
  if (!db) {
    db = new Database(dbPath);
    db.pragma("journal_mode = WAL");
    initDb(db);
    dbByPath.set(dbPath, db);
  }
  return db;
}

function initDb(db) {

  // Wger ingredient cache — macros per 100g
  db.exec(`
    CREATE TABLE IF NOT EXISTS ingredients (
      id         INTEGER PRIMARY KEY,
      wger_id    INTEGER UNIQUE,
      name       TEXT NOT NULL,
      brand      TEXT,
      kcal       REAL,
      protein    REAL,
      carbs      REAL,
      fat        REAL,
      fiber      REAL,
      sodium_mg  REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_ingredients_wger_id ON ingredients(wger_id);
    CREATE INDEX IF NOT EXISTS idx_ingredients_name    ON ingredients(name COLLATE NOCASE);
  `);

  // Meal micronutrient profiles — Gemini-estimated absolute values per meal as eaten
  db.exec(`
    CREATE TABLE IF NOT EXISTS meal_micros (
      id               INTEGER PRIMARY KEY,
      meal_name        TEXT UNIQUE NOT NULL,
      vitamin_b12_ug   REAL DEFAULT 0,
      calcium_mg       REAL DEFAULT 0,
      iron_mg          REAL DEFAULT 0,
      vitamin_d_ug     REAL DEFAULT 0,
      vitamin_e_mg     REAL DEFAULT 0,
      folate_ug        REAL DEFAULT 0,
      magnesium_mg     REAL DEFAULT 0,
      zinc_mg          REAL DEFAULT 0,
      sodium_mg        REAL DEFAULT 0,
      potassium_mg     REAL DEFAULT 0,
      vitamin_c_mg     REAL DEFAULT 0,
      vitamin_b6_mg    REAL DEFAULT 0,
      vitamin_b1_mg    REAL DEFAULT 0,
      vitamin_b2_mg    REAL DEFAULT 0,
      phosphorus_mg    REAL DEFAULT 0,
      selenium_ug      REAL DEFAULT 0,
      iodine_ug        REAL DEFAULT 0,
      source           TEXT DEFAULT 'gemini',
      created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at       DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_meal_micros_name ON meal_micros(meal_name COLLATE NOCASE);
  `);

  // name_key: normalisierter Signatur-Key (siehe normalizeMicroKey unten).
  // Grund: Freitext-Logs derselben Mahlzeit ("125g Käsleberkäse + Semmel",
  // "2x Käseleberkäsesemmel", "400g Käsleberkäse mit 4 Semmeln BILLA", ...)
  // erzeugten bisher JEDES Mal eine neue Gemini-Schätzung, weil meal_name
  // exakt (COLLATE NOCASE) verglichen wurde. 11 Varianten desselben Gerichts
  // landeten so als 11 unabhängig halluzinierte Zeilen (u.a. Omega-3 zwischen
  // 120–600mg für ein Leberkäse-Gericht ohne jede Omega-3-Quelle, 2026-07-30
  // entdeckt). name_key gruppiert Varianten VOR dem nächsten Gemini-Call.
  try { db.exec(`ALTER TABLE meal_micros ADD COLUMN name_key TEXT`); } catch { /* column exists */ }
  db.exec(`CREATE INDEX IF NOT EXISTS idx_meal_micros_name_key ON meal_micros(name_key)`);

  // Migrate existing DBs: alle MICRO_KEYS (Quelle: shared/config/dach.mjs)
  // + kcal idempotent nachziehen — neue Nährstoffe landen automatisch hier,
  // ohne diese Liste manuell zu pflegen. ALTER TABLE wirft bei bereits
  // vorhandener Spalte, das ist der erwartete No-Op-Pfad.
  const newCols = ["kcal REAL", ...MICRO_KEYS.map((k) => `${k} REAL${OMEGA3_KEYS.includes(k) ? "" : " DEFAULT 0"}`)];
  for (const col of newCols) {
    try { db.exec(`ALTER TABLE meal_micros ADD COLUMN ${col}`); } catch { /* column exists */ }
  }
  try { db.exec(`ALTER TABLE meals ADD COLUMN micros_meta_json TEXT`); } catch { /* column exists */ }

  // Tages-Log als normalisierte Rows statt JSON-Blob-pro-Tag. Grund: der
  // Firestore-Sync (firestored push_fuel) pusht bisher den kompletten
  // Tages-JSON-Blob als EIN Dokument — Firestore-merge=True ersetzt
  // Array-Felder ('meals') komplett statt sie zu mergen, was am 2026-07-23
  // zu echtem Datenverlust führte (App-Einträge durch lokalen CLI-Log
  // überschrieben). Mit einer Row pro Meal (id = Primary Key) kann ein
  // künftiger Row-basierter Sync einzelne Einträge upserten, ohne
  // gleichzeitig bestehende fremde Rows zu zerstören. JSON-Dateien bleiben
  // vorerst parallel bestehen (Migration/Fallback), SQLite ist die neue
  // Source of Truth für den Server-Schreibpfad.
  db.exec(`
    CREATE TABLE IF NOT EXISTS meals (
      id          TEXT PRIMARY KEY,
      date        TEXT NOT NULL,
      catalog_id  TEXT,
      type        TEXT DEFAULT 'meal',
      description TEXT NOT NULL,
      notes       TEXT DEFAULT '',
      kcal        REAL DEFAULT 0,
      protein     REAL DEFAULT 0,
      carbs       REAL DEFAULT 0,
      fat         REAL DEFAULT 0,
      micros_json TEXT,
      micros_meta_json TEXT,
      logged_at   TEXT,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_meals_date ON meals(date);

    CREATE TABLE IF NOT EXISTS daily_water (
      date       TEXT PRIMARY KEY,
      water_ml   REAL DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  try { db.exec(`ALTER TABLE meals ADD COLUMN details_json TEXT`); } catch { /* column exists */ }
}

// ── Meals (Tages-Log, normalisiert) ───────────────────────────────────────────

export function upsertMeal(meal, options = {}) {
  const db = getDb(options);
  const nutritionDir = options.nutritionDir || (options.nutritionDbPath ? path.dirname(options.nutritionDbPath) : null);
  const uid = options.uid || "default";
  db.prepare(`
    INSERT INTO meals (id, date, catalog_id, type, description, notes, kcal, protein, carbs, fat, micros_json, micros_meta_json, details_json, logged_at)
    VALUES (@id, @date, @catalog_id, @type, @description, @notes, @kcal, @protein, @carbs, @fat, @micros_json, @micros_meta_json, @details_json, @logged_at)
    ON CONFLICT(id) DO UPDATE SET
      date = excluded.date, catalog_id = excluded.catalog_id, type = excluded.type,
      description = excluded.description, notes = excluded.notes,
      kcal = excluded.kcal, protein = excluded.protein, carbs = excluded.carbs, fat = excluded.fat,
      micros_json = excluded.micros_json, micros_meta_json = excluded.micros_meta_json, details_json = excluded.details_json, logged_at = excluded.logged_at,
      updated_at = CURRENT_TIMESTAMP
  `).run({
    id: meal.id,
    date: meal.date,
    catalog_id: meal.catalog_id ?? null,
    type: meal.type ?? "meal",
    description: meal.description,
    notes: meal.notes ?? "",
    kcal: meal.kcal ?? 0,
    protein: meal.protein ?? 0,
    carbs: meal.carbs ?? 0,
    fat: meal.fat ?? 0,
    details_json: JSON.stringify(mealDetails(meal)),
    micros_json: meal.micros ? JSON.stringify(meal.micros) : null,
    micros_meta_json: meal.micros_meta ? JSON.stringify(meal.micros_meta) : null,
    logged_at: meal.logged_at ?? meal.time ?? null,
  });
  removeDeletedMealId(meal.date, meal.id, nutritionDir || undefined);
  // skipPush: der Pull aus Firestore schreibt lokal, ohne die Daten zurückzuschicken
  if (options.skipPush) return;
  // Fire-and-forget push
  const date = meal.date;
  pushNutritionLog(
    date,
    getMealsForDate(date, options),
    getWater(date, options),
    { uid, nutritionDir }
  ).catch(() => {});
}

export function deleteMeal(id, options = {}) {
  const db = getDb(options);
  const nutritionDir = options.nutritionDir || (options.nutritionDbPath ? path.dirname(options.nutritionDbPath) : null);
  const uid = options.uid || "default";
  const row = db.prepare("SELECT date FROM meals WHERE id = ?").get(id);
  const result = db.prepare("DELETE FROM meals WHERE id = ?").run(id);
  // Fire-and-forget push
  if (row?.date) {
    addDeletedMealId(row.date, id, nutritionDir || undefined);
    pushNutritionLog(
      row.date,
      getMealsForDate(row.date, options),
      getWater(row.date, options),
      { uid, nutritionDir }
    ).catch(() => {});
  }
  return result;
}

export function deleteMealsByIds(date, ids = [], options = {}) {
  const unique = Array.from(new Set((ids || []).filter(Boolean)));
  if (unique.length === 0) return 0;
  const db = getDb(options);
  const nutritionDir = options.nutritionDir || (options.nutritionDbPath ? path.dirname(options.nutritionDbPath) : null);
  const stmt = db.prepare("DELETE FROM meals WHERE date = ? AND id = ?");
  const runMany = db.transaction((mealIds) => {
    let count = 0;
    for (const id of mealIds) {
      count += stmt.run(date, id).changes;
    }
    return count;
  });
  const count = runMany(unique);
  addDeletedMealIds(date, unique, nutritionDir || undefined);
  return count;
}

export function getMealsForDate(date, options = {}) {
  const rows = getDb(options).prepare("SELECT * FROM meals WHERE date = ? ORDER BY logged_at, id").all(date);
  return rows.map((r) => {
    const { micros_json, micros_meta_json, details_json, ...rest } = r;
    if (details_json) Object.assign(rest, JSON.parse(details_json));
    // `undefined` statt gelöschtem Key wurde von Firestore Admin abgelehnt
    // ("Cannot use 'undefined' as a Firestore value") — deshalb Destructuring
    // statt `micros_json: undefined`, damit der Key im Objekt fehlt statt
    // nur einen undefined-Wert zu tragen.
    if (micros_json) rest.micros = JSON.parse(micros_json);
    if (micros_meta_json) rest.micros_meta = JSON.parse(micros_meta_json);
    return rest;
  });
}

export function getMealDates(options = {}) {
  return getDb(options)
    .prepare("SELECT date FROM meals GROUP BY date ORDER BY date DESC")
    .all()
    .map((row) => row.date);
}

export function upsertWater(date, waterMl, options = {}) {
  const db = getDb(options);
  const nutritionDir = options.nutritionDir || (options.nutritionDbPath ? path.dirname(options.nutritionDbPath) : null);
  const uid = options.uid || "default";
  db.prepare(`
    INSERT INTO daily_water (date, water_ml) VALUES (?, ?)
    ON CONFLICT(date) DO UPDATE SET water_ml = excluded.water_ml, updated_at = CURRENT_TIMESTAMP
  `).run(date, waterMl);
  if (options.skipPush) return;
  // Fire-and-forget push
  pushNutritionLog(date, getMealsForDate(date, options), waterMl, { uid, nutritionDir }).catch(() => {});
}

export function getWater(date, options = {}) {
  const row = getDb(options).prepare("SELECT water_ml FROM daily_water WHERE date = ?").get(date);
  return row ? row.water_ml : 0;
}

export function getNutritionDeletedIds(date, options = {}) {
  const nutritionDir = options.nutritionDir || (options.nutritionDbPath ? path.dirname(options.nutritionDbPath) : null);
  return getDeletedMealIds(date, nutritionDir || undefined);
}

// ── Ingredients (wger cache) ──────────────────────────────────────────────────

export function upsertIngredient(wgerId, data, options = {}) {
  return getDb(options).prepare(`
    INSERT INTO ingredients (wger_id, name, brand, kcal, protein, carbs, fat, fiber, sodium_mg)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(wger_id) DO UPDATE SET
      name = excluded.name, brand = excluded.brand,
      kcal = excluded.kcal, protein = excluded.protein,
      carbs = excluded.carbs, fat = excluded.fat,
      fiber = excluded.fiber, sodium_mg = excluded.sodium_mg,
      updated_at = CURRENT_TIMESTAMP
  `).run(
    wgerId, data.name, data.brand || null,
    data.kcal ?? null, data.protein ?? null,
    data.carbs ?? null, data.fat ?? null,
    data.fiber ?? null, data.sodium_mg ?? null
  );
}

export function getIngredientByWgerId(wgerId, options = {}) {
  return getDb(options).prepare("SELECT * FROM ingredients WHERE wger_id = ?").get(wgerId) || null;
}

// ── Meal micros ───────────────────────────────────────────────────────────────

const MICRO_COLS = MICRO_KEYS;

// Bekannte Rechtschreib-/Fugen-Varianten und zusammengeschriebene Formen aus
// echten Logs (z.B. "Käsleberkäse" vs "Käseleberkäse", "Käseleberkäsesemmel"
// als ein Wort) — bewusst datengetrieben statt generischer NLP, das ist ein
// Single-User-Tracker, keine Public-Suche.
const MICRO_KEY_SPELLING_FIXES = [
  [/käse?leberkäsesemmeln?/g, "käseleberkäse semmel"], // fused form first
  [/käse?krainerleberkäse/g, "käseleberkäse"],
  [/käsleberkäse/g, "käseleberkäse"],
  [/kaisersemmeln?/g, "semmel"],
  [/semmeln/g, "semmel"],
];
const MICRO_KEY_DRINK_NOISE = /(redbull|cola|bier|budweiser|wein|schnaps|energy)/;
// WICHTIG: Marken (Billa, Spar, Hofer, ...) sind KEIN Rauschen — verschiedene
// Hersteller verwenden unterschiedlichen Käse/Rezeptur im selben Produkt,
// was real unterschiedliche Verträglichkeit auslösen kann (User-Beobachtung
// 2026-07-30: Spar-KLK Beschwerden, Billa-KLK nicht). Nur echte Füllwörter
// bleiben hier, keine Marken.
const MICRO_KEY_NOISE_WORDS = new Set([
  "at", "mit", "und", "in", "klks",
  "scharf", "scharfe", "scharfer", "scharfes",
  "pikant", "pikante", "pikanter", "pikantes",
]);

/**
 * Normalisiert einen Mahlzeit-Namen auf eine Signatur, die Mengenangaben
 * und Getränke-Zusätze ignoriert, aber Marken bewusst UNANGETASTET lässt
 * (siehe Kommentar bei MICRO_KEY_NOISE_WORDS) — z.B. "125g Käsleberkäse +
 * 65g Semmel", "2x Käseleberkäsesemmel" und "400g Käsleberkäse mit 4
 * Semmeln BILLA" ergeben denselben Key, aber "... BILLA" und "... SPAR"
 * bleiben getrennt. Grund: Freitext-Logs derselben Mahlzeit unterschieden
 * sich bisher fast immer nur in der Menge — jede Variante loste trotzdem
 * eine eigene Gemini-Mikros-Schätzung aus (siehe initDb()-Kommentar oben,
 * 11 Käseleberkäse-Varianten mit je erfundenem Omega-3-Wert, 2026-07-30
 * entdeckt).
 */
export function normalizeMicroKey(name) {
  let s = String(name || "").toLowerCase();
  for (const [pattern, replacement] of MICRO_KEY_SPELLING_FIXES) {
    s = s.replace(pattern, replacement);
  }
  // Getränke-/Extra-Segmente hinter "+" rauswerfen, Rest behalten.
  s = s.split("+").filter((seg) => !MICRO_KEY_DRINK_NOISE.test(seg)).join(" ");
  s = s.replace(/[()]/g, " ");           // Klammern nur als Zeichen entfernen, Inhalt behalten
  s = s.replace(/\d+[.,]?\d*\s?(g|kg|ml|l)\b/g, " "); // Mengenangaben
  s = s.replace(/\b\d+x?\b/g, " ");      // Zähler ("2x", "4")
  s = s.replace(/[^a-zäöüß\s]/g, " ");   // Rest-Sonderzeichen
  const tokens = s.split(/\s+/).filter((t) => t && !MICRO_KEY_NOISE_WORDS.has(t)).sort();
  return tokens.join(" ");
}

export function upsertMealMicros(mealName, kcal, micros, source = "gemini", options = {}) {
  const db = getDb(options);
  const vals = MICRO_COLS.map((c) => micros[c] ?? (OMEGA3_KEYS.includes(c) ? null : 0));
  const sets = MICRO_COLS.map((c) => `${c} = excluded.${c}`).join(", ");
  const nameKey = normalizeMicroKey(mealName);

  db.prepare(`
    INSERT INTO meal_micros (meal_name, kcal, ${MICRO_COLS.join(", ")}, source, name_key)
    VALUES (?, ?, ${MICRO_COLS.map(() => "?").join(", ")}, ?, ?)
    ON CONFLICT(meal_name) DO UPDATE SET
      kcal = excluded.kcal, ${sets}, source = excluded.source,
      name_key = excluded.name_key, updated_at = CURRENT_TIMESTAMP
  `).run(mealName, kcal, ...vals, source, nameKey);
}

export function getMealMicros(mealName, options = {}) {
  const db = getDb(options);
  const exact = db.prepare("SELECT * FROM meal_micros WHERE meal_name = ? COLLATE NOCASE").get(mealName);
  if (exact) return exact;

  const key = normalizeMicroKey(mealName);
  if (!key) return null;
  return db.prepare("SELECT * FROM meal_micros WHERE name_key = ? ORDER BY updated_at DESC LIMIT 1").get(key) || null;
}

export function getAllMealMicros(options = {}) {
  return getDb(options).prepare("SELECT * FROM meal_micros ORDER BY meal_name").all();
}

export default {
  getDb, upsertIngredient, getIngredientByWgerId, upsertMealMicros, getMealMicros, getAllMealMicros,
  upsertMeal, deleteMeal, getMealsForDate, upsertWater, getWater,
};
