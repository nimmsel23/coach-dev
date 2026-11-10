import { z } from "zod";
import { loadCatalogForUser, saveCatalog, addOrUpdateSupplement, deleteSupplement } from "../services/supplements-catalog.mjs";
import { loadLog, saveLog, addIntake, updateIntake, deleteIntake } from "../services/supplements-log.mjs";
import { isISODate, todayISO } from "../../shared/utils/validation.mjs";
import { callV4 } from "../lib/v4-bridge.mjs";
import { invalidateWeekMicroCache } from "../services/nutrition-weekly.mjs";
import fs from "fs";
import path from "path";

const scheduleSchema = z.object({
  type: z.enum(["daily", "weekly", "cyclical"]),
  days: z.array(z.string()).optional(),          // nur bei weekly
  interval_days: z.coerce.number().optional(),   // nur bei cyclical
  start_date: z.string().optional(),             // nur bei cyclical
}).nullable().optional();

// Pro-Supplement-Reminder (2026-09-10): eigener Push nur für dieses Supplement
// zur gewählten Zeit. enabled:false = bewusst aus dem Sammel-Reminder (pro
// Tageszeit-Slot) ausgenommen. Fehlt das Feld ganz → altes Slot-Verhalten.
const reminderSchema = z.object({
  enabled: z.boolean().optional(),
  time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
}).nullable().optional();

const catalogPostSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  unit: z.string().optional(),
  default_dose: z.coerce.number().optional(),
  default_time_of_day: z.string().optional(),
  reminder: reminderSchema,
  // micronutrient = zählt über `micros` in der Mikro-Auswertung; botanical =
  // Pflanze/Adaptogen, nur Dosis-Log + `substance`-Verweis auf relax-dev.
  kind: z.enum(["micronutrient", "botanical"]).optional(),
  substance: z.string().optional(),
  micros: z.record(z.string(), z.coerce.number().min(0)).optional(),
  // War bisher nie im Schema — GeminiCatalogModal.jsx schätzte längst ein
  // schedule-Objekt, das aber beim Speichern verworfen wurde. utils.js'
  // isDueToday() (genutzt von DailyChecklist.jsx) hing dadurch komplett in
  // der Luft: fertige Logik, aber item.schedule war immer undefined
  // (2026-07-30 entdeckt).
  schedule: scheduleSchema,
});

const logPostSchema = z.object({
  date: z.string().optional(),
  intake: z.object({
    id: z.string().uuid().optional(),
    supplement_id: z.string().min(1),
    name: z.string().optional(),
    dose: z.coerce.number().optional(),
    unit: z.string().optional(),
    time_of_day: z.string().optional(),
    notes: z.string().optional(),
  }).optional(),
  delete_id: z.string().optional(),
});

const logPatchSchema = z.object({
  date: z.string().optional(),
  intake_id: z.string().min(1),
  updates: z.object({
    name: z.string().optional(),
    dose: z.coerce.number().optional(),
    unit: z.string().optional(),
    time_of_day: z.string().optional(),
    notes: z.string().optional(),
  }),
});

const statsQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
  anchor: z.string().optional(),
});

