import test from 'node:test';
import assert from 'node:assert/strict';
import { clientActivity, INACTIVE_AFTER_MS } from './clientActivity.js';

const now = Date.parse('2026-11-24T12:00:00Z');
test('activity switches at exactly 14 elapsed days', () => {
  assert.equal(clientActivity(now - INACTIVE_AFTER_MS + 1, now).status, 'active');
  assert.equal(clientActivity(now - INACTIVE_AFTER_MS, now).status, 'inactive');
  assert.equal(clientActivity(now - 90 * 86400000, now).status, 'inactive');
});
test('missing, invalid and future activity stays unknown', () => {
  for (const value of [null, undefined, '', 'invalid', 0, now + 1]) {
    assert.equal(clientActivity(value, now).status, 'unknown');
  }
});
test('Firestore timestamps and ISO dates produce the same status', () => {
  const time = now - 3 * 86400000;
  assert.deepEqual(clientActivity({ toMillis: () => time }, now), clientActivity(new Date(time).toISOString(), now));
  assert.match(clientActivity(time, now).label, /vor 3 Tagen/);
});
