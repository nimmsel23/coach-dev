/**
 * shared/nonExercises.js — Sperrliste für Nicht-Übungen (Aktivitäten wie HIIT).
 *
 * SSOT ist fitness/catalog/kb/registry/non_exercises.yml; der Build-Schritt
 * scripts/build-exercise-bulk-data.mjs erzeugt daraus nonExercises.generated.js.
 * Matching nur über IDs (exercise_id / id / wger_id / yuhonas_id), nie über Namen.
 * Aktivitäten gehören in die Session als Finisher/Activity-Addon, nicht als Exercise.
 */

const text = (v) => (v === null || v === undefined || v === "" ? "" : String(v).trim());

export function isNonExercise(ex, block) {
  if (!ex || !block) return false;
  const ids = new Set(block.ids || []);
  const wger = new Set(block.wger || []);
  const yuhonas = new Set((block.yuhonas || []).map((v) => String(v).toLowerCase()));
  if (ids.has(text(ex.exercise_id)) || ids.has(text(ex.id))) return true;
  if (wger.has(text(ex.wger_id))) return true;
  const y = text(ex.yuhonas_id).toLowerCase();
  return Boolean(y) && yuhonas.has(y);
}

/** Filtert eine Übungsliste; ohne Sperrliste unverändert. */
export function withoutNonExercises(list, block) {
  return (Array.isArray(list) ? list : []).filter((ex) => !isNonExercise(ex, block));
}
