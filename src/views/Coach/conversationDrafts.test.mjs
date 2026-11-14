import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { clearConversationDraftIfUnchanged, readConversationDraft, saveConversationDraft } from '../../lib/conversationDrafts.js';

const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
const plan = {id:'plan-a', name:'Strength', version:2};
const submitted = {text:'Submitted message', plan};
let data;
let store;
beforeEach(() => {
  data = new Map();
  store = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
  };
  Object.defineProperty(globalThis, 'localStorage', {configurable:true, value:store});
});
afterEach(() => {
  if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
  else delete globalThis.localStorage;
});

test('matching submitted text and plan remove only that stored draft', () => {
  saveConversationDraft('coach-a', 'client-a', submitted);
  assert.deepEqual(readConversationDraft('coach-a', 'client-a'), submitted);
  assert.equal(clearConversationDraftIfUnchanged('coach-a', 'client-a', {
    plan:{version:2, name:'Strength', id:'plan-a'}, text:'Submitted message',
  }), true);
  assert.equal(data.size, 0);
  assert.equal(clearConversationDraftIfUnchanged('coach-a', 'client-a', submitted), true);
});

test('newer text, including intentionally cleared text with an attached plan, is preserved', () => {
  for (const text of ['A newer message', '', ' Submitted message', 'Submitted message ']) {
    const newer = {text, plan};
    saveConversationDraft('coach-a', 'client-a', newer);
    assert.equal(clearConversationDraftIfUnchanged('coach-a', 'client-a', submitted), true);
    assert.deepEqual(readConversationDraft('coach-a', 'client-a'), newer);
    assert.equal(data.size, 1);
  }
});

test('changed plan identity, name, version, addition and removal survive an older send completion', () => {
  for (const nextPlan of [{...plan,id:'plan-b'}, {...plan,name:'New title'}, {...plan,version:3}, null]) {
    const newer = {text:submitted.text, plan:nextPlan};
    saveConversationDraft('coach-a', 'client-a', newer);
    assert.equal(clearConversationDraftIfUnchanged('coach-a', 'client-a', submitted), true);
    assert.deepEqual(readConversationDraft('coach-a', 'client-a'), newer);
  }
  saveConversationDraft('coach-a', 'client-a', submitted);
  assert.equal(clearConversationDraftIfUnchanged('coach-a', 'client-a', {text:submitted.text, plan:null}), true);
  assert.deepEqual(readConversationDraft('coach-a', 'client-a'), submitted);
});

test('matching text without a plan clears while other authors and conversations remain isolated', () => {
  const message = {text:'Same text', plan:null};
  for (const [author, client] of [['coach-a','client-a'], ['coach-b','client-a'], ['coach-a','client-b'], ['a:b','c'], ['a','b:c']]) {
    saveConversationDraft(author, client, message);
  }
  assert.equal(clearConversationDraftIfUnchanged('coach-a', 'client-a', message), true);
  assert.equal(data.size, 4);
  for (const [author, client] of [['coach-b','client-a'], ['coach-a','client-b'], ['a:b','c'], ['a','b:c']]) {
    assert.deepEqual(readConversationDraft(author, client), message);
  }
});

test('malformed storage is preserved instead of being normalized into a matching empty draft', () => {
  saveConversationDraft('coach-a', 'client-a', submitted);
  const storageKey = [...data.keys()][0];
  const malformed = [
    '{broken', 'null', '42', JSON.stringify({text:42,plan:null}),
    JSON.stringify({text:submitted.text,plan:{id:'plan-a',version:2}}),
    JSON.stringify({text:submitted.text,plan:{...plan,id:'bad/id'}}),
    JSON.stringify({text:submitted.text,plan:'unexpected'}),
    JSON.stringify({text:'x'.repeat(4001),plan:null}),
  ];
  for (const raw of malformed) {
    data.set(storageKey, raw);
    assert.equal(clearConversationDraftIfUnchanged('coach-a', 'client-a', submitted), true);
    assert.equal(data.get(storageKey), raw);
  }
});

test('unavailable storage reports failure and a failed removal leaves the draft intact', () => {
  Object.defineProperty(globalThis, 'localStorage', {configurable:true, get() {throw new Error('blocked');}});
  assert.equal(clearConversationDraftIfUnchanged('coach-a', 'client-a', submitted), false);
  Object.defineProperty(globalThis, 'localStorage', {configurable:true, value:store});
  store.getItem = () => {throw new Error('blocked');};
  assert.equal(clearConversationDraftIfUnchanged('coach-a', 'client-a', submitted), false);
  store.getItem = (key) => data.get(key) ?? null;
  saveConversationDraft('coach-a', 'client-a', submitted);
  store.removeItem = () => {throw new Error('blocked');};
  assert.equal(clearConversationDraftIfUnchanged('coach-a', 'client-a', submitted), false);
  assert.deepEqual(readConversationDraft('coach-a', 'client-a'), submitted);
});
