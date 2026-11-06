import { matchesTrendExercise } from './progressTrend.js';

// Same-day sessions are eligible only when timestamps establish their order.
export function previousExerciseEntries(sessions, beforeDate, currentSession = null) {
  const currentTime = Date.parse(currentSession?.saved_at || '');
  return (Array.isArray(sessions) ? sessions : [])
    .filter((session) => {
      if (!session?.date) return false;
      if (session.date < beforeDate) return true;
      if (session.date > beforeDate || session.id === currentSession?.id) return false;
      const sessionTime = Date.parse(session.saved_at || '');
      return Number.isFinite(currentTime) && Number.isFinite(sessionTime) && sessionTime < currentTime;
    })
    .slice().sort((a, b) => b.date.localeCompare(a.date) || String(b.saved_at || '').localeCompare(String(a.saved_at || '')))
    .flatMap((session) => (Array.isArray(session.exercises) ? session.exercises : [])
      .filter(Boolean).map((exercise) => ({ ...exercise, date: session.date })));
}

export function previousExerciseFor(entries, exercise) {
  return (Array.isArray(entries) ? entries : []).find((entry) => matchesTrendExercise(entry, exercise)) || null;
}
