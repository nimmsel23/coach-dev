import { test } from 'node:test';
import assert from 'node:assert/strict';
import { firestoreSyncEnabled } from '../src/server/app.mjs';

// Sync hat genau einen Besitzer (Staging, explizit per Flag). Ohne Flag nie — auch nicht auf Prod-Port 7000.
test('kein Flag → kein Firestore-Sync (auch nicht Prod-Port)', () => {
  assert.equal(firestoreSyncEnabled({}), false);
  assert.equal(firestoreSyncEnabled({ PORT: '7000' }), false);
  assert.equal(firestoreSyncEnabled({ FUEL_ENABLE_FIRESTORE_SYNC: '' }), false);
});

test('explizites Flag schaltet den Sync an', () => {
  for (const v of ['1', 'true', 'YES', ' on ']) {
    assert.equal(firestoreSyncEnabled({ FUEL_ENABLE_FIRESTORE_SYNC: v }), true, v);
  }
});

test('0/false schaltet ihn aus', () => {
  for (const v of ['0', 'false', 'off']) {
    assert.equal(firestoreSyncEnabled({ FUEL_ENABLE_FIRESTORE_SYNC: v, PORT: '7000' }), false, v);
  }
});
