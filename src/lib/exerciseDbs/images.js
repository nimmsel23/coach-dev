import { idbDelete, idbGet, idbPut } from './idb.js'

// Offline-Spiegel der Übungsbilder: Cache API, ein gemeinsamer Cache für alle
// Quellen. Ausgeliefert wird er vom Service Worker (public/sw.js, IMG_CACHE) —
// die <img>-Tags im Atlas bleiben unverändert. Die URLs kommen aus den
// normalisierten Mirror-Einträgen (`images[]`), die Quelle bleibt austauschbar.

export const IMAGE_CACHE = 'fitness-exercise-images'
const CONCURRENCY = 6
const RETRIES = 2

export const imagesSupported = () => typeof caches !== 'undefined'

const metaKey = (sourceId) => `images:${sourceId}`

export async function getImageStatus(sourceId, urls) {
  if (!imagesSupported()) return { cached: 0, total: urls.length, bytes: 0 }
  const cache = await caches.open(IMAGE_CACHE)
  const have = new Set((await cache.keys()).map((r) => r.url))
  const cached = urls.reduce((n, u) => n + (have.has(u) ? 1 : 0), 0)
  const meta = (await idbGet('meta', metaKey(sourceId)).catch(() => null)) || {}
  return { cached, total: urls.length, bytes: cached ? meta.bytes || 0 : 0 }
}

async function fetchWithRetry(url, signal) {
  let lastErr
  for (let attempt = 0; attempt <= RETRIES; attempt += 1) {
    try {
      const res = await fetch(url, { signal })
      if (res.ok) return res
      lastErr = new Error(`HTTP ${res.status}`)
    } catch (err) {
      if (signal?.aborted) throw err
      lastErr = err
    }
    await new Promise((r) => setTimeout(r, 400 * (attempt + 1)))
  }
  throw lastErr
}

// Lädt fehlende Bilder nach (bereits gecachte werden übersprungen → fortsetzbar).
// → { done, failed, aborted, error }
export async function downloadImages(sourceId, urls, { onProgress, signal } = {}) {
  if (!imagesSupported()) throw new Error('Cache-Speicher nicht verfügbar')
  try { await navigator.storage?.persist?.() } catch { /* best effort */ }

  const cache = await caches.open(IMAGE_CACHE)
  const have = new Set((await cache.keys()).map((r) => r.url))
  const todo = urls.filter((u) => !have.has(u))
  const prev = (await idbGet('meta', metaKey(sourceId)).catch(() => null)) || {}
  const state = { done: urls.length - todo.length, failed: 0, bytes: prev.bytes || 0, error: null }
  let next = 0
  let lastEmit = 0

  const emit = (force = false) => {
    const now = Date.now()
    if (!force && now - lastEmit < 120) return
    lastEmit = now
    onProgress?.({ done: state.done, failed: state.failed, total: urls.length, bytes: state.bytes })
  }

  async function worker() {
    while (next < todo.length && !state.error) {
      if (signal?.aborted) return
      const url = todo[next]
      next += 1
      try {
        const res = await fetchWithRetry(url, signal)
        state.bytes += Number(res.headers.get('content-length')) || 0
        await cache.put(url, res)
        state.done += 1
      } catch (err) {
        if (signal?.aborted) return
        if (err?.name === 'QuotaExceededError') state.error = 'Speicher voll — Rest nicht geladen'
        else state.failed += 1
      }
      emit()
    }
  }

  emit(true)
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  await idbPut('meta', metaKey(sourceId), { bytes: state.bytes, updatedAt: new Date().toISOString() }).catch(() => {})
  emit(true)
  return { done: state.done, failed: state.failed, aborted: !!signal?.aborted, error: state.error }
}

export async function clearImages(sourceId, urls) {
  if (!imagesSupported()) return
  const cache = await caches.open(IMAGE_CACHE)
  await Promise.all(urls.map((u) => cache.delete(u)))
  await idbDelete('meta', metaKey(sourceId)).catch(() => {})
}
