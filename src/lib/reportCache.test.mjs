import test from 'node:test';
import assert from 'node:assert/strict';
import { readMonthlyReportCache, writeMonthlyReportCache, clearMonthlyReportCache, reportCacheRevision } from './reportCache.js';

test('monthly cache is scoped by account and local day and invalidated on save', () => {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, value),
    removeItem: (key) => store.delete(key),
  };
  writeMonthlyReportCache({ count: 3 }, 'user-a', '2026-11-03');
  assert.deepEqual(readMonthlyReportCache('user-a', '2026-11-03'), { count: 3 });
  assert.equal(readMonthlyReportCache('user-b', '2026-11-03'), null);
  assert.equal(readMonthlyReportCache('user-a', '2026-11-04'), null);
  const before = reportCacheRevision();
  clearMonthlyReportCache();
  assert.equal(reportCacheRevision(), before + 1);
  assert.equal(readMonthlyReportCache('user-a', '2026-11-03'), null);
  delete globalThis.localStorage;
});
