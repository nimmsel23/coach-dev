import { OMEGA3_KEYS, normalizeOmega3, omega3Coverage } from "../../shared/config/omega3.mjs";
import path from "path";
import fs from "fs";
import { zeroMicros, MICRO_KEYS, computeMealMicroTotals } from "./nutrition-micros.mjs";
import { loadCatalog } from "./nutrition-catalog.mjs";
import { loadCatalog as loadSupplementsCatalog } from "./supplements-catalog.mjs";
import { loadLog as loadSupplementLog } from "./supplements-log.mjs";
import { getDeletedMealIds } from "./log-tombstones.mjs";
import { pushNutritionLog } from "../lib/firestore-admin.mjs";
import { DACH, getStatus } from "../../shared/config/dach.mjs";

// Wochen-Assembly für die Mikro-Sicht. Ausgelagert aus routes/nutrition/weekly.mjs,
// damit /nutrition/weekly/:year/:week und /nutrition/weekly/:year/:week/micro/:key
// (micro-trend.mjs) exakt dieselbe Datengrundlage teilen statt sie zu duplizieren.

function nowIso() {
  return new Date().toISOString();
}

// Wochen-Aggregat-Cache — analog zum Tages-Cache (log.micro_totals): die
// eigentliche Summierung über 7 Tage + %DACH-Berechnung ist zwar billig
// (reine Arithmetik auf bereits gecachten Tageswerten), lief bisher aber bei
// JEDEM Request neu, weil weder Meal- noch Supplement-Schreibpfade wussten,
// welche Woche betroffen ist. Fix: eine Datei pro Uid-Verzeichnis
// (`week_micros_cache.json`), invalidiert von genau den Stellen, die auch
// schon `log.micro_totals` invalidieren (nutrition/log.mjs) + zusätzlich den
// Supplement-Log-Routen (supplements.mjs), da addSupplementMicros() nicht
// pro-Tag gecached ist und sonst am Wochen-Cache vorbeischreiben würde.
function weekCacheFilePath(nutritionDir) {
  return path.join(nutritionDir, "week_micros_cache.json");
}

function loadWeekCacheStore(nutritionDir) {
  const p = weekCacheFilePath(nutritionDir);
  if (fs.existsSync(p)) {
    try { return JSON.parse(fs.readFileSync(p, "utf-8")); } catch { /* corrupt → neu aufbauen */ }
  }
  return {};
}

function saveWeekCacheStore(nutritionDir, store) {
  fs.writeFileSync(weekCacheFilePath(nutritionDir), JSON.stringify(store, null, 2), "utf-8");
}

function weekCacheKey(year, week) {
  return `${year}-W${String(week).padStart(2, "0")}`;
}

// ISO-8601-Woche aus einem YYYY-MM-DD-Datum (Donnerstag-der-Woche-Methode) —
// muss zu getWeekDates() (unten) passen, das dieselbe ISO-Woche annimmt.
export function dateToISOWeek(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  const target = new Date(d.valueOf());
  const dayNr = (d.getDay() + 6) % 7; // Montag=0..Sonntag=6
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = new Date(target.getFullYear(), 0, 4);
  const diff = target - firstThursday;
  const week = 1 + Math.round(diff / (7 * 24 * 3600 * 1000));
  return { year: target.getFullYear(), week };
}

// Von den Schreibpfaden aufgerufen (nutrition/log.mjs, supplements.mjs),
// sobald sich an einem Datum etwas ändert, das in die Wochen-Summe einfließt.
export function invalidateWeekMicroCache(dateStr, nutritionDir) {
  try {
    const { year, week } = dateToISOWeek(dateStr);
    const store = loadWeekCacheStore(nutritionDir);
    const key = weekCacheKey(year, week);
    if (store[key]) {
      delete store[key];
      saveWeekCacheStore(nutritionDir, store);
    }
  } catch (e) {
    console.warn("[week-micros-cache] invalidate failed:", e.message);
  }
}

export function getWeekDates(year, week) {
  const simple = new Date(year, 0, 1 + (week - 1) * 7);
  const dow = simple.getDay();
  const ISOweekStart = simple;
  if (dow <= 4) ISOweekStart.setDate(simple.getDate() - simple.getDay() + 1);
  else ISOweekStart.setDate(simple.getDate() + 8 - simple.getDay());

  const dates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(ISOweekStart);
    d.setDate(d.getDate() + i);
    dates.push(d.toISOString().split("T")[0]);
  }
  return dates;
}

function loadNutritionLog(date, nutritionDir) {
  const filePath = path.join(nutritionDir, `${date}.json`);
  let log = { date, meals: [], water_ml: 0 };
  if (fs.existsSync(filePath)) {
    try { log = JSON.parse(fs.readFileSync(filePath, "utf-8")); } catch { /* fall through */ }
  }
  // Getilgte Mahlzeiten defensiv rausfiltern — falls ein noch nicht
  // konvergierter Sync-Stand (v4-Re-Import) sie wieder ins Tages-File
  // geschrieben hat, sollen sie weder in Heatmap noch Beiträgen auftauchen.
  const deleted = getDeletedMealIds(date, nutritionDir);
  if (deleted.length && Array.isArray(log.meals)) {
    const del = new Set(deleted);
    log.meals = log.meals.filter((m) => !del.has(m?.id));
  }
  return log;
}

