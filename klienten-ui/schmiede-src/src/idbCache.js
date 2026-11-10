// IndexedDB-Cache für ClientForge-GET-Antworten (Klientenlisten, Pläne, Logs).
// localStorage wäre zu klein/fragil — IDB hält die JSON-Payloads bequem.

const DB_NAME = 'clientforge-cache'
const DB_VERSION = 1
const STORE = 'responses'

let dbPromise = null

function openDb() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB nicht verfügbar'))
      return
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'key' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  dbPromise.catch(() => { dbPromise = null })
  return dbPromise
}

function run(mode, fn) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode)
    const store = tx.objectStore(STORE)
    const req = fn(store)
    tx.oncomplete = () => resolve(req?.result)
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  }))
}

/** Cache-Key: Methode + absolute/relative URL-Pfad inkl. Query. */
export function cacheKey(path, method = 'GET') {
  return `${(method || 'GET').toUpperCase()} ${path}`
}

export async function cacheGet(path, method = 'GET') {
  try {
    const row = await run('readonly', (s) => s.get(cacheKey(path, method)))
    return row ? row.data : undefined
  } catch {
    return undefined
  }
}

export async function cacheSet(path, data, method = 'GET') {
  try {
    await run('readwrite', (s) => s.put({
      key: cacheKey(path, method),
      path,
      method: (method || 'GET').toUpperCase(),
      data,
      savedAt: Date.now(),
    }))
  } catch {
    // Cache ist Komfort — Speicher voll/Privatmodus nicht laut machen.
  }
}

/** Löscht alle gecachten GETs, deren Pfad den Prefix enthält (nach Writes). */
export async function cacheInvalidatePrefix(prefix) {
  try {
    const all = await run('readonly', (s) => s.getAll())
    const keys = (all || [])
      .filter((row) => typeof row?.path === 'string' && row.path.includes(prefix))
      .map((row) => row.key)
    if (!keys.length) return
    await run('readwrite', (s) => {
      keys.forEach((key) => s.delete(key))
    })
  } catch {
    // ignore
  }
}

export async function cacheClear() {
  try {
    await run('readwrite', (s) => s.clear())
  } catch {
    // ignore
  }
}
