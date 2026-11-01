// VitalOS Mini-App Service Worker — GENERIERT aus @vos/mini-app-shell/sw-template.js.
// Nicht von Hand editieren: Konfiguration steht in mini-app.json (Block "sw"), Neubau via stamp.
//
// Strategien:
//  - Navigation:        Cache zuerst (Offline-first, Standard "navStrategy":"cache"): die vorab gecachte App-Shell erscheint sofort,
//                       auch im Lie-Fi (WLAN ohne Internet). Aktualisiert wird die Shell atomar mit dem neuen SW (Install lädt Shell + Assets);
//                       die Seite bekommt 'sw-update-available' und lädt NICHT von selbst neu. Nur ohne Cache-Treffer geht es übers Netz (navTimeoutMs).
//                       "navStrategy":"network" = altes Verhalten (Netz zuerst, Timeout, Cache als Rückfall).
//  - Assets (gehasht):  Cache zuerst, bei Fehlen übers Netz nachladen (Laufzeit-Cache); schlägt das offline fehl,
//                       kommt index.html (SPA-Rückfall) — assetFallback:'none' liefert stattdessen einen Netzwerkfehler.
//  - API swr:           stale-while-revalidate, offline/Timeout (apiTimeoutMs) → {ok:false, offline:true}.
//  - API networkFirst:  Netz zuerst (Timeout apiTimeoutMs, Standard 5 s), Cache als Rückfall.
//  - Bilder-Hosts:      eigener, versionsunabhängiger Cache (überlebt App-Updates).
//  - neverCache:        Pfade, die der SW gar nicht anfasst (z. B. /api/sync/*).
//  - Background Sync:   optional, flusht eine IndexedDB-Queue (offline-queue.js-Kontrakt);
//                       sync.conflicts: HTTP 409 → Eintrag als conflict markieren + Seiten benachrichtigen.
// Alles andere (Firestore, Auth, Fonts, fremde Origins) läuft unberührt am SW vorbei.
const CFG = /*__VOS_CONFIG__*/ {}

const CACHE = CFG.cache // z. B. "vos-6pack-v<build>"
const PREFIX = CFG.prefix // nur Caches mit diesem Präfix räumt activate ab
const DATA_CACHE = CFG.dataCache || `${PREFIX}offline-data-v1`
const KEEP = [CACHE, DATA_CACHE, ...(CFG.keepCaches || []), ...(CFG.imageCaches || []).map((c) => c.cache)]
const SCOPE = new URL(self.registration.scope)
const BASE = SCOPE.pathname.replace(/\/$/, '')
const SHELL = (CFG.shell || ['./', './index.html']).map((p) => new URL(p, SCOPE).href)
const INDEX = new URL('./index.html', SCOPE).href

// Pfad relativ zum Scope ("/fuel/log" statt "/app/fuel/log") — Apps hängen unter Präfixen (HQ, Firebase-Sites)
const rel = (pathname) => (BASE && pathname.startsWith(BASE + '/') ? pathname.slice(BASE.length) : pathname === BASE ? '/' : pathname)
const hit = (list, path) => (list || []).some((p) => path === p || path.startsWith(p.endsWith('/') ? p : p + '/') || path.startsWith(p + '?'))

self.addEventListener('install', (e) => {
  // cache:'reload' → Shell + Assets kommen garantiert frisch vom Server (nicht aus dem HTTP-Cache), sonst passen index.html und Chunks nicht zusammen
  const fresh = (u) => (typeof Request === 'function' ? new Request(u, { cache: 'reload' }) : u)
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.map(fresh))).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then(async (keys) => {
        const data = await caches.open(DATA_CACHE)
        // Migrate public API responses from the previous combined build cache.
        // Never overwrite a response already refreshed by the new worker.
        for (const name of keys.filter((k) => k.startsWith(PREFIX) && !KEEP.includes(k))) {
          const old = await caches.open(name)
          for (const req of await old.keys()) {
            const url = new URL(req.url)
            const path = rel(url.pathname)
            if (url.origin !== SCOPE.origin || req.headers.has('authorization') || req.cache === 'no-store') continue
            if (hit(CFG.neverCache, path) || !(hit(CFG.api && CFG.api.swr, path) || hit(CFG.api && CFG.api.networkFirst, path))) continue
            const response = await old.match(req)
            if (response && response.ok && !(await data.match(req))) await data.put(req, response)
          }
          await caches.delete(name)
        }
      })
      .then(() => self.clients.claim())
  )
})