function saveNutritionLog(log, nutritionDir) {
  fs.writeFileSync(path.join(nutritionDir, `${log.date}.json`), JSON.stringify(log, null, 2), "utf-8");
}

function mealComponentTrace(meal, catalog) {
  const logged = Array.isArray(meal.components) && meal.components.length > 0;
  const catalogId = meal.catalog_item_id || meal.catalog_id;
  const catalogMeal = catalogId
    ? (catalog.items || []).find((item) => item.id === catalogId)
    : null;
  if (logged) return { components: meal.components, components_source: "meal_snapshot" };
  if (catalogMeal?.components?.length) {
    return { components: catalogMeal.components, components_source: "catalog_current" };
  }
  return { components: [], components_source: "unavailable" };
}

// Gibt zusätzlich die Pro-Supplement-Beiträge zurück (für Modal-Aufschlüsselung
// "welcher Eintrag hat wie viel beigetragen") — dayTotals bleibt wie bisher
// die aufsummierte Quelle für Heatmap/Status.
function addSupplementMicros(dayTotals, date, supplementCatalogMap, supplementsLogDir) {
  const suppLog = loadSupplementLog(date, supplementsLogDir);
  const contributions = [];
  for (const intake of suppLog.intakes || []) {
    const entry = supplementCatalogMap[intake.supplement_id] || { name: intake.supplement_id };
    if (!entry) continue;
    const profile = normalizeOmega3(entry.micros || {});

    let factor = 1;
    if (intake.dose != null && entry.default_dose != null && entry.default_dose > 0) {
      factor = intake.dose / entry.default_dose;
    }

    const scaledMicros = {};
    for (const k of MICRO_KEYS) {
      if (profile[k] != null) {
        const v = Math.round(profile[k] * factor * 10) / 10;
        scaledMicros[k] = v;
        dayTotals[k] = Math.round((dayTotals[k] + v) * 10) / 10;
      }
    }
    contributions.push({
      kind: "supplement",
      id: intake.id || null,
      date,
      supplement_id: intake.supplement_id,
      time: intake.time || null,
      name: entry.name || intake.supplement_id,
      dose: intake.dose,
      unit: entry.unit || "",
      micros: scaledMicros,
      micros_meta: {
        source: "supplement_catalog",
        lookup_name: entry.name || intake.supplement_id,
        inferred_from: intake.supplement_id,
        normalized_key: null,
        scaling_factor: Math.round((factor || 1) * 1000) / 1000,
        resolved_at: nowIso(),
        origin: "supplement",
      },
    });
  }
  return contributions;
}

