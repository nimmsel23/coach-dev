// Keep every workout for each requested calendar day, in report date order.
export function sessionsForDates(history, dates) {
  const byDate = new Map();
  for (const session of Array.isArray(history) ? history : []) {
    if (!session?.date) continue;
    if (!byDate.has(session.date)) byDate.set(session.date, []);
    byDate.get(session.date).push(session);
  }
  return dates.flatMap((date) => byDate.get(date) || []);
}
