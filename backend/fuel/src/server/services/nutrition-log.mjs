import path from "path";
import { readJsonFile, writeJsonFile } from "../lib/file-io.mjs";
import { randomId } from "../../shared/utils/ids.mjs";
import { isISODate, todayISO, sanitizeMetric } from "../../shared/utils/validation.mjs";
import { NUTRITION_DIR } from "../config/paths.mjs";
import { deleteMeal as deleteMealRow, getMealsForDate, getWater, upsertMeal, upsertWater } from "./nutrition-db.mjs";

function dbOptions(nutritionDir, options = {}) {
  return {
    nutritionDir,
    nutritionDbPath: options.nutritionDbPath || path.join(nutritionDir, "nutrition.db"),
    uid: options.uid || "default",
  };
}

function getLogPath(date, nutritionDir = NUTRITION_DIR) {
  return path.join(nutritionDir, `${date}.json`);
}

export function loadLog(date, nutritionDir = NUTRITION_DIR) {
  if (!isISODate(date)) date = todayISO();
  const defaultLog = { date, meals: [], water_ml: 0 };
  return readJsonFile(getLogPath(date, nutritionDir), defaultLog);
}

export function saveLog(log, nutritionDir = NUTRITION_DIR, options = {}) {
  const resolved = dbOptions(nutritionDir, options);
  writeJsonFile(getLogPath(log.date, nutritionDir), log);
  const existing = getMealsForDate(log.date, resolved);
  const currentIds = new Set((log.meals || []).filter((m) => m.id).map((m) => m.id));
  for (const row of existing) {
    if (!currentIds.has(row.id)) deleteMealRow(row.id, resolved);
  }
  for (const meal of log.meals || []) {
    if (!meal.id) continue;
    upsertMeal({ ...meal, date: log.date }, resolved);
  }
  if ((log.water_ml || 0) !== getWater(log.date, resolved)) {
    upsertWater(log.date, log.water_ml || 0, resolved);
  }
}

export function addMeal(log, mealInput) {
  const meal = {
    id: randomId("meal"),
    type: mealInput.type || "meal",
    description: (mealInput.description || "").trim(),
    notes: mealInput.notes || "",
    kcal: sanitizeMetric(mealInput.kcal),
    protein: sanitizeMetric(mealInput.protein),
    carbs: sanitizeMetric(mealInput.carbs),
    fat: sanitizeMetric(mealInput.fat),
    catalog_item_id: mealInput.catalog_item_id || null,
    catalog_components: mealInput.catalog_components || [],
    catalog_addon_ids: mealInput.catalog_addon_ids || [],
    micros: mealInput.micros || null,
    micros_meta: mealInput.micros_meta || null,
    time: new Date().toISOString(),
  };

  if (!meal.description && !meal.catalog_item_id) {
    return null;
  }

  log.meals.push(meal);
  return meal;
}

export function updateMeal(log, mealId, updates) {
  const idx = log.meals.findIndex((m) => m.id === mealId);
  if (idx < 0) return null;

  const meal = log.meals[idx];
  if (updates.description !== undefined) meal.description = updates.description.trim();
  if (updates.notes !== undefined) meal.notes = updates.notes;
  if (updates.kcal !== undefined) meal.kcal = sanitizeMetric(updates.kcal);
  if (updates.protein !== undefined) meal.protein = sanitizeMetric(updates.protein);
  if (updates.carbs !== undefined) meal.carbs = sanitizeMetric(updates.carbs);
  if (updates.fat !== undefined) meal.fat = sanitizeMetric(updates.fat);

  return meal;
}

export function deleteMeal(log, mealId) {
  const idx = log.meals.findIndex((m) => m.id === mealId);
  if (idx < 0) return false;
  log.meals.splice(idx, 1);
  return true;
}

export function setWater(log, waterMl) {
  log.water_ml = Math.max(0, Math.round(waterMl));
  return log.water_ml;
}
