import { idbGet, idbPut, idbDelete } from './idb.js'
import { getSource } from './sources.js'

// Geräte-Mirror der Übungs-DBs: Rohdaten aus dem Upstream-Git landen
// unverändert in IndexedDB (`data`), Status/Version in `meta`. Eine Quelle
// gilt als "vom Nutzer verwendet", sobald sie auf diesem Gerät geladen ist.

const listeners = new Set()
const normalizedCache = new Map() // sourceId -> { fetchedAt, items }

export function subscribeMirror(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function emit() {
  listeners.forEach((fn) => { try { fn() } catch { /* Listener-Fehler dürfen den Mirror nicht stören */ } })
}

export async function getMirrorStatus(sourceId) {
  try {
    return (await idbGet('meta', sourceId)) || null
  } catch {
    return null
  }
}

export async function loadMirrorItems(sourceId) {
  const source = getSource(sourceId)
  const status = await getMirrorStatus(sourceId)
  if (!source || !status) return null
  const cached = normalizedCache.get(sourceId)
  if (cached && cached.fetchedAt === status.fetchedAt) return cached.items
  const raw = await idbGet('data', sourceId)
  if (!Array.isArray(raw)) return null
  const items = raw.map((entry) => source.normalize(entry))
  normalizedCache.set(sourceId, { fetchedAt: status.fetchedAt, items })
  return items
}

export async function downloadMirror(sourceId) {
  const source = getSource(sourceId)
  if (!source) throw new Error(`Unbekannte Quelle: ${sourceId}`)
  const { items, bytes, url, version, versionDate } = await source.download()
  const meta = {
    sourceId,
    count: items.length,
    bytes,
    url,
    version,
    versionDate,
    fetchedAt: new Date().toISOString(),
  }
  // Erst Daten, dann Meta: ein abgebrochener Schreibvorgang hinterlässt so nie
  // einen Status ohne Daten.
  await idbPut('data', sourceId, items)
  await idbPut('meta', sourceId, meta)
  normalizedCache.delete(sourceId)
  emit()
  return meta
}

export async function removeMirror(sourceId) {
  await idbDelete('meta', sourceId)
  await idbDelete('data', sourceId)
  normalizedCache.delete(sourceId)
  emit()
}

// → { available: boolean|null, latest } — null = Prüfung nicht möglich (offline,
// API-Limit); ohne gespeicherte Version gilt der Mirror als nicht prüfbar.
export async function checkMirrorUpdate(sourceId) {
  const source = getSource(sourceId)
  const status = await getMirrorStatus(sourceId)
  if (!source || !status) return { available: null, latest: null }
  const latest = await source.latest()
  if (!latest || !status.version) return { available: null, latest }
  return { available: latest.version !== status.version, latest }
}
