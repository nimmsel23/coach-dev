import { z } from "zod";
import { loadCatalog, saveCatalog, addOrUpdateItem, deleteMeal } from "../../services/nutrition-catalog.mjs";

const catalogComponentSchema = z.object({
  id: z.string().optional(),
  label: z.string().optional(),
  description: z.string().optional(),
  brand: z.string().optional(),
  grams: z.coerce.number().nullable().optional(),
  kcal: z.coerce.number().optional(),
  protein: z.coerce.number().optional(),
  carbs: z.coerce.number().optional(),
  fat: z.coerce.number().optional(),
  source: z.string().optional(),
  source_kind: z.string().optional(),
});

const catalogAddonSchema = z.object({
  id: z.string().optional(),
  label: z.string().min(1),
  kcal: z.coerce.number().optional(),
  protein: z.coerce.number().optional(),
  carbs: z.coerce.number().optional(),
  fat: z.coerce.number().optional(),
});

const catalogPostSchema = z.object({
  item: z.object({
    id: z.string().optional(),
    kind: z.string().optional(),
    category: z.string().optional(),
    name: z.string().min(1),
    alias: z.string().optional(),
    meal_type: z.string().optional(),
    description: z.string().optional(),
    notes: z.string().optional(),
    kcal: z.coerce.number().optional(),
    protein: z.coerce.number().optional(),
    carbs: z.coerce.number().optional(),
    fat: z.coerce.number().optional(),
    yield_g: z.coerce.number().nullable().optional(),
    components: z.array(catalogComponentSchema).optional(),
    addons: z.array(catalogAddonSchema).optional(),
    default_addon_ids: z.array(z.string()).optional(),
  }).optional(),
});

export default async function catalogRoute(app) {
  // GET /nutrition/catalog
  app.get("/nutrition/catalog", async (req, reply) => {
    const catalog = loadCatalog(req.paths.nutrition, { uid: req.uid });
    return reply.send({ ok: true, items: catalog.items || [] });
  });

  // POST /nutrition/catalog
  app.post("/nutrition/catalog", async (req, reply) => {
    try {
      const parsed = catalogPostSchema.safeParse(req.body || {});
      if (!parsed.success) {
        return reply.status(400).send({ ok: false, error: "Invalid data" });
      }
      const catalog = loadCatalog(req.paths.nutrition, { uid: req.uid });
      const item = addOrUpdateItem(catalog, parsed.data.item || {});
      if (!item) {
        return reply.status(400).send({ ok: false, error: "Name required" });
      }
      saveCatalog(catalog, req.paths.nutrition, { uid: req.uid });
      return reply.send({ ok: true, item });
    } catch (error) {
      console.error(error);
      return reply.status(500).send({ ok: false, error: "Internal server error" });
    }
  });

  // DELETE /nutrition/catalog/:id
  app.delete("/nutrition/catalog/:id", async (req, reply) => {
    try {
      const { id } = req.params;
      if (!id) return reply.status(400).send({ ok: false, error: "ID required" });
      deleteMeal(id, req.paths.nutrition, { uid: req.uid });
      return reply.send({ ok: true });
    } catch (error) {
      console.error(error);
      return reply.status(500).send({ ok: false, error: "Internal server error" });
    }
  });
}
