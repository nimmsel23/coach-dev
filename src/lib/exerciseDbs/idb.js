// Minimaler Promise-Wrapper um IndexedDB für den Übungs-DB-Mirror.
// Zwei Stores: `meta` (Status je Quelle) und `data` (Rohdaten je Quelle,
// unverändert wie upstream geliefert — Normalisierung passiert erst beim Lesen).

const DB_NAME = 'fitness-exercise-mirror'
const DB_VERSION = 1
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
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta')
      if (!db.objectStoreNames.contains('data')) db.createObjectStore('data')
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  dbPromise.catch(() => { dbPromise = null })
  return dbPromise
}

function run(store, mode, fn) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode)
    const req = fn(tx.objectStore(store))
    tx.oncomplete = () => resolve(req?.result)
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  }))
}

export const idbGet = (store, key) => run(store, 'readonly', (s) => s.get(key))
export const idbPut = (store, key, value) => run(store, 'readwrite', (s) => s.put(value, key))
export const idbDelete = (store, key) => run(store, 'readwrite', (s) => s.delete(key))