export default async function supplementsRoute(app) {
  // GET /supplements/catalog
  app.get("/supplements/catalog", async (req, reply) => {
    const catalog = loadCatalogForUser(req.paths.supplements, { uid: req.uid });
    return reply.send({ ok: true, items: catalog.items || [] });
  });

  // POST /supplements/catalog
  app.post("/supplements/catalog", async (req, reply) => {
    try {
      const parsed = catalogPostSchema.safeParse(req.body || {});
      if (!parsed.success) {
        return reply.status(400).send({ ok: false, error: "Invalid data" });
      }

      const catalog = loadCatalogForUser(req.paths.supplements, { uid: req.uid });
      const item = addOrUpdateSupplement(catalog, parsed.data);

      if (!item) {
        return reply.status(400).send({ ok: false, error: "Name required" });
      }

      saveCatalog(catalog, req.paths.supplements, { uid: req.uid });
      return reply.send({ ok: true, item });
    } catch (error) {
      console.error(error);
      return reply.status(500).send({ ok: false, error: "Internal server error" });
    }
  });

  // DELETE /supplements/catalog/:id
  app.delete("/supplements/catalog/:id", async (req, reply) => {
    try {
      const { id } = req.params;
      if (!id) return reply.status(400).send({ ok: false, error: "ID required" });

      const catalog = loadCatalogForUser(req.paths.supplements, { uid: req.uid });
      const removed = deleteSupplement(catalog, id);
      if (!removed) return reply.status(404).send({ ok: false, error: "Supplement not found" });

      saveCatalog(catalog, req.paths.supplements, { uid: req.uid });
      return reply.send({ ok: true });
    } catch (error) {
      console.error(error);
      return reply.status(500).send({ ok: false, error: "Internal server error" });
    }
  });

  // GET /supplements/log?date=YYYY-MM-DD
  app.get("/supplements/log", async (req, reply) => {
    const date = (req.query.date || todayISO()).toString();
    if (!isISODate(date)) {
      return reply.status(400).send({ ok: false, error: "Invalid date" });
    }
    try {
      const bridged = await callV4(`/supplements/log?date=${encodeURIComponent(date)}`);
      if (bridged.ok) return reply.send(bridged.data);
      if (bridged.status < 500) return reply.status(bridged.status).send(bridged.data);
    } catch {}
    const log = loadLog(date, req.paths.supplementsLog);
    return reply.send({ ok: true, data: log });
  });

  // POST /supplements/log
  app.post("/supplements/log", async (req, reply) => {
    try {
      const parsed = logPostSchema.safeParse(req.body || {});
      if (!parsed.success) {
        return reply.status(400).send({ ok: false, error: "Invalid data" });
      }

      const date = (parsed.data.date || todayISO()).toString();
      if (!isISODate(date)) {
        return reply.status(400).send({ ok: false, error: "Invalid date" });
      }

      try {
        const catalog = loadCatalogForUser(req.paths.supplements, { uid: req.uid });
        const intake = parsed.data.intake ? {
          ...parsed.data.intake,
          name: parsed.data.intake.name || catalog.items.find((item) => item.id === parsed.data.intake.supplement_id)?.name,
        } : undefined;
        const bridged = await callV4("/supplements/log", {
          method: "POST",
          body: { date, intake, delete_id: parsed.data.delete_id },
        });
        if (bridged.ok) return reply.send(bridged.data);
        if (bridged.status < 500) return reply.status(bridged.status).send(bridged.data);
      } catch {}

      const log = loadLog(date, req.paths.supplementsLog);

      if (parsed.data.intake) {
        const intake = addIntake(log, parsed.data.intake, req.paths.supplementsLog);
        if (!intake) {
          return reply.status(400).send({ ok: false, error: "Invalid intake" });
        }
      }

      if (parsed.data.delete_id) {
        deleteIntake(log, parsed.data.delete_id, req.paths.supplementsLog);
      }

      saveLog(log, req.paths.supplementsLog, req.uid);
      invalidateWeekMicroCache(date, req.paths.nutrition);
      return reply.send({ ok: true, data: log });
    } catch (error) {
      console.error(error);
      return reply.status(500).send({ ok: false, error: "Internal server error" });
    }
  });

  // PATCH /supplements/log
  app.patch("/supplements/log", async (req, reply) => {
    try {
      const parsed = logPatchSchema.safeParse(req.body || {});
      if (!parsed.success) {
        return reply.status(400).send({ ok: false, error: "Invalid data" });
      }

      const date = (parsed.data.date || todayISO()).toString();
      if (!isISODate(date)) {
        return reply.status(400).send({ ok: false, error: "Invalid date" });
      }

      try {
        const bridged = await callV4("/supplements/log", {
          method: "PATCH",
          body: { date, intake_id: parsed.data.intake_id, updates: parsed.data.updates },
        });
        if (bridged.ok) return reply.send(bridged.data);
        if (bridged.status < 500) return reply.status(bridged.status).send(bridged.data);
      } catch {}

      const log = loadLog(date, req.paths.supplementsLog);
      const updated = updateIntake(log, parsed.data.intake_id, parsed.data.updates);
      if (!updated) {
        return reply.status(404).send({ ok: false, error: "Intake not found" });
      }

      saveLog(log, req.paths.supplementsLog, req.uid);
      invalidateWeekMicroCache(date, req.paths.nutrition);
      return reply.send({ ok: true, data: log });
    } catch (error) {
      console.error(error);
      return reply.status(500).send({ ok: false, error: "Internal server error" });
    }
  });

  // GET /supplements/stats?days=30&anchor=YYYY-MM-DD
  app.get("/supplements/stats", async (req, reply) => {
    try {
      const parsed = statsQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        return reply.status(400).send({ ok: false, error: "Invalid query" });
      }

      const { days, anchor } = parsed.data;
      const anchorDate = anchor && isISODate(anchor) ? anchor : todayISO();

      try {
        const bridged = await callV4(`/supplements/stats?days=${encodeURIComponent(days)}&anchor=${encodeURIComponent(anchorDate)}`);
        if (bridged.ok) return reply.send(bridged.data);
        if (bridged.status < 500) return reply.status(bridged.status).send(bridged.data);
      } catch {}

      const startDate = new Date(anchorDate);
      startDate.setDate(startDate.getDate() - days + 1);

      const stats = {};
      const catalog = loadCatalogForUser(req.paths.supplements, { uid: req.uid });

      for (let i = 0; i < days; i++) {
        const d = new Date(startDate);
        d.setDate(d.getDate() + i);
        const dateStr = d.toISOString().split("T")[0];
        const logPath = path.join(req.paths.supplementsLog, `${dateStr}.json`);

        if (fs.existsSync(logPath)) {
          const log = loadLog(dateStr, req.paths.supplementsLog);
          for (const intake of log.intakes || []) {
            const suppId = intake.supplement_id;
            if (!stats[suppId]) {
              const catalogItem = catalog.items.find((i) => i.id === suppId);
              stats[suppId] = {
                supplement: catalogItem || { id: suppId, name: intake.name },
                days_taken: 0,
                current_streak: 0,
              };
            }
            stats[suppId].days_taken += 1;
          }
        }
      }

      // Calculate streaks: backwards from anchor, skip today if not yet logged
      const todayStr = todayISO();
      for (const suppId in stats) {
        let streak = 0;
        for (let i = 0; i < days; i++) {
          const d = new Date(anchorDate);
          d.setDate(d.getDate() - i);
          const dateStr = d.toISOString().split("T")[0];
          const logPath = path.join(req.paths.supplementsLog, `${dateStr}.json`);
          const hasIntake = fs.existsSync(logPath) &&
            loadLog(dateStr, req.paths.supplementsLog).intakes.some((intake) => intake.supplement_id === suppId);
          if (hasIntake) { streak += 1; }
          else if (dateStr === todayStr) { continue; } // heute noch nicht geloggt → nicht brechen
          else { break; }
        }
        stats[suppId].current_streak = streak;
      }

      return reply.send({ ok: true, anchor: anchorDate, days, stats: Object.values(stats) });
    } catch (error) {
      console.error(error);
      return reply.status(500).send({ ok: false, error: "Internal server error" });
    }
  });
}
