import { matchesTrendExercise } from './progressTrend.js';

// Date-only history cannot order separate workouts on the open day safely.
export function previousExerciseEntries(sessions, beforeDate) {
  return (Array.isArray(sessions) ? sessions : [])
    .filter((session) => session?.date && session.date < beforeDate)
    .slice().sort((a, b) => b.date.localeCompare(a.date))
    .flatMap((session) => (Array.isArray(session.exercises) ? session.exercises : [])
      .filter(Boolean).map((exercise) => ({ ...exercise, date: session.date })));
}

export function previousExerciseFor(entries, exercise) {
  return (Array.isArray(entries) ? entries : []).find((entry) => matchesTrendExercise(entry, exercise)) || null;
}
