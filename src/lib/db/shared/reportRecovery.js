// The index and current session must use the same resolved muscle hits.
export function buildReportRecoveryIndex(history, hitsOf, toGroups) {
  return (Array.isArray(history) ? history : []).filter((session) => session?.date).map((session) => {
    const groups = new Set();
    for (const [muscle, name] of hitsOf(session)) {
      for (const group of toGroups(muscle, name)) groups.add(group);
    }
    return { date: session.date, groups: [...groups] };
  }).sort((a, b) => b.date.localeCompare(a.date));
}

export function reportRecoveryHours(date, groups, historyIndex) {
  const result = {};
  for (const group of groups) {
    // Date-only sessions do not establish the ordering of workouts on the same day.
    const prior = historyIndex.find((entry) => entry.date < date && entry.groups.includes(group));
    if (prior) result[group] = Math.round((new Date(date) - new Date(prior.date)) / 3600000);
  }
  return result;
}
