import { callGemini, extractJson } from "../../services/gemini.mjs";
import { loadLog, saveLog, addMeal } from "../../services/nutrition-log.mjs";
import { writeEntry } from "../../services/nutrition-notes.mjs";
import { loadCatalog, saveCatalog, addOrUpdateItem, upsertLoggedMeal } from "../../services/nutrition-catalog.mjs";
import { matchComponents, loadIngredients } from "../../services/nutrition-component-match.mjs";
import { saveMicrosForMeal, MICRO_KEYS } from "../../services/nutrition-micros.mjs";
import { todayISO } from "../../../shared/utils/validation.mjs";

export default async function aiLogRoute(app) {
  app.post("/nutrition/ai-log", async (req, reply) => {
    const { text, date: dateArg } = req.body || {};
    const date = dateArg || todayISO();
    if (!text?.trim()) return reply.status(400).send({ ok: false, error: "text fehlt" });

    try {
      const catalog = loadCatalog(req.paths.nutrition, { uid: req.uid });

      // Mehrere bekannte Katalog-/Ingredient-Namen im Text erkannt (z.B.
      // "Nussschnecke und Ziegenkäse")? Dann direkt aus deren gespeicherten
      // Werten zusammensetzen statt eine Gemini-Neuschätzung zu riskieren,
      // die bereits verifizierte/manuelle Werte ignorieren würde.
      const componentMatches = matchComponents(text, catalog, loadIngredients());

      let result;
      if (componentMatches.length >= 2) {
        const sum = componentMatches.reduce(
          (acc, c) => ({
            kcal: acc.kcal + (c.kcal || 0),
            protein: acc.protein + (c.protein || 0),
            carbs: acc.carbs + (c.carbs || 0),
            fat: acc.fat + (c.fat || 0),
          }),
          { kcal: 0, protein: 0, carbs: 0, fat: 0 }
        );
        result = {
          type: "meal",
          meal: {
            kind: "recipe",
            category: "recipe",
            description: componentMatches.map((c) => c.name).join(" + "),
            kcal: Math.round(sum.kcal * 10) / 10,
            protein: Math.round(sum.protein * 10) / 10,
            carbs: Math.round(sum.carbs * 10) / 10,
            fat: Math.round(sum.fat * 10) / 10,
            components: componentMatches.map((c) => ({
              id: c.id,
              label: c.name,
              description: c.name,
              brand: "",
              grams: c.type === "ingredient" ? 100 : null,
              kcal: c.kcal, protein: c.protein, carbs: c.carbs, fat: c.fat,
              source: "component-match", source_kind: c.type,
            })),
          },
        };
      } else {
        const prompt = `Analysiere diesen Text. Ist es ein Nahrungs- oder Supplement-Eintrag für heute (meal)? Oder eine Anweisung für den Katalog (Gericht definieren - catalog)? Gib JSON zurück:
      {"type": "meal" | "catalog", "meal": {"description", "kcal", "protein", "carbs", "fat", "micros": {${MICRO_KEYS.join(", ")}}}?}
      Ignoriere Text, der sich nicht auf Ernährung oder Supplemente bezieht.
      Text: ${text}`;
        const raw = await callGemini(prompt);
        result = JSON.parse(extractJson(raw));
      }

      const mealName = result.meal.description;
      const microOptions = {
        nutritionDir: req.paths.nutrition,
        nutritionDbPath: req.paths.nutritionDb,
        uid: req.uid,
      };
      if (result.meal.micros) {
        saveMicrosForMeal(mealName, result.meal.kcal || 0, result.meal.micros, "gemini-ai-log", microOptions);
        result.meal.micros_meta = {
          source: "gemini-ai-log",
          lookup_name: mealName,
          inferred_from: mealName,
          normalized_key: null,
          scaling_factor: 1,
          resolved_at: new Date().toISOString(),
          origin: "ai_log",
        };
      }

      if (result.type === "meal") {
        const log = loadLog(date, req.paths.nutrition);
        addMeal(log, result.meal);
        saveLog(log, req.paths.nutrition, {
          nutritionDbPath: req.paths.nutritionDb,
          uid: req.uid,
        });
        upsertLoggedMeal(loadCatalog(req.paths.nutrition, { uid: req.uid }), result.meal);
        return reply.send({ ok: true, type: "meal" });
      } else if (result.type === "catalog") {
        const catalog = loadCatalog(req.paths.nutrition, { uid: req.uid });
        addOrUpdateItem(catalog, { ...result.meal, source: "gemini" });
        saveCatalog(catalog, req.paths.nutrition, { uid: req.uid });
        return reply.send({ ok: true, type: "catalog" });
      } else {
        return reply.status(400).send({ ok: false, error: "Keine Ernährungsinformation erkannt" });
      }
    } catch (e) {
      console.error("ai-log error:", e);
      return reply.status(500).send({ ok: false, error: e.message });
    }
  });
}
