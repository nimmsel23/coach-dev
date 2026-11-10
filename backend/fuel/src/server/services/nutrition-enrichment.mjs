/**
 * nutrition-enrichment.mjs
 *
 * Server-side enrichment pass for meals pulled in from Firestore (mobile /
 * cloud logging). Runs as a separate step from the pull itself — the pull
 * scheduler in firestore-admin.mjs calls enrichMeal() per meal and only
 * pushes back to Firestore if something actually changed.
 *
 * Deliberately NOT part of firestore-admin.mjs: that module is push/pull
 * transport only, this module is the "what do we do with the data" logic
 * (catalog matching, macro sanity, micro lookup/estimation).
 *
 * Steps per meal:
 *   1. Catalog match  – no catalog_id yet? try to match by normalized name.
 *   2. Macro sanity   – kcal missing/zero but P/C/F present → recompute.
 *   3. Micro lookup   – cached meal_micros (SQLite) by catalog/description name.
 *   4. Micro estimate – only for recent meals (see RECENT_ESTIMATE_DAYS),
 *                        older meals without a cache hit stay empty rather
 *                        than firing a Gemini call on every hourly pull.
 */

import { loadCatalog } from "./nutrition-catalog.mjs";
import { getMicrosForMeal, saveMicrosForMeal } from "./nutrition-micros.mjs";
import { estimateMicros } from "./nutrition-estimate-micros.mjs";
import { MICRO_KEYS } from "../../shared/config/dach.mjs";

// Only spend a Gemini call estimating micros for meals logged in the last
// N days — older backlog entries wait for the weekly catalog-verify pass
// or a manual estimate instead of burning API calls on every hourly pull.
const RECENT_ESTIMATE_DAYS = 2;

function normalizeName(name) {
  return String(name || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function findCatalogMatch(meal, catalog) {
  if (meal.catalog_id) {
    return catalog.items.find((i) => i.id === meal.catalog_id) || null;
  }
  const target = normalizeName(meal.description);
  if (!target) return null;
  return catalog.items.find((i) => normalizeName(i.name) === target) || null;
}

function isRecent(date) {
  const days = (Date.now() - new Date(date).getTime()) / 86_400_000;
  return days <= RECENT_ESTIMATE_DAYS;
}

function scaleMicros(micros, factor) {
  const scaled = {};
  for (const k of MICRO_KEYS) {
    scaled[k] = Math.round((micros[k] || 0) * factor * 10) / 10;
  }
  return scaled;
}

function buildMicrosMeta({ lookupName, inferredFrom, normalizedKey = null, factor = 1, source = "unknown", origin }) {
  return {
    source,
    lookup_name: lookupName || null,
    inferred_from: inferredFrom || lookupName || null,
    normalized_key: normalizedKey,
    scaling_factor: Math.round((factor || 1) * 1000) / 1000,
    resolved_at: new Date().toISOString(),
    origin,
  };
}

/**
 * Enrich a single meal in-place-ish (returns a new object, caller decides
 * whether to persist). Never overwrites values the user explicitly set —
 * only fills in what's missing.
 *
 * @param {object} meal   – { date, description, catalog_id?, kcal, protein, carbs, fat, micros? }
 * @param {object} catalog – from loadCatalog()
 * @returns {Promise<{ meal: object, changed: boolean }>}
 */
export async function enrichMeal(meal, catalog) {
  const options = arguments[2] || {};
  let changed = false;
  const enriched = { ...meal };

  // 1. Catalog match
  const catalogEntry = findCatalogMatch(enriched, catalog);
  if (catalogEntry && !enriched.catalog_id) {
    enriched.catalog_id = catalogEntry.id;
    changed = true;
  }

  // 2. Macro sanity — kcal missing but macros present, or all-zero known entry
  const hasMacros = (enriched.protein || enriched.carbs || enriched.fat);
  if ((!enriched.kcal || enriched.kcal === 0) && hasMacros) {
    enriched.kcal = Math.round(
      (enriched.protein || 0) * 4 + (enriched.carbs || 0) * 4 + (enriched.fat || 0) * 9
    );
    changed = true;
  } else if (!enriched.kcal && catalogEntry) {
    enriched.kcal    = catalogEntry.kcal;
    enriched.protein = catalogEntry.protein;
    enriched.carbs   = catalogEntry.carbs;
    enriched.fat     = catalogEntry.fat;
    changed = true;
  }

  // 3. Micro lookup (cached, no API call)
  if (!enriched.micros) {
    const lookupName = catalogEntry?.name || enriched.description;
    const cached = getMicrosForMeal(lookupName, options);
    if (cached) {
      const factor = enriched.kcal && cached.kcal ? enriched.kcal / cached.kcal : 1;
      enriched.micros = scaleMicros(cached, factor);
      enriched.micros_meta = buildMicrosMeta({
        lookupName,
        inferredFrom: cached.meal_name,
        normalizedKey: cached.name_key || null,
        factor,
        source: cached.source || "unknown",
        origin: "cache_lookup",
      });
      changed = true;
    } else if (isRecent(enriched.date)) {
      // 4. Micro estimation — only for recent meals, cache the result
      const estimated = await estimateMicros(enriched.description);
      if (estimated && Object.keys(estimated).length > 0) {
        saveMicrosForMeal(
          enriched.description,
          enriched.kcal || estimated.kcal || 0,
          estimated,
          "gemini",
          options
        );
        const factor = enriched.kcal && estimated.kcal ? enriched.kcal / estimated.kcal : 1;
        enriched.micros = scaleMicros(estimated, factor);
        enriched.micros_meta = buildMicrosMeta({
          lookupName,
          inferredFrom: enriched.description,
          factor,
          source: "gemini",
          origin: "fresh_estimate",
        });
        changed = true;
      }
    }
  }

  return { meal: enriched, changed };
}

/**
 * Enrich every meal in a day's log. Returns the (possibly updated) meal
 * list plus a flag telling the caller whether anything changed and is
 * worth pushing back to Firestore.
 *
 * @param {object[]} meals – from a Firestore day doc or SQLite
 * @returns {Promise<{ meals: object[], changed: boolean }>}
 */
export async function enrichNutritionLog(meals, options = {}) {
  const catalog = loadCatalog(options.nutritionDir || null, { uid: options.uid || "default" });
  let anyChanged = false;
  const result = [];
  for (const meal of meals || []) {
    const { meal: enriched, changed } = await enrichMeal(meal, catalog, options);
    if (changed) anyChanged = true;
    result.push(enriched);
  }
  return { meals: result, changed: anyChanged };
}
