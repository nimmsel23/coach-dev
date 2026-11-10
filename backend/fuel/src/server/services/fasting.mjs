/**
 * Fasting window service — builds meal data + computes analysis.
 * Loads from local SQLite via getMealsForDate, then delegates to pure
 * computeFastingWindows function.
 */

import path from "path";
import { getMealsForDate } from "./nutrition-db.mjs";
import { computeFastingWindows } from "../../shared/utils/fasting.mjs";

function recentDates(daysBack) {
  const dates = [];
  const today = new Date();
  for (let i = daysBack; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().split("T")[0]);
  }
  return dates;
}

export async function getFastingWindows(days = 14, options = {}) {
  // Load data for days + 1 (so first requested day has a prev-day for comparison)
  const allDates = recentDates(days);
  const dbOptions = {
    nutritionDir: options.nutritionDir,
    nutritionDbPath: options.nutritionDbPath || (options.nutritionDir ? path.join(options.nutritionDir, "nutrition.db") : undefined),
    uid: options.uid,
  };
  const dayLogs = allDates.map((date) => ({
    date,
    meals: getMealsForDate(date, dbOptions),
  }));

  const windows = computeFastingWindows(dayLogs);

  // Return only last `days` entries (discard the extra first day used for context)
  return windows.slice(-days);
}
