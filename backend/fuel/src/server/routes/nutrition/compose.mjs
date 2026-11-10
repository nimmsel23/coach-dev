import { composeMeal } from "../../services/nutrition-compose.mjs";
import { upsertIngredient } from "../../services/nutrition-db.mjs";
import { addOrUpdateItem, loadCatalog } from "../../services/nutrition-catalog.mjs";
import { estimateMicros } from "../../services/nutrition-estimate-micros.mjs";
import { saveMicrosForMeal } from "../../services/nutrition-micros.mjs";

export default async function composeRoute(app) {
  // POST /nutrition/compose — Compose meal via wger + Gemini, optionally save to catalog
  app.post("/nutrition/compose", async (req, reply) => {
    try {
      const { description, save_catalog } = req.body || {};
      if (!description?.trim()) return reply.status(400).send({ ok: false, error: "description required" });
      const microOptions = {
        nutritionDir: req.paths.nutrition,
        nutritionDbPath: req.paths.nutritionDb,
        uid: req.uid,
      };

      const composed = await composeMeal(description);

      if (save_catalog && composed.kcal > 0) {
        const catalog = loadCatalog(req.paths.nutrition, { uid: req.uid });

        // Save meal to individual file
        const catalogItem = {
          name: description,
          description,
          kcal: composed.kcal,
          protein: composed.protein,
          carbs: composed.carbs,
          fat: composed.fat,
          components: composed.components,
          source: "gemini-compose",
        };
        addOrUpdateItem(catalog, catalogItem);

        // Cache wger ingredients in SQLite
        for (const comp of composed.components || []) {
          if (!comp.wger_id || !comp.quantity_g) continue;
          upsertIngredient(comp.wger_id, {
            name: comp.name,
            brand: comp.brand || null,
            kcal:      comp.kcal      / (comp.quantity_g / 100),
            protein:   comp.protein   / (comp.quantity_g / 100),
            carbs:     comp.carbs     / (comp.quantity_g / 100),
            fat:       comp.fat       / (comp.quantity_g / 100),
            sodium_mg: comp.sodium_mg ? comp.sodium_mg / (comp.quantity_g / 100) : null,
          }, microOptions);
        }

        // Gemini estimates micronutrient profile for the whole meal as eaten → SQLite
        const micros = await estimateMicros(description);
        if (Object.keys(micros).length > 0) {
          saveMicrosForMeal(description, composed.kcal, micros, "gemini-compose", microOptions);
        }

        return reply.send({ ok: true, description, ...composed, saved: true, micros });
      }

      return reply.send({ ok: true, description, ...composed, saved: false });
    } catch (error) {
      console.error(error);
      return reply.status(500).send({ ok: false, error: "Internal server error" });
    }
  });
}