// Baut die Wochen-Mikro-Aggregation. ctx = { paths, uid } (paths = req.paths).
// Rückgabe: { dates, week_totals, rda_comparison, day_breakdown, meal_breakdown }.
export async function assembleWeek(year, week, ctx) {
  const { paths: reqPaths, uid } = ctx;

  const cacheStore = loadWeekCacheStore(reqPaths.nutrition);
  const cacheKey = weekCacheKey(year, week);
  const cached = cacheStore[cacheKey];
  if (cached && cached.complete && cached.data?.omega3_version === 1 && cached.data?.trace_version === 2) {
    return cached.data;
  }

  const dates = getWeekDates(year, week);
  const catalog = loadCatalog(reqPaths.nutrition, { uid });
  const suppCatalog = loadSupplementsCatalog(reqPaths.supplements, { uid });
  const suppCatalogMap = Object.fromEntries(suppCatalog.items.map((i) => [i.id, i]));
  const microOptions = { nutritionDir: reqPaths.nutrition, nutritionDbPath: reqPaths.nutritionDb, uid };

  const weekTotals = zeroMicros();
  const dayBreakdown = {};
  const mealBreakdown = {};
  let weekComplete = true;

  for (const date of dates) {
    const log = loadNutritionLog(date, reqPaths.nutrition);
    let mealTotals;

    if (log.micro_totals && log.micro_totals_complete && log.omega3_version === 1) {
      // Gecacht (aus einem vorherigen Request oder beim Loggen aufgelöst) — kein Rechnen nötig.
      mealTotals = log.micro_totals;
    } else {
      const hadPersistedMicros = (log.meals || []).some((m) => m.micros);
      const { totals, complete } = computeMealMicroTotals(log.meals, catalog, microOptions);
      mealTotals = totals;
      if (!complete) weekComplete = false;

      // Selbstheilend zurückschreiben, sobald irgendeine Mahlzeit neu
      // aufgelöst wurde (per-Meal-Cache spart beim nächsten Lauf Zeit).
      // complete=false wird mitgespeichert, aber die Read-Prüfung oben
      // verlangt complete=true — ein unvollständiger Tag wird also beim
      // nächsten Request automatisch erneut versucht, statt als 0 zu
      // erstarren.
      const hasResolvedMicros = (log.meals || []).some((m) => m.micros);
      if (hasResolvedMicros) {
        log.omega3_version = 1;
        log.micro_totals = totals;
        log.micro_totals_complete = complete;
        saveNutritionLog(log, reqPaths.nutrition);
        if (!hadPersistedMicros) {
          void pushNutritionLog(date, log.meals, log.water_ml || 0, {
            uid,
            nutritionDir: reqPaths.nutrition,
          }).catch(() => {});
        }
      }

      if (!complete) {
        for (const meal of log.meals || []) {
          if (meal.micros || !meal.description) continue;
          const lookupName = meal.description;
          import("./nutrition-estimate-micros.mjs").then(({ estimateMicros }) => {
            import("./nutrition-micros.mjs").then(({ saveMicrosForMeal }) => {
              estimateMicros(lookupName).then((est) => {
                if (Object.keys(est).length > 0) {
                  saveMicrosForMeal(lookupName, meal.kcal || 0, est, "gemini", microOptions);
                  const refreshed = loadNutritionLog(date, reqPaths.nutrition);
                  const target = (refreshed.meals || []).find((m) => m.id === meal.id);
                  if (target) {
                    target.micros = {};
                    for (const k of MICRO_KEYS) {
                      if (OMEGA3_KEYS.includes(k) && est[k] == null) continue;
                      target.micros[k] = Math.round((est[k] || 0) * 10) / 10;
                    }
                    target.micros_meta = {
                      source: "gemini",
                      lookup_name: lookupName,
                      inferred_from: lookupName,
                      normalized_key: null,
                      scaling_factor: 1,
                      resolved_at: nowIso(),
                      origin: "background_estimate",
                    };
                    delete refreshed.micro_totals;
                    delete refreshed.micro_totals_complete;
                    saveNutritionLog(refreshed, reqPaths.nutrition);
                    invalidateWeekMicroCache(date, reqPaths.nutrition);
                    void pushNutritionLog(date, refreshed.meals, refreshed.water_ml || 0, {
                      uid,
                      nutritionDir: reqPaths.nutrition,
                    }).catch(() => {});
                  }
                  console.log(`[micros] Background estimation completed for: ${lookupName}`);
                }
              });
            });
          });
        }
      }
    }

    const dayTotals = { ...mealTotals };
    const suppContributions = addSupplementMicros(dayTotals, date, suppCatalogMap, reqPaths.supplementsLog);

    dayBreakdown[date] = dayTotals;
    for (const k of MICRO_KEYS) {
      weekTotals[k] = Math.round((weekTotals[k] + (dayTotals[k] ?? 0)) * 10) / 10;
    }

    // Pro-Eintrag-Aufschlüsselung fürs Detail-Modal ("welcher Eintrag hat
    // wie viel beigetragen"). log.meals[].micros ist an dieser Stelle
    // bereits aufgelöst (computeMealMicroTotals mutiert in-place) oder
    // stammt aus dem Cache (beim ersten Auflösen persistiert).
    const mealContributions = (log.meals || [])
      .map((m) => ({
        kind: "meal",
        id: m.id || null,
        date,
        name: m.description,
        type: m.type || null,
        time: m.time || m.logged_at || null,
        grams: m.grams ?? null,
        kcal: m.kcal || 0,
        protein: m.protein || 0,
        carbs: m.carbs || 0,
        fat: m.fat || 0,
        catalog_item_id: m.catalog_item_id || m.catalog_id || null,
        source: m.source || null,
        ...mealComponentTrace(m, catalog),
        micros: m.micros,
        micros_meta: m.micros_meta || null,
      }));
    mealBreakdown[date] = [...mealContributions, ...suppContributions];
  }

  const status = {};
  for (const [key, dach] of Object.entries(DACH)) {
    const avg = weekTotals[key] / 7;
    status[key] = {
      dach: dach.value,
      unit: dach.unit,
      total_week: Math.round(weekTotals[key] * 10) / 10,
      avg_daily: Math.round(avg * 10) / 10,
      percent_of_dach: dach.value > 0 ? Math.round((avg / dach.value) * 100) : null,
      status: getStatus(avg, dach.value),
    };
  }

  Object.assign(status, omega3Coverage(mealBreakdown, status));
  const result = {
    omega3_version: 1,
    trace_version: 2,
    dates,
    week_totals: weekTotals,
    rda_comparison: status,
    day_breakdown: dayBreakdown,
    meal_breakdown: mealBreakdown,
  };

  // Nur vollständige Wochen cachen — bei einer unvollständigen (noch
  // laufende Background-Estimate-Aufrufe oben) würde ein gecachtes 0
  // sonst nie wieder korrigiert, weil nichts es invalidiert.
  if (weekComplete) {
    cacheStore[cacheKey] = { complete: true, data: result, cached_at: nowIso() };
    saveWeekCacheStore(reqPaths.nutrition, cacheStore);
  }

  return result;
}
