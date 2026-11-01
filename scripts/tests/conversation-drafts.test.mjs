import test from 'node:test';
import assert from 'node:assert/strict';
import { readConversationDraft, saveConversationDraft } from '../../src/lib/conversationDrafts.js';
const values = new Map();
globalThis.localStorage = { getItem: (key) => values.get(key) || null, setItem: (key,value) => values.set(key,value), removeItem: (key) => values.delete(key) };
test('drafts survive reads and remain isolated by author and client', () => {
 const draft = { text: 'Mein Entwurf', plan: { id: 'p', name: 'Plan', version: 2 } };
 assert.equal(saveConversationDraft('coach-a','client-a',draft),true);
 assert.deepEqual(readConversationDraft('coach-a','client-a'),draft);
 assert.equal(readConversationDraft('coach-b','client-a').text,'');
 assert.equal(readConversationDraft('coach-a','client-b').text,'');
 saveConversationDraft('coach-a','client-a',{text:'',plan:null});
 assert.equal(readConversationDraft('coach-a','client-a').text,'');
});
test('storage failures and corrupt data do not erase the live draft or crash the view', () => {
 values.set('coach-conversation-draft-v1:a:b','not-json');
 assert.equal(readConversationDraft('a','b').text,'');
 const set = localStorage.setItem;
 localStorage.setItem=()=>{throw new Error('quota')};
 assert.equal(saveConversationDraft('a','b',{text:'still in composer',plan:null}),false);
 localStorage.setItem=set;
});
