export function isCuratedExercise(ex = {}) {
  return ['expert', 'approved'].includes(ex.source) || ex.review_state?.status === 'approved' || !!ex.approved_at || (ex.tags || []).includes('expert');
}

export function mergeExercisePool(bulk, curated) {
  return [...new Map([...bulk, ...curated].map((ex) => [ex.exercise_id || ex.id, ex])).values()];
}

export function supersededSourceRefs(exercises) {
  const refs = { wger: new Set(), yuhonas: new Set() };
  for (const ex of exercises) {
    if (!isCuratedExercise(ex)) continue;
    for (const source of ['wger', 'yuhonas']) {
      const choice = ex.source_selection;
      if (choice && source in choice) {
        if (choice[source] != null) refs[source].add(String(choice[source]));
        continue;
      }
      if (ex[`${source}_id`]) refs[source].add(String(ex[`${source}_id`]));
      for (const id of ex.external_ids?.[source] || []) refs[source].add(String(id));
    }
  }
  return refs;
}

export function isSupersededSource(ex, refs) {
  if (isCuratedExercise(ex)) return false;
  if (ex.merged_into || ex.superseded_by) return true;
  return ['wger', 'yuhonas'].some((source) => ex[`${source}_id`] && refs[source].has(String(ex[`${source}_id`])));
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
