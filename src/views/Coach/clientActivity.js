export const INACTIVE_AFTER_MS = 14 * 24 * 60 * 60 * 1000;

export function clientActivity(lastSeenAt, now = Date.now()) {
  const time = typeof lastSeenAt?.toMillis === 'function' ? lastSeenAt.toMillis()
    : typeof lastSeenAt === 'number' ? lastSeenAt : Date.parse(lastSeenAt || '');
  if (!Number.isFinite(time) || time <= 0 || time > now) {
    return { status: 'unknown', label: 'Aktivität unbekannt' };
  }
  const age = now - time;
  const days = Math.floor(age / 86400000);
  const recent = days ? `vor ${days} Tagen` : 'heute';
  return age >= INACTIVE_AFTER_MS
    ? { status: 'inactive', label: `Inaktiv · zuletzt vor ${days} Tagen` }
    : { status: 'active', label: `Aktiv · zuletzt ${recent}` };
}
