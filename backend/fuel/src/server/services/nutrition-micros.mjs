import { OMEGA3_KEYS, normalizeOmega3 } from "../../shared/config/omega3.mjs";
import { getMealMicros, upsertMealMicros, getAllMealMicros } from "./nutrition-db.mjs";
import { MICRO_KEYS } from "../../shared/config/dach.mjs";

export { MICRO_KEYS };

export function zeroMicros() {
  return Object.fromEntries(MICRO_KEYS.map((k) => [k, 0]));
}

function buildMicrosMeta(lookupName, micros, factor, origin) {
  return {
    source: micros?.source || "unknown",
    lookup_name: lookupName || null,
    inferred_from: micros?.meal_name || lookupName || null,
    normalized_key: micros?.name_key || null,
    scaling_factor: Math.round((factor || 1) * 1000) / 1000,
    resolved_at: new Date().toISOString(),
    origin,
  };
}

// Lookup meal micros by name (case-insensitive, SQLite handles it)
export function getMicrosForMeal(mealName, options = {}) {
  if (!mealName) return null;
  return getMealMicros(mealName, options);
}

// Save Gemini-estimated micros for a meal. Schreibt zusätzlich zur SQLite-
// Zeile (Legacy-Cache, bleibt als Fallback für nicht-katalogisierte Meals)
// direkt in den passenden Katalog-Eintrag — Mikros UND Makros sollen nicht
// mehr getrennt vorgehalten werden (SQLite war früher die einzige Quelle,
// jetzt ist der Katalog-Eintrag die primäre, SQLite nur noch Fallback für
// Freitext-Logs ohne Catalog-Match).
export function saveMicrosForMeal(mealName, kcal, micros, source = "gemini", options = {}) {
  upsertMealMicros(mealName, kcal, micros, source, options);
  writeMicrosToCatalogAsync(mealName, kcal, micros, source, options);
}

function writeMicrosToCatalogAsync(mealName, kcal, micros, source, options = {}) {
  import("./nutrition-catalog.mjs").then(({ loadCatalog, saveMeal }) => {
    const catalog = loadCatalog(options.nutritionDir || null, { uid: options.uid || "default" });
    const target = (catalog.items || []).find((i) => i.name === mealName || i.description === mealName);
    if (!target) return;

    const resolvedMicros = {};
    for (const k of MICRO_KEYS) {
      if (micros[k] != null) resolvedMicros[k] = micros[k];
    }
    target.micros = resolvedMicros;
    target.micros_meta = {
      source,
      kcal_basis: kcal || micros.kcal || target.kcal || 0,
      resolved_at: new Date().toISOString(),
    };

    if (catalog.__nutritionDir) {
      saveMeal(target, catalog.__nutritionDir, { uid: catalog.__uid, catalog });
    } else {
      saveMeal(target);
    }
  }).catch(() => {});
}

export function listAllMealMicros(options = {}) {
  return getAllMealMicros(options);
}

// Löst die Mikros einer geloggten Mahlzeit auf — per Katalog-Name-Lookup,
// kcal-skaliert auf die tatsächlich geloggte Portion. Cached das Resultat
// direkt am `meal`-Objekt (mutiert in-place), damit Aufrufer das Ergebnis
// beim nächsten Zurückschreiben des Log-Files persistieren können, statt
// bei jedem Read erneut nachzuschlagen (vorher: O(Tage×Mahlzeiten) bei
// jedem Wochen-Request, jetzt einmalig pro Mahlzeit).
export function resolveMealMicros(meal, catalog, options = {}) {
  if (meal.micros) return (meal.micros = normalizeOmega3(meal.micros));

  const catalogEntry = catalog.items.find(
    (i) => (meal.catalog_id && i.id === meal.catalog_id) || i.name === meal.description
  );
  const lookupName = catalogEntry?.name || meal.description;

  // 1) Direkt im Katalog-Eintrag hinterlegtes Mikroprofil (Etikett /
  //    Referenztabelle) hat Vorrang vor dem name-gekeyten meal_micros-Lookup.
  //    Werte sind absolut für die Katalog-Portion (catalogEntry.kcal) und
  //    werden auf die tatsächlich geloggte kcal skaliert — gleiche Logik wie
  //    der Fallback unten.
  if (catalogEntry?.micros && Object.keys(catalogEntry.micros).length > 0) {
    const src = normalizeOmega3(catalogEntry.micros);
    let factor = 1;
    if (meal.kcal && catalogEntry.kcal) factor = meal.kcal / catalogEntry.kcal;
    const resolved = {};
    for (const k of MICRO_KEYS) {
      if (OMEGA3_KEYS.includes(k) && src[k] == null) continue;
      resolved[k] = Math.round((src[k] || 0) * factor * 10) / 10;
    }
    meal.micros = resolved;
    meal.micros_meta = buildMicrosMeta(
      lookupName,
      { source: catalogEntry.micros_meta?.source || "catalog", name_key: null, meal_name: lookupName },
      factor,
      "catalog_embedded"
    );
    return resolved;
  }

  // 2) Fallback: separat gepflegtes meal_micros (Gemini-Schätzung, SQLite).
  const cachedMicros = getMicrosForMeal(lookupName, options);
  if (!cachedMicros) return null;
  const micros = normalizeOmega3(cachedMicros);

  let factor = 1;
  if (meal.kcal && micros.kcal) factor = meal.kcal / micros.kcal;

  const resolved = {};
  for (const k of MICRO_KEYS) {
    if (OMEGA3_KEYS.includes(k) && micros[k] == null) continue;
    resolved[k] = Math.round((micros[k] || 0) * factor * 10) / 10;
  }
  meal.micros = resolved;
  meal.micros_meta = buildMicrosMeta(lookupName, micros, factor, "cache_lookup");
  return resolved;
}

// Summiert die (gecachten) Mikros aller Mahlzeiten eines Tages.
// complete=false heißt: mindestens eine Mahlzeit hat noch keine Mikros
// (Gemini-Schätzung läuft im Hintergrund) — Aufrufer soll das Ergebnis
// dann NICHT als Tages-Cache persistieren, sonst friert eine unvollständige
// Summe dauerhaft ein.
export function computeMealMicroTotals(meals, catalog, options = {}) {
  const totals = zeroMicros();
  let complete = true;
  for (const meal of meals || []) {
    const micros = resolveMealMicros(meal, catalog, options);
    if (!micros) { complete = false; continue; }
    for (const k of MICRO_KEYS) {
      totals[k] = Math.round((totals[k] + (micros[k] ?? 0)) * 10) / 10;
    }
  }
  return { totals, complete };
}
