// VitalOS Mini-App Service Worker — GENERIERT aus @vos/mini-app-shell/sw-template.js.
// Nicht von Hand editieren: Konfiguration steht in mini-app.json (Block "sw"), Neubau via stamp.
//
// Strategien:
//  - Navigation:        Netz zuerst (kurzes Timeout) → immer die neueste index.html, Cache nur als Rückfall.
//  - Assets (gehasht):  Cache zuerst, bei Fehlen übers Netz nachladen (Laufzeit-Cache).
//  - API swr:           stale-while-revalidate, offline → {ok:false, offline:true}.
//  - API networkFirst:  Netz zuerst, Cache als Rückfall.
//  - Bilder-Hosts:      eigener, versionsunabhängiger Cache (überlebt App-Updates).
//  - Background Sync:   optional, flusht eine IndexedDB-Queue (offline-queue.js-Kontrakt).
// Alles andere (Firestore, Auth, Fonts, fremde Origins) läuft unberührt am SW vorbei.
const CFG = /*__VOS_CONFIG__*/ {}

const CACHE = CFG.cache // z. B. "vos-6pack-v<build>"
const PREFIX = CFG.prefix // nur Caches mit diesem Präfix räumt activate ab
const KEEP = [CACHE, ...(CFG.keepCaches || []), ...(CFG.imageCaches || []).map((c) => c.cache)]
const SCOPE = new URL(self.registration.scope)
const BASE = SCOPE.pathname.replace(/\/$/, '')
const SHELL = (CFG.shell || ['./', './index.html']).map((p) => new URL(p, SCOPE).href)
const INDEX = new URL('./index.html', SCOPE).href

// Pfad relativ zum Scope ("/fuel/log" statt "/app/fuel/log") — Apps hängen unter Präfixen (HQ, Firebase-Sites)
const rel = (pathname) => (BASE && pathname.startsWith(BASE + '/') ? pathname.slice(BASE.length) : pathname === BASE ? '/' : pathname)
const hit = (list, path) => (list || []).some((p) => path === p || path.startsWith(p.endsWith('/') ? p : p + '/') || path.startsWith(p + '?'))

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL).catch(() => {})))
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith(PREFIX) && !KEEP.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

const put = (req, res) => {
  if (res && res.ok) {
    const copy = res.clone()
    caches.open(CACHE).then((c) => c.put(req, copy))
  }
  return res
}

function networkFirstNav(req, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false
    const fromCache = () => caches.match(req).then((h) => h || caches.match(INDEX))
    const timer = setTimeout(() => {
      if (!settled) fromCache().then((r) => { if (r && !settled) { settled = true; resolve(r) } })
    }, timeoutMs)
    fetch(req)
      .then((res) => {
        clearTimeout(timer)
        if (settled) return
        settled = true
        put(req, res)
        resolve(res)
      })
      .catch(() => {
        clearTimeout(timer)
        if (!settled) fromCache().then((r) => { settled = true; resolve(r || Response.error()) })
      })
  })
}

async function swr(req) {
  const cache = await caches.open(CACHE)
  const cached = await cache.match(req)
  const net = fetch(req)
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

  if (req.mode === 'navigate') { e.respondWith(networkFirstNav(req, CFG.navTimeoutMs || 4000)); return }
  if (hit(CFG.api && CFG.api.swr, path)) { e.respondWith(swr(req)); return }
  if (hit(CFG.api && CFG.api.networkFirst, path)) {
    e.respondWith(fetch(req).then((res) => put(req, res)).catch(() => caches.match(req)))
    return
  }
  if (path.includes(CFG.assetsPath || '/assets/') || CFG.cacheAllSameOrigin) {
    e.respondWith(caches.match(req).then((h) => h || fetch(req).then((res) => put(req, res)).catch(() => caches.match(INDEX))))
  }
})

// Update-Trigger und Versionsabfrage aus dem UI ("App aktualisieren")
self.addEventListener('message', (e) => {
  if (!e.data) return
  if (e.data.type === 'SKIP_WAITING') self.skipWaiting()
  if (e.data.type === 'GET_VERSION' && e.source) e.source.postMessage({ type: 'VERSION', version: CACHE })
})

// Notification-Klick: vorhandenes Fenster fokussieren (und navigieren), sonst neu öffnen
self.addEventListener('notificationclick', (e) => {
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
    try {
      const res = await fetch(item.url, { method: item.method, headers: item.headers || { 'Content-Type': 'application/json' }, body: item.body })
      if (!res.ok && res.status >= 500) break
      await idb(db, 'queue', 'readwrite', (s) => s.delete(item.id))
    } catch { break } // noch offline → nächster Sync-Event
  }
}

/*__VOS_EXTRA__*/
