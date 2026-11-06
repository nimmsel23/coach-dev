import { num } from './utils.js';

// Preserve concrete exercise identities. A name is a fallback only when one
// side is an older entry without an ID; two different IDs never match by name.
export function matchesTrendExercise(entry, target) {
  const wanted = typeof target === 'string' ? { name: target } : (target || {});
  const targetId = wanted.exercise_id || wanted.id;
  const entryId = entry?.exercise_id || entry?.id;
  if (targetId && entryId) return String(targetId) === String(entryId);
  return Boolean(wanted.name && entry?.name && wanted.name === entry.name);
}

export function calculateProgressTrend(history, exercise, lastN = 4) {
  const sessions = (Array.isArray(history) ? history : [])
    .filter((session) => session?.date && Array.isArray(session.exercises))
    .filter((session) => session.exercises.some((entry) => matchesTrendExercise(entry, exercise)))
    .sort((a, b) => b.date.localeCompare(a.date));
  if (sessions.length < 2) return { status: 'neutral', message: 'Nicht genug Daten' };

  const values = sessions.map((session) => {
    const entry = session.exercises.find((item) => matchesTrendExercise(item, exercise));
    const sets = Array.isArray(entry.setsArray) ? entry.setsArray : (Array.isArray(entry.sets) ? entry.sets : null);
    const weights = sets?.map((set) => num(set?.weight)).filter((weight) => weight !== null && weight > 0) || [];
    return sets ? (weights.length ? Math.max(...weights) : null) : num(entry.weight);
  }).filter((value) => value !== null && value > 0);
  if (values.length < 2) return { status: 'neutral', message: 'Zu wenig Daten' };

  const previous = values.slice(1, Math.max(2, lastN));
  const average = previous.reduce((sum, value) => sum + value, 0) / previous.length;
  const change = (values[0] - average) / average * 100;
  return { status: change > 2 ? 'up' : change < -2 ? 'down' : 'neutral', change: change.toFixed(1) };
}
