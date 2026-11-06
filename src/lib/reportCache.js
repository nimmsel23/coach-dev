import { todayISO } from './db/shared/utils.js';

// Only reuse a rolling report for the same user and local calendar day.
const KEY = 'fitness.monthlyReport.v2';
let revision = 0;

export function reportCacheRevision() { return revision; }

export function readMonthlyReportCache(owner, day = todayISO()) {
  if (!owner) return null;
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || 'null');
    return parsed?.owner === owner && parsed?.day === day ? parsed.data ?? null : null;
  } catch {
    return null;
  }
}

export function writeMonthlyReportCache(data, owner, day = todayISO()) {
  if (!owner) return;
  try {
    localStorage.setItem(KEY, JSON.stringify({ owner, day, data }));
  } catch {
    // Cache unavailable; report remains usable in memory.
  }
}

export function clearMonthlyReportCache() {
  revision++;
  try { localStorage.removeItem(KEY); } catch { /* unavailable */ }
}
