import { plan } from './communication-fixture-db.js';
export const listClientTrainingPlans = async (uid) => uid === 'client-a' ? [plan] : [];
