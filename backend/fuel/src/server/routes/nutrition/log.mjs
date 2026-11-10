import { mealDetails } from "../../../client/lib/mealDetails.js";
import { z } from "zod";
import { isISODate, todayISO } from "../../../shared/utils/validation.mjs";
import path from "path";
import fs from "fs";
import { loadCatalog, addOrUpdateItem, upsertLoggedMeal } from "../../services/nutrition-catalog.mjs";
import { estimateMicros } from "../../services/nutrition-estimate-micros.mjs";
import { getMicrosForMeal, saveMicrosForMeal } from "../../services/nutrition-micros.mjs";
import { upsertMeal, deleteMeal as deleteMealRow, upsertWater, getMealsForDate, getMealDates, getWater, getNutritionDeletedIds } from "../../services/nutrition-db.mjs";
import { addDeletedMealId } from "../../services/log-tombstones.mjs";
import { callV4 } from "../../lib/v4-bridge.mjs";
import { pushNutritionLog } from "../../lib/firestore-admin.mjs";
import { invalidateWeekMicroCache } from "../../services/nutrition-weekly.mjs";

function dbOptions(req) {
  return {
    nutritionDir: req.paths.nutrition,
    nutritionDbPath: req.paths.nutritionDb,
    uid: req.uid,
  };
}

async function enrichAndPersistLog(req, log) {
  const { enrichNutritionLog } = await import("../../services/nutrition-enrichment.mjs");
  const { meals, changed } = await enrichNutritionLog(
    (log.meals || []).map((meal) => ({ ...meal, date: log.date })),
    dbOptions(req)
  );
  if (!changed) return false;
  log.meals = meals;
  invalidateMicroCache(log, req.paths.nutrition);
  saveLog(log, req.paths.nutrition, dbOptions(req));
  await pushNutritionLog(log.date, meals, log.water_ml || 0, {
    uid: req.uid,
    nutritionDir: req.paths.nutrition,
  });
  return true;
}

const logPostSchema = z.object({
  date: z.string().optional(),
  meal: z.object({
    type: z.string().optional(),
    description: z.string().min(1),
    notes: z.string().optional(),
    catalog_id: z.string().optional(),
    kcal: z.coerce.number().min(0).optional(),
    protein: z.coerce.number().min(0).optional(),
    carbs: z.coerce.number().min(0).optional(),
    fat: z.coerce.number().min(0).optional(),
    // Vom Client vorausberechneter ISO-Timestamp (echte Essenszeit statt
    // "jetzt") — siehe toLoggedAt() in LogView.jsx. Optional, fällt sonst
    // auf new Date().toISOString() zurück (Quicklog-Fall).
    id: z.string().optional(),
    logged_at: z.string().optional(),
    grams: z.coerce.number().nonnegative().nullable().optional(),
    micros: z.record(z.string(), z.number().finite().nonnegative()).optional(),
    micros_meta: z.record(z.string(), z.unknown()).optional(),
    components: z.array(z.record(z.string(), z.unknown())).optional(),
    source: z.string().optional(),
    source_url: z.string().optional(),
    barcode: z.string().optional(),
    time: z.string().optional(),
  }).optional(),
  // Quicklog from catalog: resolve macros server-side
  catalog_item_id: z.string().optional(),
  catalog_addon_ids: z.array(z.string()).optional(),
  delete_meal_id: z.string().optional(),
  water_ml: z.coerce.number().optional(),
});

function loadLog(date, nutritionDir) {
  const filePath = path.join(nutritionDir, `${date}.json`);
  if (fs.existsSync(filePath)) {
    try {
      const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      // Legacy-Files (u.a. per Firestore-Pull ohne date-Backfill entstanden)
      // haben teils kein top-level "date" — saveLog() hängt sich sonst an
      // `${log.date}.json` auf und schreibt lautlos nach "undefined.json",
      // wodurch Deletes/Edits nie im echten Tages-File ankommen.
      return { date, meals: [], water_ml: 0, ...data, date };
    } catch { /* fall through */ }
  }
  return { date, meals: [], water_ml: 0 };
}

function loadReadLog(date, nutritionDir) {
  const meals = getMealsForDate(date, { nutritionDir, nutritionDbPath: path.join(nutritionDir, "nutrition.db") });
  const waterMl = getWater(date, { nutritionDir, nutritionDbPath: path.join(nutritionDir, "nutrition.db") });
  if (meals.length > 0 || waterMl > 0) {
    return { date, meals, water_ml: waterMl };
  }
  return loadLog(date, nutritionDir);
}

