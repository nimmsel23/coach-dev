import { initializeApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
const projectId = 'demo-coach-communication';
const coachDb = getFirestore(initializeApp({ projectId, apiKey: 'demo-key' }, 'communication-coach'));
const clientDb = getFirestore(initializeApp({ projectId, apiKey: 'demo-key' }, 'communication-client'));
connectFirestoreEmulator(coachDb, '127.0.0.1', 18080, { mockUserToken: { sub: 'coach-browser', coach: true } });
connectFirestoreEmulator(clientDb, '127.0.0.1', 18080, { mockUserToken: { sub: 'client-a' } });
export { coachDb, clientDb };
export const plan = { id: 'plan-a', name: '3er-Split Frühjahr', headVersion: 2 };
