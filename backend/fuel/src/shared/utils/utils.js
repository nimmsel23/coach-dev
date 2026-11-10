export function sumMetric(meals, key) {
  return meals.reduce((sum, meal) => sum + (Number(meal[key]) || 0), 0);
}

export function sumCompleteMetric(meals, key) {
  if (meals.some((meal) => meal[key] == null || (typeof meal[key] === "string" && !meal[key].trim()) || typeof meal[key] === "boolean" || !Number.isFinite(Number(meal[key])) || Number(meal[key]) < 0)) return null;
  return sumMetric(meals, key);
}

export function formatMetric(value, unit = "") {
  if (value == null || value === "" || typeof value === "boolean" || !Number.isFinite(Number(value))) return "—";
  const rounded = Math.round((Number(value) || 0) * 10) / 10;
  const output = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return unit ? `${output}${unit}` : output;
}

export function formatMealMetric(meal, key) {
  const value = formatMetric(meal?.[key]);
  return value === "—" ? value : `${meal?.estimated_fields?.includes(key) ? "≈" : ""}${value}`;
}

export function normalizeSupplementUnit(unit) {
  const value = String(unit || "").trim();
  if (!value) return "mg";
  const parts = value.split(/\s+/);
  return parts.length > 1 ? parts[parts.length - 1] : value;
}
