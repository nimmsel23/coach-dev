const BASE = import.meta.env.VITE_API_BASE || ''

function apiFetch(url, opts) {
  const fn = window.aosOfflineQueue?.fetch ?? fetch
  return fn(url, opts)
}

export const api = {
  async get(path) {
    const res = await apiFetch(BASE + path, { cache: 'no-store' })
    const fromOffline = res.headers?.get?.('X-Source')?.startsWith('offline')
    if (!res.ok && !fromOffline) throw new Error(`GET ${path} → ${res.status}`)
    try {
      return await res.json()
    } catch (e) {
      if (fromOffline) return null
      throw new Error(`GET ${path} → invalid JSON`, { cause: e })
    }
  },
  async post(path, data) {
    const res = await apiFetch(BASE + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!res.ok && res.status !== 202) throw new Error(`POST ${path} → ${res.status}`)
    return res.json()
  },
  async patch(path, data) {
    const res = await apiFetch(BASE + path, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!res.ok && res.status !== 202) throw new Error(`PATCH ${path} → ${res.status}`)
    return res.json()
  },
  async put(path, data) {
    const res = await apiFetch(BASE + path, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!res.ok && res.status !== 202) throw new Error(`PUT ${path} → ${res.status}`)
    return res.json()
  },
  async delete(path) {
    const res = await apiFetch(BASE + path, {
      method: 'DELETE',
    })
    if (!res.ok && res.status !== 202) throw new Error(`DELETE ${path} → ${res.status}`)
    return res.json()
  }
}

export { localToday } from '../shared/utils';

export function getUid() { return "local"; }
// Parity mit firestore/core.js: im Local-Modus gibt es kein Firebase-Token.
// Konsumenten (z.B. 6Pack-Selfies) fallen dann auf den lokalen x-fitness-uid-
// Dev-Pfad zurück (Backend: FITNESS_SIXPACK_DEV_UID_AUTH=1).
export async function getIdToken() { return null; }
export function isLocalMode() { return true; }

export function watchAuth(callback) {
  const user = { displayName: "Local Host", email: "localhost", photoURL: null };
  callback?.(user);
  return () => {};
}

// Auth stubs — public-API parity with src/db.firestore.js so views can
// import the same names in both modes. No-ops in local; you're already
// "signed in" as the Local Host stub returned by watchAuth above.
export async function signIn()                  { return { ok: true }; }
export async function signInEmail(email, pw)    { return { ok: true }; }
export async function signUpEmail(email, pw, n) { return { ok: true }; }
export async function signOut()                 { return { ok: true }; }

// Stubs mit Firebase-Parity — App.jsx + Plan/api.js erwarten auth + db Exports
export const auth = {
  currentUser: { displayName: "Local Host", email: "localhost", photoURL: null, uid: "local" },
  authStateReady: async () => {},
};
export const db = null;
