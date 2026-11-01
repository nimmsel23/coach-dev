import { collection, doc, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc } from 'firebase/firestore';
import { db, getUid } from './core.js';

const root = (uid) => {
  if (!uid || typeof uid !== 'string' || uid.includes('/')) throw new Error('Klienten-ID fehlt.');
  return ['coachConversations', uid];
};

export function watchClientMessages(clientUid, onChange, onError) {
  const path = root(clientUid);
  let state = { messages: [], readers: {}, fromCache: true };
  let received = false;
  const messages = onSnapshot(query(collection(db, ...path, 'messages'), orderBy('createdAt', 'desc'), limit(100)), { includeMetadataChanges: true }, (snapshot) => {
    received = true;
    state = { ...state, messages: snapshot.docs.map((item) => ({ id: item.id, ...item.data({ serverTimestamps: 'estimate' }), pending: item.metadata.hasPendingWrites })).reverse(), fromCache: snapshot.metadata.fromCache };
    onChange(state);
  }, onError);
  const readers = onSnapshot(collection(db, ...path, 'readStates'), (snapshot) => {
    state = { ...state, readers: Object.fromEntries(snapshot.docs.map((item) => [item.id, item.data()])) };
    if (received) onChange(state);
  }, onError);
  return () => { messages(); readers(); };
}

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
