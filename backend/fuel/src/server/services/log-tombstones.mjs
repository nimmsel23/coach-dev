import fs from "fs";
import path from "path";
import { NUTRITION_DIR, SUPPLEMENTS_LOG_DIR } from "../config/paths.mjs";

function readJson(filePath, fallback) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, "utf-8"));
    }
  } catch {}
  return fallback;
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

function nutritionTombPath(date, nutritionDir = NUTRITION_DIR) {
  return path.join(nutritionDir, `${date}.deleted.json`);
}

function supplementsTombPath(date, supplementsLogDir = SUPPLEMENTS_LOG_DIR) {
  return path.join(supplementsLogDir, `${date}.deleted.json`);
}

function loadIds(filePath, key) {
  const data = readJson(filePath, { [key]: [] });
  return Array.isArray(data[key]) ? data[key].filter(Boolean) : [];
}

function saveIds(filePath, key, ids) {
  const unique = Array.from(new Set((ids || []).filter(Boolean)));
  if (unique.length === 0) {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    return;
  }
  writeJson(filePath, {
    [key]: unique,
    updated_at: new Date().toISOString(),
  });
}

export function getDeletedMealIds(date, nutritionDir = NUTRITION_DIR) {
  return loadIds(nutritionTombPath(date, nutritionDir), "deleted_meal_ids");
}

export function addDeletedMealIds(date, ids, nutritionDir = NUTRITION_DIR) {
  saveIds(nutritionTombPath(date, nutritionDir), "deleted_meal_ids", [...getDeletedMealIds(date, nutritionDir), ...(ids || [])]);
}

export function addDeletedMealId(date, id, nutritionDir = NUTRITION_DIR) {
  addDeletedMealIds(date, [id], nutritionDir);
}

export function removeDeletedMealId(date, id, nutritionDir = NUTRITION_DIR) {
  saveIds(nutritionTombPath(date, nutritionDir), "deleted_meal_ids", getDeletedMealIds(date, nutritionDir).filter((x) => x !== id));
}

export function getDeletedIntakeIds(date, supplementsLogDir = SUPPLEMENTS_LOG_DIR) {
  return loadIds(supplementsTombPath(date, supplementsLogDir), "deleted_intake_ids");
}

export function addDeletedIntakeIds(date, ids, supplementsLogDir = SUPPLEMENTS_LOG_DIR) {
  saveIds(supplementsTombPath(date, supplementsLogDir), "deleted_intake_ids", [...getDeletedIntakeIds(date, supplementsLogDir), ...(ids || [])]);
}

export function addDeletedIntakeId(date, id, supplementsLogDir = SUPPLEMENTS_LOG_DIR) {
  addDeletedIntakeIds(date, [id], supplementsLogDir);
}

export function removeDeletedIntakeId(date, id, supplementsLogDir = SUPPLEMENTS_LOG_DIR) {
  saveIds(supplementsTombPath(date, supplementsLogDir), "deleted_intake_ids", getDeletedIntakeIds(date, supplementsLogDir).filter((x) => x !== id));
}
