/** Canonical exercise id across catalog API shapes. */
export function exerciseId(ex) {
  if (!ex || typeof ex !== 'object') return null;
  return ex.exercise_id || ex.id || ex.canonical_id || ex.yuhonas_id || null;
}

export function exerciseName(ex) {
  if (!ex || typeof ex !== 'object') return '';
  return ex.display_name || ex.name || ex.german || ex.english || exerciseId(ex) || '';
}

/**
 * Inbox list payloads wrap the draft YAML: { id, file, name, exercises: [record] }.
 * Merge the first exercise record onto the envelope for UI quality/detail views.
 */
export function normalizeInboxItem(item) {
  if (!item || typeof item !== 'object') return item;
  const nested = Array.isArray(item.exercises) ? item.exercises[0] : null;
  if (!nested || typeof nested !== 'object') return item;
  return {
    ...nested,
    ...item,
    // Prefer enriched exercise fields; keep envelope id/file for approve/delete.
    id: item.id,
    file: item.file,
    name: nested.display_name || nested.name || nested.german || item.name,
    display_name: nested.display_name || nested.name || item.display_name,
    category: nested.category || item.category,
    movement_pattern: nested.movement_pattern || item.movement_pattern,
    primary_muscles: nested.primary_muscles || nested.primaryMuscles || item.primary_muscles,
    secondary_muscles: nested.secondary_muscles || nested.secondaryMuscles || item.secondary_muscles,
    primaryMuscles: nested.primaryMuscles || nested.primary_muscles || item.primaryMuscles,
    secondaryMuscles: nested.secondaryMuscles || nested.secondary_muscles || item.secondaryMuscles,
    equipment: nested.equipment || item.equipment,
    description: nested.description || nested.instructions || item.description,
    instructions: nested.instructions || item.instructions,
    lesson: nested.lesson || item.lesson,
    exercise_id: nested.exercise_id || nested.id || item.exercise_id,
    wger_id: nested.wger_id || item.wger_id,
    yuhonas_id: nested.yuhonas_id || item.yuhonas_id,
    _exercise: nested,
  };
}
