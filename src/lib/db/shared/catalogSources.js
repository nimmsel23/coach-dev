export function isCuratedExercise(ex = {}) {
  if (ex.review_state?.status && ex.review_state.status !== 'approved') return false;
  return ['expert', 'approved'].includes(ex.source) || ex.review_state?.status === 'approved' || !!ex.approved_at || (ex.tags || []).includes('expert');
}

export function mergeExercisePool(bulk, curated) {
  return [...new Map([...bulk, ...curated].map((ex) => [ex.exercise_id || ex.id, ex])).values()];
}

export function supersededSourceRefs(exercises) {
  const refs = { wger: new Set(), yuhonas: new Set() };
  for (const ex of exercises) {
    if (!isCuratedExercise(ex) || ex.archived || (ex.tags || []).includes('archived')) continue;
    for (const source of ['wger', 'yuhonas']) {
      for (const id of sourceIds(ex, source, true)) refs[source].add(String(id));
    }
  }
  return refs;
}

export function isSupersededSource(ex, refs) {
  if (isCuratedExercise(ex)) return false;
  return ['wger', 'yuhonas'].some(source => sourceIds(ex, source, true).some(id => refs[source].has(String(id))));
}

export function sourceIds(exercise, source, inferFromId = false) {
  const choice = exercise?.source_selection;
  if (choice && source in choice) return choice[source] == null ? [] : [String(choice[source])];
  const value = exercise?.external_ids?.[source] || exercise?.origin?.source_refs?.[source]
    || exercise?.origin?.[source]?.[`${source}_id`] || exercise?.source_snapshot?.[source]?.[`${source}_id`]
    || exercise?.[`${source}_id`];
  if (value != null) return (Array.isArray(value) ? value : [value]).filter((v) => v != null && v !== '').map(String);
  const id = String(exercise?.exercise_id || exercise?.id || '');
  return inferFromId && id.startsWith(`${source}_`) ? [id.slice(source.length + 1)] : [];
}