const put = (req, res, name = CACHE) => {
  if (res && res.ok) {
    const copy = res.clone()
    caches.open(name).then((c) => c.put(req, copy))
  }
  return res
}

function networkFirstNav(req, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false
    const fromCache = () => caches.match(req).then((h) => h || caches.match(INDEX))
    // timeoutMs null/0 = unbegrenzt aufs Netz warten (Cache nur bei echtem Fehler)
    const timer = timeoutMs
      ? setTimeout(() => {
          if (!settled) fromCache().then((r) => { if (r && !settled) { settled = true; resolve(r) } })
        }, timeoutMs)
      : null
    fetch(req)
      .then((res) => {
        clearTimeout(timer)
        if (settled) return
        settled = true
        put(req, res)
        // zuletzt gesehene App-Shell auch unter index.html ablegen → Offline-Rückfall ist immer der aktuellste Stand
        if (res && res.ok) caches.open(CACHE).then((c) => c.put(INDEX, res.clone()))
        resolve(res)
      })
      .catch(() => {
        clearTimeout(timer)
        if (!settled) fromCache().then((r) => { settled = true; resolve(r || Response.error()) })
      })
  })
}


// fetch mit hartem Timeout — im Lie-Fi (WLAN ohne Internet) hängen Requests, statt zu scheitern.
function fetchT(req, ms) {
  if (!ms) return fetch(req)
  return new Promise((resolve, reject) => {
    const ac = typeof AbortController === 'function' ? new AbortController() : null
    const timer = setTimeout(() => { if (ac) ac.abort(); reject(new Error('timeout')) }, ms)
    fetch(ac ? new Request(req, { signal: ac.signal }) : req).then(
      (r) => { clearTimeout(timer); resolve(r) },
      (err) => { clearTimeout(timer); reject(err) }
    )
  })
}
const ASSET_TIMEOUT = CFG.assetTimeoutMs === undefined ? 15000 : CFG.assetTimeoutMs
const API_TIMEOUT = CFG.apiTimeoutMs === undefined ? 5000 : CFG.apiTimeoutMs

// Offline-first-Navigation: vorab gecachte Shell sofort ausliefern. Die Shell wird nur durch einen neuen SW
// (Install: Shell + gehashte Assets zusammen) ersetzt — so passen index.html und Chunks immer zusammen.
async function cacheFirstNav(req) {
  const cached = (await caches.match(req)) || (await caches.match(req, { ignoreSearch: true }))
  if (cached) return cached
  const u = new URL(req.url)
  const p = rel(u.pathname)
  // Wurzel-/index-Aufrufe (auch mit Query/Hash-Parametern): immer die gecachte Shell, nie aufs Netz warten
  if (p === '/' || p === '/index.html') {
    const shell = await caches.match(INDEX)
    if (shell) return shell
  }
  return networkFirstNav(req, CFG.navTimeoutMs || 4000)
}

async function swr(req) {
  const cache = await caches.open(DATA_CACHE)
  const cached = await cache.match(req)
  const net = fetchT(req, API_TIMEOUT)
    .then((fresh) => { if (fresh && fresh.ok) cache.put(req, fresh.clone()); return fresh })
    .catch(() => null)
  if (cached) return cached
  return (await net) || new Response(JSON.stringify({ ok: false, offline: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'X-Source': 'sw-offline' },
  })
}

self.addEventListener('fetch', (e) => {
  const req = e.request
  // Authenticated and explicitly private fetches must never enter a shared cache.
  if (req.headers.has('authorization') || req.cache === 'no-store') return
  if (req.method !== 'GET') return
  const url = new URL(req.url)

  // Gespiegelte Bilder fremder Hosts: Cache zuerst, bei Fehlen normal übers Netz.
  for (const ic of CFG.imageCaches || []) {
    if (req.destination === 'image' && ic.hosts.includes(url.host)) {
      e.respondWith((async () => {
        const c = await caches.open(ic.cache)
        return (await c.match(req, { ignoreVary: true })) || fetch(req)
      })())
      return
    }
  }

  if (url.origin !== self.location.origin) return
  const path = rel(url.pathname)

  if (req.mode === 'navigate') {
    e.respondWith(CFG.navStrategy === 'network' ? networkFirstNav(req, CFG.navTimeoutMs === undefined ? 4000 : CFG.navTimeoutMs) : cacheFirstNav(req))
    return
  }
  if (hit(CFG.neverCache, path)) return
  if (hit(CFG.api && CFG.api.swr, path)) { e.respondWith(swr(req)); return }
  if (hit(CFG.api && CFG.api.networkFirst, path)) {
    e.respondWith(fetchT(req, API_TIMEOUT).then((res) => put(req, res, DATA_CACHE)).catch(() => caches.open(DATA_CACHE).then((c) => c.match(req))))
    return
  }
  // Pfade, die nie gecacht werden (z. B. Sync-/Health-Endpunkte der API): direkt ans Netz, SW antwortet nicht
  if (hit(CFG.neverCache, path)) return
  if (path.includes(CFG.assetsPath || '/assets/') || CFG.cacheAllSameOrigin) {
    e.respondWith(caches.match(req).then((h) => h || fetchT(req, ASSET_TIMEOUT).then((res) => put(req, res)).catch(() => (CFG.assetFallback === 'none' ? Response.error() : caches.match(INDEX)))))
  }
})

