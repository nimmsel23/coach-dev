import { collection, doc, getDoc, getDocsFromServer, startAfter, where, Timestamp, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc } from 'firebase/firestore';
import { db, getUid } from './core.js';

const root = (uid) => {
  if (!uid || typeof uid !== 'string' || uid.includes('/')) throw new Error('Klienten-ID fehlt.');
  return ['coachConversations', uid];
};

export function watchClientMessages(clientUid, onChange, onError) {
  root(clientUid);
  return subscribeConversation(clientUid, onChange, onError);
}
export function watchClientUnread(clientUid, onChange, onError) {
  root(clientUid);
  return subscribeUnread(clientUid, getUid(), 'client', onChange, onError);
}
export function loadClientMessagePlan(clientUid, plan) { root(clientUid); return readPlanVersion(clientUid, plan); }

export async function sendClientMessage(clientUid, text, plan = null) {
  const body = String(text || '').trim();
  if (!body || body.length > 4000) throw new Error('Nachricht muss 1 bis 4000 Zeichen enthalten.');
  const message = doc(collection(db, ...root(clientUid), 'messages'));
  await setDoc(message, { body, senderUid: getUid(), senderRole: 'coach', createdAt: serverTimestamp(), plan });
  return message.id;
}

export function markClientConversationRead(clientUid) {
  return setDoc(doc(db, ...root(clientUid), 'readStates', getUid()), { lastReadAt: serverTimestamp() });
}

const PAGE_SIZE = 100;
const readMessage = (item) => ({ id: item.id, ...item.data({ serverTimestamps: 'estimate' }), pending: item.metadata.hasPendingWrites });
const ordered = (messages) => [...messages.values()].sort((a, b) => (a.createdAt?.toMillis?.() || 0) - (b.createdAt?.toMillis?.() || 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

function subscribeConversation(uid, onChange, onError) {
  const path = ['coachConversations', uid];
  const timeline = new Map();
  let state = { messages: [], readers: {}, fromCache: true, hasMore: false, loadingOlder: false };
  let cursor = null;
  let paged = false;
  let received = false;
  let active = true;
  const emit = () => { if (active) onChange({ ...state, messages: ordered(timeline) }); };
  const messages = onSnapshot(query(collection(db, ...path, 'messages'), orderBy('createdAt', 'desc'), limit(PAGE_SIZE)), { includeMetadataChanges: true }, (snapshot) => {
    if (!active) return;
    received = true;
    snapshot.docs.forEach((item) => timeline.set(item.id, readMessage(item)));
    if (!paged) { cursor = snapshot.docs.at(-1) || null; state.hasMore = !snapshot.metadata.fromCache && snapshot.size === PAGE_SIZE && !cursor?.metadata.hasPendingWrites; }
    state.fromCache = snapshot.metadata.fromCache;
    emit();
  }, onError);
  const readers = onSnapshot(collection(db, ...path, 'readStates'), (snapshot) => {
    state.readers = Object.fromEntries(snapshot.docs.map((item) => [item.id, item.data({ serverTimestamps: 'estimate' })]));
    if (received) emit();
  }, onError);
  return {
    unsubscribe() { active = false; messages(); readers(); },
    async loadOlder() {
      if (!active || state.loadingOlder || !state.hasMore || !cursor) return;
      state.loadingOlder = true; emit();
      try {
        const snapshot = await getDocsFromServer(query(collection(db, ...path, 'messages'), orderBy('createdAt', 'desc'), startAfter(cursor), limit(PAGE_SIZE)));
        if (!active) return;
        paged = true;
        snapshot.docs.forEach((item) => timeline.set(item.id, readMessage(item)));
        cursor = snapshot.docs.at(-1) || cursor;
        state.hasMore = snapshot.size === PAGE_SIZE;
      } finally { state.loadingOlder = false; emit(); }
    },
  };
}

function subscribeUnread(uid, readerUid, incomingRole, onChange, onError) {
  let stopMessages = () => {};
  let active = true;
  let generation = 0;
  const stopReader = onSnapshot(doc(db, 'coachConversations', uid, 'readStates', readerUid), (snapshot) => {
    if (!active) return;
    const request = ++generation;
    stopMessages();
    const after = snapshot.data({ serverTimestamps: 'estimate' })?.lastReadAt || Timestamp.fromMillis(0);
    stopMessages = onSnapshot(query(collection(db, 'coachConversations', uid, 'messages'), where('senderRole', '==', incomingRole), where('createdAt', '>', after), orderBy('createdAt', 'desc'), limit(100)), (messages) => { if (active && request === generation) onChange(messages.size); }, onError);
  }, onError);
  return () => { active = false; stopMessages(); stopReader(); };
}

async function readPlanVersion(uid, plan) {
  if (!plan || typeof plan.id !== 'string' || plan.id.includes('/') || !Number.isInteger(plan.version) || plan.version < 1) throw new Error('Ungültiger Planbezug.');
  const version = await getDoc(doc(db, 'fitness', uid, 'macrocycles', plan.id, 'versions', `v${plan.version}`));
  if (!version.exists() || !version.data().snapshot) throw new Error('Diese Planversion ist nicht mehr verfügbar.');
  return { ...version.data().snapshot, headVersion: plan.version };
}
