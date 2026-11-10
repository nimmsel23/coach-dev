// One-time migration: backfill meal_micros.name_key for existing rows and
// consolidate rows that turn out to share the same normalized key (mostly
// portion-size variants of the same free-text log, e.g. "125g Käsleberkäse"
// vs "2x Käseleberkäsesemmel" — see normalizeMicroKey() in nutrition-db.mjs
// for why these used to spawn separate, independently-hallucinated Gemini
// estimates). Keeps the most-recently-updated row per group, deletes the
// rest. Run once via: node scripts/backfill-micro-keys.mjs
import Database from "better-sqlite3";
import { NUTRITION_DB_PATH } from "../src/server/config/paths.mjs";
import { normalizeMicroKey } from "../src/server/services/nutrition-db.mjs";

const db = new Database(NUTRITION_DB_PATH);

// name_key-Spalte könnte fehlen falls dieses Skript vor dem ersten
// Server-Start läuft — idempotent nachziehen.
try { db.exec("ALTER TABLE meal_micros ADD COLUMN name_key TEXT"); } catch { /* exists */ }

const rows = db.prepare("SELECT * FROM meal_micros").all();
console.log(`${rows.length} meal_micros Zeilen gefunden.`);

const groups = new Map();
for (const row of rows) {
  const key = normalizeMicroKey(row.meal_name);
  db.prepare("UPDATE meal_micros SET name_key = ? WHERE id = ?").run(key, row.id);
  if (!key) continue;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push({ ...row, name_key: key });
}

let mergedGroups = 0;
let deletedRows = 0;
for (const [key, group] of groups) {
  if (group.length < 2) continue;
  mergedGroups++;
  group.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
  const [keep, ...drop] = group;
  console.log(`\nGruppe "${key}" — ${group.length} Varianten, behalte "${keep.meal_name}" (id=${keep.id}):`);
  for (const d of drop) {
    console.log(`  - lösche "${d.meal_name}" (id=${d.id}, omega3=${d.omega3_mg})`);
    db.prepare("DELETE FROM meal_micros WHERE id = ?").run(d.id);
    deletedRows++;
  }
}

console.log(`\n${mergedGroups} Gruppen konsolidiert, ${deletedRows} doppelte Zeilen entfernt.`);
db.close();