// Update-Trigger und Versionsabfrage aus dem UI ("App aktualisieren")
self.addEventListener('message', (e) => {
  if (!e.data) return
  if (e.data.type === 'SKIP_WAITING') self.skipWaiting()
  if (e.data.type === 'GET_VERSION' && e.source) e.source.postMessage({ type: 'VERSION', version: CACHE })
})

// Notification-Klick: vorhandenes Fenster fokussieren (und navigieren), sonst neu öffnen.
// Apps mit eigenem Klick-Handler (z. B. Fuel: Quick-Actions) setzen notificationClick:false und liefern ihn per extraFile.
if (CFG.notificationClick !== false) self.addEventListener('notificationclick', (e) => {
  const target = (e.notification && e.notification.data && e.notification.data.link) || CFG.notificationLink || './'
  e.notification.close()
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const w of wins) {
      if (!('focus' in w)) continue
      try { await w.navigate(target) } catch {}
      return w.focus()
    }
    return self.clients.openWindow ? self.clients.openWindow(target) : null
  })())
})

// Background Sync — flusht die IndexedDB-Queue, sobald wieder Netz da ist (optional: CFG.sync)
if (CFG.sync) {
  self.addEventListener('sync', (e) => { if (e.tag === CFG.sync.tag) e.waitUntil(flushQueue()) })
}
const idb = (db, store, mode, fn) => new Promise((resolve) => {
  try { const r = fn(db.transaction(store, mode).objectStore(store)); r.onsuccess = () => resolve(r.result || []); r.onerror = () => resolve([]) } catch { resolve([]) }
})
async function flushQueue() {
  const db = await new Promise((resolve) => {
    const r = indexedDB.open(CFG.sync.db, 1)
    r.onupgradeneeded = (ev) => {
      const d = ev.target.result
      if (!d.objectStoreNames.contains('queue')) d.createObjectStore('queue', { keyPath: 'id', autoIncrement: true })
      if (!d.objectStoreNames.contains('cache')) d.createObjectStore('cache', { keyPath: 'url' })
    }
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => resolve(null)
  })
  if (!db) return
  for (const item of await idb(db, 'queue', 'readonly', (s) => s.getAll())) {
    if (CFG.sync.conflicts && item.conflict) continue // wartet auf manuelle Auflösung (offline-queue.js)
    try {
      const res = await fetchT(item.url, { method: item.method, headers: { ...(item.headers || { 'Content-Type': 'application/json' }), ...(item.key ? { 'X-Idempotency-Key': item.key } : {}) }, body: item.body }, 10000)
      if (CFG.sync.conflicts && res.status === 409) {
        // Konflikt: Offline-Stand nicht verwerfen, als conflict markieren und alle Seiten informieren
        const body = await res.clone().json().catch(() => ({}))
        await idb(db, 'queue', 'readwrite', (s) => s.put({ ...item, conflict: true, conflict_at: Date.now(), current_rev: (body && body.current_rev) ?? null }))
        const pages = await self.clients.matchAll({ includeUncontrolled: true })
        pages.forEach((c) => c.postMessage({ type: CFG.sync.conflictMessage || 'queue-conflict', id: item.id, url: item.url, current_rev: (body && body.current_rev) ?? null }))
        continue
      }
      if (!res.ok && res.status >= 500) break
      await idb(db, 'queue', 'readwrite', (s) => s.delete(item.id))
    } catch { break } // noch offline → nächster Sync-Event
  }
}

/*__VOS_EXTRA__*/
