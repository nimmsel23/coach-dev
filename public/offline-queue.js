"use strict";

// fitness-dev Offline-Queue
//
// Drop-in fetch-Wrapper für die fitness-dev App.
// Registriert sich als window.aosOfflineQueue.
//
// Verhalten:
//   GET  → Netz OK: pass-through + JSON in IDB cachen
//          Netz fail: IDB-Cache zurückgeben (stale) oder leeren Stub
//   POST → Netz OK: pass-through + Opportunistic Queue-Flush
//          Netz fail: in IDB einreihen + Background-Sync registrieren
//          Gibt synthetische 202 zurück (ok: true, queued: true, offline: true)
//
// Public API (window.aosOfflineQueue):
//   .fetch(url, init)  — drop-in fetch
//   .flush()           — jetzt alle queued POSTs senden
//   .size()            — Promise<number> queue-Länge
//   .isOnline()        — letzter bekannter Netzwerkstatus
//
// IndexedDB: aos-offline-fitness
//   store "queue":  { id (auto), method, url, body, headers, ts }
//   store "cache":  { url (key), data, ts }

(() => {
  const DB_NAME = 'aos-offline-fitness'
  const SYNC_TAG = 'fitness-flush-queue'
  let dbPromise = null
  let online = navigator.onLine ?? true

  // ── fetch mit Timeout ─────────────────────────────────────────────────────
  // Lie-Fi (WLAN verbunden, kein Internet): Requests hängen statt zu scheitern. Ohne Timeout greift weder der
  // IDB-Cache (GET) noch die Queue (POST). Nach Ablauf zählt der Request als "offline".
  const GET_TIMEOUT_MS = 5000
  const WRITE_TIMEOUT_MS = 8000

  function fetchT(input, init, ms) {
    if (init && init.signal) return fetch(input, init) // Aufrufer steuert selbst ab
    const ac = typeof AbortController === 'function' ? new AbortController() : null
    const timer = setTimeout(() => ac && ac.abort(), ms)
    return fetch(input, ac ? { ...(init || {}), signal: ac.signal } : init).finally(() => clearTimeout(timer))
  }

  // ── IDB ──────────────────────────────────────────────────────────────────

  function openDB() {
    if (dbPromise) return dbPromise
    dbPromise = new Promise((resolve, reject) => {
      const r = indexedDB.open(DB_NAME, 1)
      r.onupgradeneeded = e => {
        const db = e.target.result
        if (!db.objectStoreNames.contains('queue'))
          db.createObjectStore('queue', { keyPath: 'id', autoIncrement: true })
        if (!db.objectStoreNames.contains('cache'))
          db.createObjectStore('cache', { keyPath: 'url' })
      }
      r.onsuccess = () => resolve(r.result)
      r.onerror = () => reject(r.error)
    })
    return dbPromise
  }

  function store(name, mode) {
    return openDB().then(db => db.transaction(name, mode).objectStore(name))
  }

  function req(r) {
    return new Promise((resolve, reject) => {
      r.onsuccess = () => resolve(r.result)
      r.onerror = () => reject(r.error)
    })
  }

  // ── Queue ─────────────────────────────────────────────────────────────────

  async function enqueue(entry) {
    const queued = { ...entry, ts: Date.now(), key: entry.key || (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2)) }
    const id = await req((await store('queue', 'readwrite')).add(queued))
    window.dispatchEvent(new CustomEvent('fitness:queue-enqueued', {
      detail: { id, method: queued.method, url: queued.url, ts: queued.ts },
    }))
    return id
  }

  async function queueAll() {
    return req((await store('queue', 'readonly')).getAll())
  }

  async function queueDelete(id) {
    return req((await store('queue', 'readwrite')).delete(id))
  }

  async function size() {
    return req((await store('queue', 'readonly')).count())
  }

  // ── Cache (GET reads) ─────────────────────────────────────────────────────

  async function cacheGet(url) {
    const row = await req((await store('cache', 'readonly')).get(url)).catch(() => null)
    return row?.data ?? null
  }

  async function cachePut(url, data) {
    return req((await store('cache', 'readwrite')).put({ url, data, ts: Date.now() })).catch(() => {})
  }

  // ── Flush ─────────────────────────────────────────────────────────────────

  let flushing = null
  function flush() {
    // Nie zwei Flushes gleichzeitig (online-Event + Timer + Visibility würden sonst doppelt senden)
    if (!flushing) flushing = flushOnce().finally(() => { flushing = null })
    return flushing
  }

  async function flushOnce() {
    const items = await queueAll().catch(() => [])
    if (!items.length) return { ok: true, flushed: 0, failed: 0 }
    let flushed = 0, failed = 0
    const flushedItems = []
    for (const item of items) {
      try {
        const res = await fetchT(item.url, {
          method: item.method,
          headers: { ...(item.headers || { 'Content-Type': 'application/json' }), ...(item.key ? { 'X-Idempotency-Key': item.key } : {}) },
          body: item.body,
        }, WRITE_TIMEOUT_MS)
        if (!res.ok && res.status >= 500) throw new Error(`http_${res.status}`)
        await queueDelete(item.id)
        flushed++
        flushedItems.push({ id: item.id, method: item.method, url: item.url })
      } catch {
        failed++
        break
      }
    }
    if (flushed > 0) {
      window.dispatchEvent(new CustomEvent('fitness:queue-flushed', {
        detail: { flushed, failed, items: flushedItems },
      }))
    }
    return { ok: failed === 0, flushed, failed }
  }

  async function tryRegisterSync() {
    if (!('serviceWorker' in navigator) || !('SyncManager' in window)) return
    try {
      const reg = await navigator.serviceWorker.ready
      await reg.sync.register(SYNC_TAG)
    } catch { /* Background Sync nicht verfügbar */ }
  }

  // ── fetch-Wrapper ─────────────────────────────────────────────────────────

  function bodyToString(body) {
    if (body == null) return ''
    if (typeof body === 'string') return body
    try { return JSON.stringify(body) } catch { return String(body) }
  }

  function headersToObject(h) {
    if (!h) return { 'Content-Type': 'application/json' }
    if (h instanceof Headers) {
      const o = {}; h.forEach((v, k) => { o[k] = v }); return o
    }
    return { ...h }
  }

  async function apiFetch(input, init = {}) {
    const url = typeof input === 'string' ? input : (input?.url || '')
    const method = String(
      init?.method || (typeof input === 'object' ? input?.method : null) || 'GET'
    ).toUpperCase()

    try {
      const res = await fetchT(input, init, method === 'GET' ? GET_TIMEOUT_MS : WRITE_TIMEOUT_MS)
      online = true

      // GET: JSON in IDB cachen
      if (res.ok && method === 'GET') {
        const ct = res.headers.get('content-type') || ''
        if (ct.includes('application/json')) {
          res.clone().json().then(data => cachePut(url, data)).catch(() => {})
        }
      }

      // POST: Opportunistic flush falls noch was in der Queue ist
      if (method === 'POST') {
        size().then(n => { if (n > 0) flush().catch(() => {}) }).catch(() => {})
      }

      return res
    } catch {
      online = false

      if (method === 'GET') {
        const cached = await cacheGet(url).catch(() => null)
        if (cached != null) {
          return new Response(JSON.stringify(cached), {
            status: 200,
            headers: { 'Content-Type': 'application/json', 'X-Source': 'offline-cache' },
          })
        }
        return new Response(JSON.stringify({ ok: false, offline: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'X-Source': 'offline-stub' },
        })
      }

      // POST → einreihen
      await enqueue({
        method,
        url,
        body: bodyToString(init.body),
        headers: headersToObject(init.headers),
      })
      tryRegisterSync().catch(() => {})

      return new Response(
        JSON.stringify({ ok: true, queued: true, offline: true }),
        { status: 202, headers: { 'Content-Type': 'application/json', 'X-Source': 'offline-queue' } }
      )
    }
  }

  // ── Auto-flush on reconnect ───────────────────────────────────────────────

  window.addEventListener('online', () => {
    online = true
    flush().catch(() => {})
  })
  window.addEventListener('offline', () => { online = false })
  // navigator.onLine lügt im Lie-Fi → zusätzlich beim Sichtbarwerden und periodisch nachsenden (nur wenn etwas ansteht)
  const flushIfPending = () => size().then(n => { if (n > 0) flush().catch(() => {}) }).catch(() => {})
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') flushIfPending() })
  setInterval(flushIfPending, 60000)
  setTimeout(flushIfPending, 3000) // einmal kurz nach dem Start, nicht davor

  // DB vorab öffnen
  openDB().catch(() => {})

  // ── Public API ────────────────────────────────────────────────────────────

  window.aosOfflineQueue = {
    fetch: apiFetch,
    flush,
    size,
    isOnline: () => online,
  }
})()
