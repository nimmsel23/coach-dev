import { z } from "zod";
import { searchNutrition } from "../../services/nutrition-search.mjs";
import { isISODate } from "../../../shared/utils/validation.mjs";
import { MICRO_KEYS, computeMealMicroTotals } from "../../services/nutrition-micros.mjs";
import { loadCatalog } from "../../services/nutrition-catalog.mjs";
import { loadCatalog as loadSupplementsCatalog } from "../../services/supplements-catalog.mjs";
import { loadLog as loadSupplementLog } from "../../services/supplements-log.mjs";
import { getDeletedMealIds } from "../../services/log-tombstones.mjs";
import { pushNutritionLog } from "../../lib/firestore-admin.mjs";
import path from "path";
import fs from "fs";

const searchQuerySchema = z.object({
  q: z.string().min(1, "q required"),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

function loadLog(date, nutritionDir) {
  const filePath = path.join(nutritionDir, `${date}.json`);
  let log = { date, meals: [], water_ml: 0 };
  if (fs.existsSync(filePath)) {
    try { log = JSON.parse(fs.readFileSync(filePath, "utf-8")); } catch { /* fall through */ }
  }
  const deleted = getDeletedMealIds(date, nutritionDir);
  if (deleted.length && Array.isArray(log.meals)) {
    const del = new Set(deleted);
    log.meals = log.meals.filter((m) => !del.has(m?.id));
  }
  return log;
}

function saveLog(log, nutritionDir) {
  fs.writeFileSync(path.join(nutritionDir, `${log.date}.json`), JSON.stringify(log, null, 2), "utf-8");
}

export default async function dailyRoute(app) {
  app.get("/nutrition/search", async (req, reply) => {
    const parsed = searchQuerySchema.safeParse(req.query);
    if (!parsed.success) return reply.status(400).send({ ok: false, error: "Invalid query" });
    const results = await searchNutrition(parsed.data.q, parsed.data.limit);
    return reply.send({ ok: true, count: results.length, results });
  });

  app.get("/nutrition/daily/:date", async (req, reply) => {
    try {
      const { date } = req.params;
      if (!isISODate(date)) return reply.status(400).send({ ok: false, error: "Invalid date format" });

      const log = loadLog(date, req.paths.nutrition);
      const catalog = loadCatalog(req.paths.nutrition, { uid: req.uid });
      const macros = { kcal: 0, protein: 0, carbs: 0, fat: 0 };

      for (const meal of log.meals || []) {
        macros.kcal    += meal.kcal    || 0;
        macros.protein += meal.protein || 0;
        macros.carbs   += meal.carbs   || 0;
        macros.fat     += meal.fat     || 0;
      }

      // Nutzt denselben Resolve-Cache wie /nutrition/weekly (meal.micros wird
      // in-place gecacht) — wurde die Woche schon einmal geladen, ist das
      // hier ein reiner Cache-Hit statt erneuter Katalog-Namens-Lookups.
      const microOptions = { nutritionDir: req.paths.nutrition, nutritionDbPath: req.paths.nutritionDb, uid: req.uid };
      const hadPersistedMicros = (log.meals || []).some((m) => m.micros);
      const { totals: micros } = computeMealMicroTotals(log.meals, catalog, microOptions);
      const hasResolvedMicros = (log.meals || []).some((m) => m.micros);
      if (hasResolvedMicros && !hadPersistedMicros) {
        saveLog(log, req.paths.nutrition);
        void pushNutritionLog(date, log.meals, log.water_ml || 0, {
          uid: req.uid,
          nutritionDir: req.paths.nutrition,
        }).catch(() => {});
      }

      // Supplement micros
      const suppCatalog = loadSupplementsCatalog(req.paths.supplements, { uid: req.uid });
      const suppCatalogMap = Object.fromEntries(suppCatalog.items.map((i) => [i.id, i]));
      const suppLog = loadSupplementLog(date, req.paths.supplementsLog);
      for (const intake of suppLog.intakes || []) {
        const entry = suppCatalogMap[intake.supplement_id];
        if (!entry?.micros) continue;
        for (const k of MICRO_KEYS) {
          if (entry.micros[k]) {
            micros[k] = Math.round((micros[k] + entry.micros[k]) * 10) / 10;
          }
        }
      }

      return reply.send({ ok: true, date, macros, micros, water_ml: log.water_ml || 0 });
    } catch (error) {
      console.error(error);
      return reply.status(500).send({ ok: false, error: "Internal server error" });
    }
  });
}
