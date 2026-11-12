/**
 * IndexedDB-Snapshots für vos-coach Klienten-Reads (Profile, Feeds, Progress).
 * Stale-while-revalidate: Cache sofort, Netzwerk schreibt nach und feuert Event.
 */

const DB_NAME = 'vos-coach-client-data'
const DB_VERSION = 1
const STORE = 'snapshots'

let dbPromise = null
// Laufende Reads dürfen nach einem Write gelöschte Snapshots nicht wiederherstellen.
const revisions = new Map()
const revision = (key) => {
  if (!revisions.has(key)) revisions.set(key, 0)
  return revisions.get(key)
}

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

/** Firestore-Timestamps → ISO, sonst plain JSON (IDB mag keine Class-Instanzen). */
function clone(value) {
  return JSON.parse(JSON.stringify(value, (_key, v) => {
    if (v && typeof v.toDate === 'function') {
      try { return v.toDate().toISOString() } catch { return null }
    }
    return v
  }))
}

export async function snapGet(key) {
  try {
    const row = await run('readonly', (s) => s.get(key))
    return row ? row.data : undefined
  } catch {
    return undefined
  }
}

export async function snapSet(key, data) {
  try {
    await run('readwrite', (s) => s.put({ key, data: clone(data), savedAt: Date.now() }))
  } catch {
    // Cache nur Komfort
  }
}

export async function snapDelete(key) {
  revisions.set(key, revision(key) + 1)
  try {
    await run('readwrite', (s) => s.delete(key))
  } catch {
    // ignore
  }
}

export async function snapDeletePrefix(prefix) {
  for (const key of revisions.keys()) {
    if (key.startsWith(prefix)) revisions.set(key, revision(key) + 1)
  }
  try {
    const all = await run('readonly', (s) => s.getAll())
    const keys = (all || []).map((row) => row.key).filter((k) => typeof k === 'string' && k.startsWith(prefix))
    if (!keys.length) return
    await run('readwrite', (s) => { keys.forEach((k) => s.delete(k)) })
  } catch {
    // ignore
  }
}

export const CACHE_KEYS = {
  profiles: 'profiles:all',
  feedGlobal: (limit) => `feed:global:${limit}`,
  feedClient: (uid, limit) => `feed:client:${uid}:${limit}`,
  routinesProgress: (uid) => `routines:${uid}`,
  habitCycle: (uid) => `habitCycle:${uid}`,
  macrocycles: (uid) => `macrocycles:${uid}`,
}

/**
 * Cache-first. Bei Treffer: sofortiger Return + Background-Refresh.
 * Frische Daten → IDB + CustomEvent `vos-coach-cache` { key, data }.
 */
export async function cachedQuery(key, loader) {
  const startedAt = revision(key)
  const hit = await snapGet(key)
  const pending = Promise.resolve()
    .then(loader)
    .then(async (data) => {
      if (revision(key) !== startedAt) return cachedQuery(key, loader)
      const plain = clone(data)
      await snapSet(key, plain)
      if (revision(key) !== startedAt) return cachedQuery(key, loader)
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('vos-coach-cache', { detail: { key, data: plain } }))
      }
      return plain
    })
    .catch((error) => {
      if (revision(key) === startedAt && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('vos-coach-cache-error', {
          detail: { key, message: error?.message || 'Aktualisierung fehlgeschlagen.' },
        }))
      }
      throw error
    })

  if (hit !== undefined && revision(key) === startedAt) {
    pending.catch(() => {})
    return clone(hit)
  }
  return pending
}
