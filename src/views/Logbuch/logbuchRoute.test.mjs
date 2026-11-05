// node --test src/views/Logbuch/logbuchRoute.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLogbuchHash, logbuchHash } from './logbuchRoute.js';

test('Deep-Link: Linse und Übung aus dem Hash', () => {
  assert.deepEqual(parseLogbuchHash('#session/logbuch/rekorde'), { lens: 'rekorde', ex: null });
  assert.deepEqual(parseLogbuchHash('#session/logbuch/kodex?ex=id%3Abench'), { lens: 'kodex', ex: 'id:bench' });
  assert.deepEqual(parseLogbuchHash('#session/logbuch'), { lens: null, ex: null });
  assert.deepEqual(parseLogbuchHash('#session/logbuch/unsinn'), { lens: null, ex: null });
  assert.deepEqual(parseLogbuchHash('#session/plan'), { lens: null, ex: null });
});

test('Deep-Link: Hash bauen, Übung nur im Kodex', () => {
  assert.equal(logbuchHash('muskeln', 'id:bench'), '#session/logbuch/muskeln');
  assert.equal(logbuchHash('kodex', 'id:bench'), '#session/logbuch/kodex?ex=id%3Abench');
  assert.equal(logbuchHash(null, null), '#session/logbuch');
});
