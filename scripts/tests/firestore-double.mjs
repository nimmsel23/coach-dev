// In-memory test double. No SDK, credentials or live Firestore access.
export const records = new Map();
export let failNextCommit = false;
export function failCommit() { failNextCommit = true; }
export let failNextSet = false;
export function failSet() { failNextSet = true; }
let serial = 0;
export const doc = (...parts) => {
  if (parts[0]?.path) return { path: `${parts[0].path}/${parts[1] || `auto${++serial}`}`, id: parts[1] || `auto${serial}` };
  const path = parts.slice(1).join('/'); return { path, id: parts.at(-1) };
};
export const collection = (_db, ...parts) => ({ path: parts.join('/') });
export const query = (ref) => ref;
export const orderBy = () => ({});
export const where = () => ({});
export async function getDoc(ref) { const value = records.get(ref.path); return { id: ref.id, exists: () => !!value, data: () => structuredClone(value) }; }
export async function getDocs(ref) {
  const prefix = `${ref.path}/`;
  const docs = [...records].filter(([path]) => path.startsWith(prefix) && !path.slice(prefix.length).includes('/')).map(([path, value]) => ({ id: path.split('/').at(-1), ref: { path }, data: () => structuredClone(value) }));
  return { docs, size: docs.length };
}
export async function setDoc(ref, data, opts) { if (failNextSet) { failNextSet = false; throw new Error('denied'); } records.set(ref.path, structuredClone(opts?.merge ? { ...records.get(ref.path), ...data } : data)); }
export async function updateDoc(ref, data) { if (!records.has(ref.path)) throw new Error('not-found'); await setDoc(ref, data, { merge: true }); }
export async function deleteDoc(ref) { records.delete(ref.path); }
export function writeBatch() {
  const actions = [];
  return {
    set: (ref, data) => actions.push(() => setDoc(ref, data)),
    update: (ref, data) => actions.push(() => updateDoc(ref, data)),
    delete: (ref) => actions.push(() => deleteDoc(ref)),
    commit: async () => { if (failNextCommit) { failNextCommit = false; throw new Error('denied'); } for (const action of actions) await action(); },
  };
}
// Transaktion mit optimistischer Nebenläufigkeit: Lesestand wird beim Commit geprüft, sonst Wiederholung.
export async function runTransaction(_db, fn) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const reads = new Map();
    const writes = [];
    const tx = {
      get: async (ref) => { await Promise.resolve(); reads.set(ref.path, JSON.stringify(records.get(ref.path) ?? null)); return getDoc(ref); },
      set: (ref, data, opts) => { writes.push(() => records.set(ref.path, structuredClone(opts?.merge ? { ...records.get(ref.path), ...data } : data))); return tx; },
      update: (ref, data) => { writes.push(() => { if (!records.has(ref.path)) throw new Error('not-found'); records.set(ref.path, structuredClone({ ...records.get(ref.path), ...data })); }); return tx; },
      delete: (ref) => { writes.push(() => records.delete(ref.path)); return tx; },
    };
    const result = await fn(tx);
    if ([...reads].some(([path, snap]) => JSON.stringify(records.get(path) ?? null) !== snap)) continue;
    for (const write of writes) write();
    return result;
  }
  throw new Error('transaction-aborted');
}
