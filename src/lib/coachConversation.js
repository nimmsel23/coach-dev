import { collection, doc, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase.js';

export function conversationUid() {
  if (!auth.currentUser) throw new Error('Bitte mit deinem Cloud-Konto anmelden.');
  return auth.currentUser.uid;
}

export function watchCoachMessages(onChange, onError) {
  const uid = conversationUid();
  const path = ['coachConversations', uid];
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

export async function sendCoachMessage(text, plan = null) {
  const body = String(text || '').trim();
  if (!body || body.length > 4000) throw new Error('Nachricht muss 1 bis 4000 Zeichen enthalten.');
  const uid = conversationUid();
  const message = doc(collection(db, 'coachConversations', uid, 'messages'));
  await setDoc(message, { body, senderUid: uid, senderRole: 'client', createdAt: serverTimestamp(), plan });
  return message.id;
}

export function markCoachConversationRead() {
  const uid = conversationUid();
  return setDoc(doc(db, 'coachConversations', uid, 'readStates', uid), { lastReadAt: serverTimestamp() });
}
