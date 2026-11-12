import test from 'node:test';
import assert from 'node:assert/strict';
import { readHabitDraft, writeHabitDraft, clearHabitDraft } from './habitCycleDraft.js';
const storage = () => {
  const data = new Map();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), removeItem: (k) => data.delete(k) };
};
const draft = { baseConfig: { tags: ['Push'], targetCycles: 6 }, config: { tags: ['Pull'], targetCycles: 8 }, newTag: 'Legs' };

test('drafts survive remount while remaining isolated by coach and client', () => {
  const store = storage();
  assert.equal(writeHabitDraft(store, 'coach-a', 'client-a', draft), true);
  assert.deepEqual(readHabitDraft(store, 'coach-a', 'client-a'), { ...draft, version: 1 });
  assert.equal(readHabitDraft(store, 'coach-b', 'client-a'), null);
  assert.equal(readHabitDraft(store, 'coach-a', 'client-b'), null);
  clearHabitDraft(store, 'coach-a', 'client-b');
  assert.ok(readHabitDraft(store, 'coach-a', 'client-a'));
  clearHabitDraft(store, 'coach-a', 'client-a');
  assert.equal(readHabitDraft(store, 'coach-a', 'client-a'), null);
});
test('broken and unsupported drafts cannot replace the loaded configuration', () => {
  for (const value of ['{broken', JSON.stringify({ ...draft, version: 2 }), JSON.stringify({ ...draft, version: 1, config: { tags: null } })]) {
    assert.equal(readHabitDraft({ getItem: () => value }, 'a', 'b'), null);
  }
});
test('unavailable storage and missing identity do not crash the editor', () => {
  const store = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('quota'); }, removeItem() { throw new Error('denied'); } };
  assert.equal(readHabitDraft(store, 'a', 'b'), null);
  assert.equal(writeHabitDraft(store, 'a', 'b', draft), false);
  assert.equal(clearHabitDraft(store, 'a', 'b'), false);
  assert.equal(writeHabitDraft(store, '', 'b', draft), false);
});
