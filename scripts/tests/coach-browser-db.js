export * from '../../src/lib/db/index.firestore.app.js';
export { isLocalMode, api, getAllUserProfiles, searchExercises, listMacrocycles, getMacrocycle, createMacrocycle, deleteMacrocycle, addRoutine, updateRoutine, deleteRoutine, publishMacrocycle } from '@plan/lib/db/index.js';
export const getUid = () => 'coach';
export function watchAuth(callback) {
  document.cookie = 'test-persona=coach; path=/; SameSite=Lax';
  callback({ uid: 'coach', displayName: 'Test Coach', email: 'coach@isolated.test' });
  return () => {};
}
export async function getUserProfile() { return {}; }
