// Minimal host context: no authentication or cloud query is needed for this editor fixture.
export const getUid = () => 'coach';
export const isLocalMode = () => true;
export const searchExercises = async () => ({ results: [] });
export async function updateMacrocycle() { throw new Error('Fixture must save through its program adapter.'); }
