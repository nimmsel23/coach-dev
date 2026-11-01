export function groupWorkoutSets(workout) {
  const groups = new Map();
  for (const set of workout?.eventLog || []) {
    const key = set.exercise_id || set.name || 'unknown';
    if (!groups.has(key)) groups.set(key, {
      exercise_id: set.exercise_id || null,
      name: set.name || String(set.exercise_id || 'Übung').replace(/[_-]+/g, ' '),
      metricType: set.metricType || 'reps',
      sets: [],
    });
    groups.get(key).sets.push(set);
  }
  return [...groups.values()];
}

export function formatSet(set, metricType = set?.metricType) {
  if (!set) return '–';
  if (metricType === 'weight_reps') return `${Number(set.weight || 0)} kg × ${set.reps ?? 0}`;
  if (metricType === 'distance_time') return `${set.distance ?? 0} km · ${set.seconds ?? set.duration ?? 0} min`;
  if (metricType === 'seconds') return `${set.seconds ?? set.duration ?? 0} s`;
  return `${set.reps ?? 0} Wdh`;
}

export function workoutTotals(workout) {
  const start = Date.parse(workout?.started_at);
  const end = Date.parse(workout?.finished_at);
  return {
    sets: workout?.eventLog?.length || 0,
    durationMs: Number.isFinite(start) && Number.isFinite(end) && end >= start ? end - start : 0,
  };
}

export function formatDuration(ms) {
  const minutes = Math.round((Number(ms) || 0) / 60000);
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}
