import { coachDb, plan } from './communication-fixture-db.js';
export const db = coachDb;
export const getUid = () => 'coach-browser';
export const getMacrocycle = async () => ({ macrocycle: { headVersion: 2, published: { name: plan.name } } });
export * from '../../src/lib/db/firestore/communication.js';