function saveLog(log, nutritionDir, options = {}) {
  fs.writeFileSync(path.join(nutritionDir, `${log.date}.json`), JSON.stringify(log, null, 2), "utf-8");
  syncLogToDb(log, options);
}

// Schreibt den Tag komplett nach SQLite durch (meals als Rows, id-basiert
// upsertet + verwaiste Rows gelöscht). SQLite ist damit die normalisierte
// Sicht auf dieselben Daten wie die Tages-JSON — der JSON-Blob bleibt
// vorerst der Lesepfad (loadLog), SQLite existiert parallel als
// Row-granulare Quelle für zukünftigen Firestore-Row-Sync (siehe
// _merge_by_id-Fix in firestored/adapters/vitalos.py, 2026-07-23).
function syncLogToDb(log, options = {}) {
  try {
    const existing = getMealsForDate(log.date, options);
    const currentIds = new Set((log.meals || []).filter((m) => m.id).map((m) => m.id));
    for (const row of existing) {
      if (!currentIds.has(row.id)) deleteMealRow(row.id, options);
    }
    for (const meal of log.meals || []) {
      if (!meal.id) {
        console.warn(`[nutrition-db] Meal ohne id in ${log.date} übersprungen:`, meal.description);
        continue;
      }
      upsertMeal({ ...meal, date: log.date }, options);
    }
    upsertWater(log.date, log.water_ml || 0, options);
  } catch (e) {
    console.warn(`[nutrition-db] Sync-Fehler für ${log.date}:`, e.message);
  }
}

// Der Tages-Mikros-Cache (log.micro_totals, siehe weekly.mjs/daily.mjs) wird
// bei jeder Log-Änderung ungültig — sonst zeigt /nutrition/weekly veraltete
// Summen. Einfache Invalidierung statt inkrementeller Pflege: nächster Read
// rechnet den Tag einmalig neu (und cached wieder).
function invalidateMicroCache(log, nutritionDir) {
  delete log.micro_totals;
  delete log.micro_totals_complete;
  if (nutritionDir) invalidateWeekMicroCache(log.date, nutritionDir);
}

