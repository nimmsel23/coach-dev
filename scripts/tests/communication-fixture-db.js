import { initializeApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator, getDoc, doc, setDoc, collection, writeBatch, serverTimestamp } from 'firebase/firestore';
const projectId = 'demo-coach-communication';
const coachDb = getFirestore(initializeApp({ projectId, apiKey: 'demo-key' }, 'communication-coach'));
const clientDb = getFirestore(initializeApp({ projectId, apiKey: 'demo-key' }, 'communication-client'));
connectFirestoreEmulator(coachDb, '127.0.0.1', 18080, { mockUserToken: { sub: 'coach-browser', coach: true } });
connectFirestoreEmulator(clientDb, '127.0.0.1', 18080, { mockUserToken: { sub: 'client-a' } });
export { coachDb, clientDb };
export const plan = { id: 'plan-a', name: '3er-Split Frühjahr', headVersion: 2 };

if (!(await getDoc(doc(coachDb, 'fitness', 'client-a', 'macrocycles', 'plan-a', 'versions', 'v2'))).exists()) await setDoc(doc(coachDb, 'fitness', 'client-a', 'macrocycles', 'plan-a', 'versions', 'v2'), { number: 2, snapshot: { name: '3er-Split Frühjahr', totalWeeks: 6, routines: [{ id: 'day-a', label: 'Training A', exercises: [] }] } });
window.seedCommunicationHistory = async () => {
  const batch = writeBatch(coachDb);
  for (let i = 0; i < 205; i++) batch.set(doc(coachDb, 'coachConversations', 'client-a', 'messages', `history-${String(i).padStart(3, '0')}`), { body: `Historie ${String(i).padStart(3, '0')}`, senderUid: 'coach-browser', senderRole: 'coach', createdAt: serverTimestamp(), plan: null });
  await batch.commit();
};
window.sendCommunicationLive = async () => setDoc(doc(collection(coachDb, 'coachConversations', 'client-a', 'messages')), { body: 'Nach der Historie live', senderUid: 'coach-browser', senderRole: 'coach', createdAt: serverTimestamp(), plan: null });
