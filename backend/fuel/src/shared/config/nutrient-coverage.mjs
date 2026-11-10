// Coverage describes recorded entries, not whether every meal of the week was logged.
export function nutrientCoverage(breakdown, comparison) {
  const entries = Object.values(breakdown || {}).flat();
  return Object.fromEntries(Object.keys(comparison).map((key) => {
    const known = entries.filter((entry) => {
      const value = entry.micros?.[key];
      return value != null && value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0;
    }).length;
    const complete = known > 0 && known === entries.length;
    return [key, {
      ...comparison[key], known_entries: known, total_entries: entries.length,
      coverage: known === 0 ? 'unknown' : complete ? 'complete' : 'partial',
      ...(known === 0 ? { avg_daily: null, total_week: null } : {}),
      ...(!complete ? { percent_of_dach: null, status: 'unknown' } : {}),
    }];
  }));
}