function resolveCatalogItem(catalog, catalogItemId, addonIds = []) {
  const item = catalog.items.find((i) => i.id === catalogItemId);
  if (!item) return null;

  const addonSet = new Set(addonIds.length > 0 ? addonIds : (item.default_addon_ids || []));
  const selectedAddons = (item.addons || []).filter((a) => addonSet.has(a.id));

  // Basis algebraisch herleiten: item.kcal/protein/carbs/fat ist der
  // Vorschau-Wert für den zuletzt gespeicherten default_addon_ids-Zustand
  // (siehe saveMeal()) — bei Einträgen wie Eierspeise (default_addon_ids:
  // [freiland_2er]) steht dort z.B. schon "168" (= inkl. Ei-Addon). Würde
  // man das direkt als Basis nehmen UND das Addon nochmal addieren, zählt
  // man doppelt (Live-Bug gefunden 2026-07-30: Eierspeise loggte 336 statt
  // 168 kcal). Fix: die Makros der DEFAULT-Addons vom Top-Level abziehen,
  // um die addon-freie Basis zu bekommen — funktioniert unabhängig davon,
  // ob components gepflegt ist oder nicht (viele ältere Einträge haben nur
  // einen reinen Top-Level-Wert ohne components-Aufschlüsselung).
  const defaultAddonIds = new Set(item.default_addon_ids || []);
  const defaultAddons = (item.addons || []).filter((a) => defaultAddonIds.has(a.id));
  const bakedIn = defaultAddons.reduce(
    (acc, a) => ({
      kcal:    acc.kcal    + (a.kcal    || 0),
      protein: acc.protein + (a.protein || 0),
      carbs:   acc.carbs   + (a.carbs   || 0),
      fat:     acc.fat     + (a.fat     || 0),
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 }
  );
  const base = {
    kcal:    (item.kcal    || 0) - bakedIn.kcal,
    protein: (item.protein || 0) - bakedIn.protein,
    carbs:   (item.carbs   || 0) - bakedIn.carbs,
    fat:     (item.fat     || 0) - bakedIn.fat,
  };
  const totals = selectedAddons.reduce(
    (acc, a) => ({
      kcal:    acc.kcal    + (a.kcal    || 0),
      protein: acc.protein + (a.protein || 0),
      carbs:   acc.carbs   + (a.carbs   || 0),
      fat:     acc.fat     + (a.fat     || 0),
    }),
    base
  );

  const addonLabel = selectedAddons.map((a) => a.label).join(", ");
  const description = addonLabel ? `${item.name} (${addonLabel})` : item.name;

  return {
    catalog_id: item.id,
    type: item.meal_type || "meal",
    description,
    notes: item.notes || "",
    kcal:    Math.round(totals.kcal    * 10) / 10,
    protein: Math.round(totals.protein * 10) / 10,
    carbs:   Math.round(totals.carbs   * 10) / 10,
    fat:     Math.round(totals.fat     * 10) / 10,
  };
}

const logPatchSchema = z.object({
  date: z.string().optional(),
  meal_id: z.string().min(1),
  new_date: z.string().optional(),
  meal: z.object({
    type: z.string().optional(),
    description: z.string().min(1).optional(),
    notes: z.string().optional(),
    kcal: z.coerce.number().min(0).optional(),
    protein: z.coerce.number().min(0).optional(),
    carbs: z.coerce.number().min(0).optional(),
    fat: z.coerce.number().min(0).optional(),
    id: z.string().optional(),
    logged_at: z.string().optional(),
    grams: z.coerce.number().nonnegative().nullable().optional(),
    micros: z.record(z.string(), z.number().finite().nonnegative()).optional(),
    micros_meta: z.record(z.string(), z.unknown()).optional(),
    components: z.array(z.record(z.string(), z.unknown())).optional(),
    source: z.string().optional(),
    source_url: z.string().optional(),
    barcode: z.string().optional(),
    time: z.string().optional(),
  }).optional(),
});

function fireMicrosEstimate(description, kcal) {
  const options = arguments[2] || {};
  if (!description || getMicrosForMeal(description, options)) return;
  estimateMicros(description)
    .then((micros) => {
      if (Object.keys(micros).length > 0) {
        saveMicrosForMeal(description, kcal, micros, "gemini-log", options);
      }
    })
    .catch((e) => console.warn(`[micros] estimate failed for "${description}":`, e.message));
}

function normalizeMealName(name) {
  return String(name || "").trim().toLowerCase().replace(/\s+/g, " ");
}

// Jedes freihändig geloggte Meal (kein bestehender catalog_item_id) landet
// automatisch im Katalog — aber nur als NEUER Eintrag, wenn noch keiner mit
// demselben normalisierten Namen existiert. Gibt es schon einen Treffer,
// fassen wir ihn nicht an — sonst würde jedes lässige Relog mit leicht
// abweichenden Zahlen einen bereits verifizierten Katalogeintrag lautlos
// wieder mit Rohwerten überschreiben. Neue Einträge bekommen source:
// "gemini", damit der wöchentliche fuel-catalog-verify-Timer (Haiku+
// WebSearch) sie im Zweifelsfall gegen echte Herstellerangaben recherchiert.
function autoUpsertCatalog(m, nutritionDir, uid) {
  if (!m?.description && !m?.name) return;
  try {
    const catalog = loadCatalog(nutritionDir, { uid });
    const synced = upsertLoggedMeal(catalog, m);
    if (synced) return synced;
    const nameNorm = normalizeMealName(m.description || m.name);
    const existing = catalog.items.find((i) => normalizeMealName(i.name) === nameNorm);
    if (existing) return existing;
    return addOrUpdateItem(catalog, {
      name: m.description || m.name,
      description: m.description || m.name,
      meal_type: m.type || "meal",
      notes: m.notes || "",
      kcal: m.kcal || m.calories || 0,
      protein: m.protein || 0,
      carbs: m.carbs || 0,
      fat: m.fat || 0,
      source: "logged",
    });
  } catch (e) {
    console.warn(`[nutrition-catalog] auto-upsert failed for "${m.description || m.name}":`, e.message);
  }
}

// v4 (und Firestore) können getilgte Mahlzeiten nach einem Re-Import erneut
// führen — der Tombstone-Sidecar (<date>.deleted.json) ist die autoritative
// Löschliste. Filtert die von v4 gebridgte Antwort dagegen, egal in welchem
// der bekannten Antwort-Shapes die meals stecken.
function stripDeletedMeals(payload, date, options) {
  const deleted = new Set(getNutritionDeletedIds(date, options));
  if (deleted.size === 0 || !payload || typeof payload !== "object") return payload;
  const clean = (meals) => (Array.isArray(meals) ? meals.filter((m) => !deleted.has(m?.id)) : meals);
  const out = { ...payload };
  if (Array.isArray(out.meals)) out.meals = clean(out.meals);
  if (out.data && typeof out.data === "object") {
    out.data = { ...out.data };
    if (Array.isArray(out.data.meals)) out.data.meals = clean(out.data.meals);
  }
  return out;
}

export default async function logRoute(app) {
  app.get("/nutrition/log", async (req, reply) => {
    const date = (req.query.date || todayISO()).toString();
    if (!isISODate(date)) return reply.status(400).send({ ok: false, error: "Invalid date" });
    try {
      const bridged = await callV4(`/nutrition/log?date=${encodeURIComponent(date)}`);
      if (bridged.ok) return reply.send(stripDeletedMeals(bridged.data, date, dbOptions(req)));
      if (bridged.status < 500) return reply.status(bridged.status).send(bridged.data);
    } catch {}
    return reply.send({ ok: true, data: loadReadLog(date, req.paths.nutrition) });
  });

  app.get("/nutrition/history", async (req, reply) => {
    const limitCount = parseInt(req.query.limit || "30");
    try {
      const bridged = await callV4(`/nutrition/history?limit=${encodeURIComponent(limitCount)}`);
      if (bridged.ok) {
        const data = bridged.data;
        if (data && Array.isArray(data.history)) {
          data.history = data.history.map((day) =>
            day?.date ? stripDeletedMeals(day, day.date, dbOptions(req)) : day
          );
        }
        return reply.send(data);
      }
      if (bridged.status < 500) return reply.status(bridged.status).send(bridged.data);
    } catch {}
    const nutritionDir = req.paths.nutrition;
    const legacyDates = fs.readdirSync(nutritionDir)
      .filter((f) => f.match(/^\d{4}-\d{2}-\d{2}\.json$/))
      .map((f) => f.replace(".json", ""));
      const dates = Array.from(new Set([...getMealDates(dbOptions(req)), ...legacyDates])).sort().reverse();
    const history = [];
    for (const date of dates) {
      const log = loadReadLog(date, nutritionDir);
      if ((log.meals || []).length > 0) history.push(log);
      if (history.length >= limitCount) break;
    }

    return reply.send({ ok: true, history });
  });

  app.patch("/nutrition/log", async (req, reply) => {
    try {
      const bridged = await callV4("/nutrition/log", { method: "PATCH", body: req.body || {} });
      if (bridged.ok) {
        if (req.body?.meal) autoUpsertCatalog(req.body.meal, req.paths.nutrition, req.uid);
        return reply.send(bridged.data);
      }
      if (bridged.status < 500) return reply.status(bridged.status).send(bridged.data);
    } catch {}
    try {
      const parsed = logPatchSchema.safeParse(req.body || {});
      if (!parsed.success) return reply.status(400).send({ ok: false, error: "Invalid data" });

      const { meal_id, meal: updates, new_date } = parsed.data;
      const date = (parsed.data.date || todayISO()).toString();
      if (!isISODate(date)) return reply.status(400).send({ ok: false, error: "Invalid date" });
      if (new_date && !isISODate(new_date)) return reply.status(400).send({ ok: false, error: "Invalid new_date" });

      const sourceLog = loadLog(date, req.paths.nutrition);
      const mealIndex = sourceLog.meals.findIndex((m) => m.id === meal_id);
      if (mealIndex === -1) return reply.status(404).send({ ok: false, error: "Meal not found" });

      const meal = { ...sourceLog.meals[mealIndex] };

      if (updates) {
        Object.assign(meal, Object.fromEntries(Object.entries(updates).filter(([, v]) => v !== undefined)));
        // kcal/description geändert → gecachte Mikros (auf altes kcal skaliert) sind stale.
        if (!updates.micros && ["kcal", "description", "grams"].some(k => updates[k] !== undefined && updates[k] !== sourceLog.meals[mealIndex][k])) {
          delete meal.micros;
          delete meal.micros_meta;
        }
      }

      if (new_date && new_date !== date) {
        sourceLog.meals.splice(mealIndex, 1);
        invalidateMicroCache(sourceLog, req.paths.nutrition);
        saveLog(sourceLog, req.paths.nutrition, dbOptions(req));
        const targetLog = loadLog(new_date, req.paths.nutrition);
        targetLog.meals.push({ ...meal, id: `meal_${Date.now()}` });
        invalidateMicroCache(targetLog, req.paths.nutrition);
        saveLog(targetLog, req.paths.nutrition, dbOptions(req));
        return reply.send({ ok: true, data: targetLog });
      } else {
        sourceLog.meals[mealIndex] = meal;
        invalidateMicroCache(sourceLog, req.paths.nutrition);
        saveLog(sourceLog, req.paths.nutrition, dbOptions(req));
        return reply.send({ ok: true, data: sourceLog });
      }
    } catch (error) {
      console.error(error);
      return reply.status(500).send({ ok: false, error: "Internal server error" });
    }
  });

  app.post("/nutrition/log", async (req, reply) => {
    // Löschungen werden v3-autoritativ behandelt: der v4-Bridge-Aufruf allein
    // entfernt die Mahlzeit nur aus der v4-SQLite — v3-JSON, v3-SQLite,
    // Tombstone-Sidecar und Firestore behalten sie, und der nächste Sync
    // (doPullRecentLogs / v4-Re-Import) holt sie zurück. Deshalb hier zusätzlich
    // Tombstone schreiben + aus dem Tages-File entfernen + nach Firestore pushen.
    const delId = (req.body?.delete_meal_id || "").toString();
    if (delId) {
      const date = (req.body?.date || todayISO()).toString();
      if (!isISODate(date)) return reply.status(400).send({ ok: false, error: "Invalid date" });
      try {
        await callV4("/nutrition/log", { method: "POST", body: req.body || {} });
      } catch {}
      try {
        const log = loadLog(date, req.paths.nutrition);
        log.meals = (log.meals || []).filter((m) => m.id !== delId);
        invalidateMicroCache(log, req.paths.nutrition);
        addDeletedMealId(date, delId, req.paths.nutrition);
        saveLog(log, req.paths.nutrition, dbOptions(req));
        void pushNutritionLog(date, log.meals, log.water_ml || 0, {
          uid: req.uid,
          nutritionDir: req.paths.nutrition,
        }).catch(() => {});
        return reply.send({
          ok: true,
          data: { ...log, deleted_meal_ids: getNutritionDeletedIds(date, dbOptions(req)) },
        });
      } catch (error) {
        console.error(error);
        return reply.status(500).send({ ok: false, error: "Internal server error" });
      }
    }

    try {
      const bridged = await callV4("/nutrition/log", { method: "POST", body: req.body || {} });
      if (bridged.ok) {
        if (req.body?.meal) autoUpsertCatalog(req.body.meal, req.paths.nutrition, req.uid);
        return reply.send(bridged.data);
      }
      if (bridged.status < 500) return reply.status(bridged.status).send(bridged.data);
    } catch {}
    try {
      const parsed = logPostSchema.safeParse(req.body || {});
      if (!parsed.success) return reply.status(400).send({ ok: false, error: "Invalid data" });

      const date = (parsed.data.date || todayISO()).toString();
      if (!isISODate(date)) return reply.status(400).send({ ok: false, error: "Invalid date" });

      const log = loadLog(date, req.paths.nutrition);

      if (parsed.data.catalog_item_id) {
        const catalog = loadCatalog(req.paths.nutrition, { uid: req.uid });
        const resolved = resolveCatalogItem(catalog, parsed.data.catalog_item_id, parsed.data.catalog_addon_ids);
        if (!resolved) return reply.status(404).send({ ok: false, error: "Catalog item not found" });
        log.meals.push({ id: `meal_${Date.now()}`, ...resolved, time: new Date().toISOString() });
        fireMicrosEstimate(resolved.description, resolved.kcal, dbOptions(req));
      } else if (parsed.data.meal) {
        const m = parsed.data.meal;
        log.meals.push({
          ...mealDetails(m),
          id: m.id || `meal_${Date.now()}`,
          catalog_id: m.catalog_id || null,
          type: m.type || "meal",
          description: m.description,
          notes: m.notes || "",
          kcal: m.kcal || 0, protein: m.protein || 0, carbs: m.carbs || 0, fat: m.fat || 0,
          time: m.time || m.logged_at || new Date().toISOString(),
        });
        if (!m.micros) fireMicrosEstimate(m.description, m.kcal || 0, dbOptions(req));
        autoUpsertCatalog(m, req.paths.nutrition, req.uid);
      }

      if (parsed.data.delete_meal_id) {
        log.meals = log.meals.filter((m) => m.id !== parsed.data.delete_meal_id);
      }
      if (parsed.data.water_ml !== undefined) {
        log.water_ml = parsed.data.water_ml;
      }

      invalidateMicroCache(log, req.paths.nutrition);
      saveLog(log, req.paths.nutrition, dbOptions(req));
      void enrichAndPersistLog(req, log).catch((e) => {
        console.warn(`[nutrition-enrichment] post-log enrich failed for ${log.date}:`, e.message);
      });
      return reply.send({ ok: true, data: log });
    } catch (error) {
      console.error(error);
      return reply.status(500).send({ ok: false, error: "Internal server error" });
    }
  });
}
