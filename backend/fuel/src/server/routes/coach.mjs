import os from "os";
import path from "path";
import { PORT } from "../../shared/config/constants.mjs";
import { getSyncStatus, pushNutritionCatalog, pushSupplementsCatalog, pullNow } from "../lib/firestore-admin.mjs";
import { loadCatalog as loadNutritionCatalog } from "../services/nutrition-catalog.mjs";
import { loadCatalogForUser as loadSupplementsCatalog } from "../services/supplements-catalog.mjs";

const START_TIME = Date.now();

// Local prod (`/opt/fuel`, fuel-v2.service) always runs on :7000, dev
// (`npm run dev`, nodemon) on :9000 — see CLAUDE.md port convention.
// This is what tells the frontend whether to render the tab as "Dev" or
// "Prod" (and to hide it entirely in the cloud build, which has no server
// to ask in the first place).
//
// Route namespace is "/coach" (not "/dev") because this runs in BOTH local
// modes — dev AND local-prod — it's the local Coach channel's own
// operations surface, per the Coach/Client split documented in CLAUDE.md.
function serverMode() {
  return String(PORT) === "7000" ? "prod" : "dev";
}

export default async function coachRoute(app) {
  app.get("/coach/health", async (req, reply) => {
    let nutritionCount = 0;
    let supplementsCount = 0;
    try { nutritionCount = loadNutritionCatalog(req.paths.nutrition, { uid: req.uid }).items.length; } catch { /* left at 0 */ }
    try { supplementsCount = loadSupplementsCatalog(req.paths.supplements, { uid: req.uid }).items.length; } catch { /* left at 0 */ }

    return reply.send({
      ok: true,
      server: {
        mode: serverMode(),
        port: PORT,
        nodeEnv: process.env.NODE_ENV || null,
        uptimeSec: Math.round((Date.now() - START_TIME) / 1000),
        pid: process.pid,
        hostname: os.hostname(),
      },
      firestoreAdmin: getSyncStatus(),
      catalogs: { nutrition: nutritionCount, supplements: supplementsCount },
    });
  });

  app.post("/coach/sync/push", async (req, reply) => {
    const nutCat = loadNutritionCatalog(req.paths.nutrition, { uid: req.uid });
    const suppCat = loadSupplementsCatalog(req.paths.supplements, { uid: req.uid });
    await pushNutritionCatalog(nutCat.items, {
      uid: req.uid,
      deletedIds: nutCat.deleted_ids || [],
      sourcePath: path.join(req.paths.nutrition, "catalog.json"),
    });
    await pushSupplementsCatalog(suppCat.items, {
      uid: req.uid,
      sourcePath: path.join(req.paths.supplements, "catalog.json"),
    });
    return reply.send({
      ok: true,
      pushed: { nutrition: nutCat.items.length, supplements: suppCat.items.length },
      firestoreAdmin: getSyncStatus(),
    });
  });

  app.post("/coach/sync/pull", async (_req, reply) => {
    try {
      await pullNow();
      return reply.send({ ok: true, firestoreAdmin: getSyncStatus() });
    } catch (e) {
      return reply.status(500).send({ ok: false, error: e.message, firestoreAdmin: getSyncStatus() });
    }
  });

  // Läuft die Enrichment-Pipeline (nutrition-enrichment.mjs) direkt gegen
  // die lokale SQLite-DB, statt nur implizit als Nebenprodukt des
  // stündlichen Firestore-Pulls — für Backfill / "jetzt aufräumen" per Knopf.
  app.post("/coach/enrich", async (req, reply) => {
    try {
      const days = Math.min(Math.max(parseInt(req.body?.days, 10) || 2, 1), 30);
      const { getMealsForDate, upsertMeal } = await import("../services/nutrition-db.mjs");
      const { enrichNutritionLog } = await import("../services/nutrition-enrichment.mjs");

      const results = [];
      for (let i = 0; i < days; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const date = d.toISOString().slice(0, 10);

        const dbOptions = {
          nutritionDir: req.paths.nutrition,
          nutritionDbPath: req.paths.nutritionDb,
          uid: req.uid,
        };
        const meals = getMealsForDate(date, dbOptions);
        if (meals.length === 0) continue;

        const { meals: enriched, changed } = await enrichNutritionLog(
          meals.map((m) => ({ ...m, date })),
          { nutritionDir: req.paths.nutrition, uid: req.uid }
        );
        if (changed) {
          for (const meal of enriched) upsertMeal(meal, dbOptions);
        }
        results.push({ date, meals: meals.length, changed });
      }

      return reply.send({ ok: true, results });
    } catch (e) {
      console.error("coach/enrich:", e.message);
      return reply.status(500).send({ ok: false, error: e.message });
    }
  });
}
