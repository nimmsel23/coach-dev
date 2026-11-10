import http from "http";
import { WGER_API_URL, WGER_API_TOKEN } from "../../shared/config/constants.mjs";

/**
 * Search wger local database for ingredients
 * Returns array of {id, name, brand, energy_kcal, protein, carbs, fat, serving_size_g}
 */
export async function searchWgerIngredients(query, limit = 10) {
  return new Promise((resolve) => {
    const url = `${WGER_API_URL}/ingredient/?format=json&limit=${limit}&name__search=${encodeURIComponent(query)}`;
    const req = http.get(
      url,
      { headers: { Authorization: `Token ${WGER_API_TOKEN}` } },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const result = JSON.parse(data);
            const ingredients = (result.results || [])
              .filter((i) => i.name && i.energy != null)
              .map((i) => ({
                id: i.id,
                name: i.name.trim(),
                brand: i.brand || "",
                energy_kcal: Math.round((i.energy ?? 0) * 10) / 10,
                protein: Math.round((parseFloat(i.protein) ?? 0) * 10) / 10,
                carbs: Math.round((parseFloat(i.carbohydrates) ?? 0) * 10) / 10,
                fat: Math.round((parseFloat(i.fat) ?? 0) * 10) / 10,
                serving_size_g: 100, // per 100g standard
              }));
            resolve(ingredients);
          } catch {
            resolve([]);
          }
        });
      }
    );
    req.on("error", () => resolve([]));
    req.setTimeout(3000, () => {
      req.destroy();
      resolve([]);
    });
  });
}

/**
 * Get single ingredient by ID from wger
 */
export async function getWgerIngredient(id) {
  return new Promise((resolve) => {
    const url = `${WGER_API_URL}/ingredient/${id}/?format=json`;
    const req = http.get(
      url,
      { headers: { Authorization: `Token ${WGER_API_TOKEN}` } },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const i = JSON.parse(data);
            resolve({
              id: i.id,
              name: i.name.trim(),
              brand: i.brand || "",
              energy_kcal: Math.round((i.energy ?? 0) * 10) / 10,
              protein: Math.round((parseFloat(i.protein) ?? 0) * 10) / 10,
              carbs: Math.round((parseFloat(i.carbohydrates) ?? 0) * 10) / 10,
              fat: Math.round((parseFloat(i.fat) ?? 0) * 10) / 10,
              serving_size_g: 100,
            });
          } catch {
            resolve(null);
          }
        });
      }
    );
    req.on("error", () => resolve(null));
    req.setTimeout(3000, () => {
      req.destroy();
      resolve(null);
    });
  });
}

/**
 * Get full ingredient data including micronutrients
 */
export async function getWgerIngredientFull(id) {
  return new Promise((resolve) => {
    const url = `${WGER_API_URL}/ingredient/${id}/?format=json`;
    const req = http.get(
      url,
      { headers: { Authorization: `Token ${WGER_API_TOKEN}` } },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const i = JSON.parse(data);
            resolve({
              id: i.id,
              name: i.name.trim(),
              brand: i.brand || "",
              energy_kcal: Math.round((i.energy ?? 0) * 10) / 10,
              protein: Math.round((parseFloat(i.protein) ?? 0) * 10) / 10,
              carbs: Math.round((parseFloat(i.carbohydrates) ?? 0) * 10) / 10,
              fat: Math.round((parseFloat(i.fat) ?? 0) * 10) / 10,
              fiber: Math.round((parseFloat(i.fiber) ?? 0) * 10) / 10,
              sodium_mg: Math.round((parseFloat(i.sodium) ?? 0) * 10) / 10,
              serving_size_g: 100,
            });
          } catch {
            resolve(null);
          }
        });
      }
    );
    req.on("error", () => resolve(null));
    req.setTimeout(3000, () => {
      req.destroy();
      resolve(null);
    });
  });
}

/**
 * Calculate macros for ingredients with given quantities
 * ingredients: [{name: "Schnitzel", quantity_g: 150}, ...]
 * Returns: {kcal, protein, carbs, fat, components: [...]}
 */
export async function composeFromWger(ingredients) {
  let totalKcal = 0;
  let totalProtein = 0;
  let totalCarbs = 0;
  let totalFat = 0;
  const components = [];

  for (const ing of ingredients) {
    const results = await searchWgerIngredients(ing.name, 1);
    if (results.length === 0) continue;

    const ingredient = results[0];
    const fullData = await getWgerIngredientFull(ingredient.id);
    if (!fullData) continue;

    const quantity = ing.quantity_g || 100;
    const multiplier = quantity / 100; // wger data per 100g

    const kcal = Math.round(ingredient.energy_kcal * multiplier * 10) / 10;
    const protein = Math.round(ingredient.protein * multiplier * 10) / 10;
    const carbs = Math.round(ingredient.carbs * multiplier * 10) / 10;
    const fat = Math.round(ingredient.fat * multiplier * 10) / 10;
    const sodium = Math.round((fullData.sodium_mg || 0) * multiplier * 10) / 10;

    totalKcal += kcal;
    totalProtein += protein;
    totalCarbs += carbs;
    totalFat += fat;

    components.push({
      wger_id: ingredient.id,
      name: ingredient.name,
      quantity_g: quantity,
      kcal,
      protein,
      carbs,
      fat,
      sodium_mg: sodium,
      brand: ingredient.brand,
    });
  }

  return {
    kcal: Math.round(totalKcal),
    protein: Math.round(totalProtein * 10) / 10,
    carbs: Math.round(totalCarbs * 10) / 10,
    fat: Math.round(totalFat * 10) / 10,
    components,
  };
}
