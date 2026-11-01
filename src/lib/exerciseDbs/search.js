import { EXERCISE_DB_SOURCES } from './sources.js'
import { getMirrorStatus, loadMirrorItems } from './mirror.js'
import { foldName } from '../db/shared/kbLookup.js'

// Suche/Lookup im Geräte-Mirror für Session & Plan. Ersetzt dort den Zugriff
// auf die alten Katalog-Bulk-Records (`unreviewed_yuhonas.yml`): deren
// `yuhonas_*`-Einträge werden aus den Katalog-Ergebnissen entfernt
// (isLegacyYuhonasId) und stattdessen live aus dem Mirror geliefert — gleiche
// Exercise-IDs, aber mit den vollständigen Rohdaten.

export const isLegacyYuhonasId = (id) => String(id || '').startsWith('yuhonas_')

function fold(s) {
  return String(s || '').toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim()
}

// Gleiches Punkteschema wie die bisherige Firestore-Suche, damit Mirror- und
// Katalog-Treffer in einer gemeinsamen Rangliste sortierbar sind.
export function scoreNames(query, names) {
  const qn = fold(query)
  if (!qn) return 0
  const tokens = qn.split(' ').filter(Boolean)
  const hay = names.filter(Boolean).map(fold)
  if (hay.some((h) => h === qn)) return 100
  if (hay.some((h) => h.startsWith(qn))) return 80
  if (hay.some((h) => h.includes(qn))) return 60
  if (tokens.length > 1 && tokens.every((t) => hay.some((h) => h.includes(t)))) return 50
  if (tokens.some((t) => hay.some((h) => h.includes(t)))) return 20
  return 0
}

function toRecord(ex) {
  return {
    id: ex.exerciseId,
    exercise_id: ex.exerciseId,
    name: ex.name,
    display_name: ex.name,
    primary_muscles: ex.primary,
    secondary_muscles: ex.secondary,
    equipment: ex.equipment ? [ex.equipment] : [],
    category: ex.category || '',
    coaching_notes: ex.steps,
    tags: [ex.source],
    yuhonas_id: ex.source === 'yuhonas' ? ex.id : undefined,
    images: ex.images,
    source: ex.source,
  }
}

async function loadAll(enabled) {
  const out = []
  const missing = []
  for (const source of EXERCISE_DB_SOURCES) {
    if (enabled[source.id] === false) continue
    const items = await loadMirrorItems(source.id)
    if (items) out.push(...items)
    else if (!(await getMirrorStatus(source.id))) missing.push(source.id)
  }
  return { items: out, missing }
}

// → { results: [{ record, score }], missing: [sourceId] }
// skipIds: Roh-IDs, die der Katalog schon abdeckt (kuratierter Eintrag gewinnt).
export async function searchMirrors(query, { enabled = {}, skipIds = new Set() } = {}) {
  const { items, missing } = await loadAll(enabled)
  const results = []
  for (const ex of items) {
    if (skipIds.has(String(ex.id))) continue
    const score = scoreNames(query, [ex.name, ex.exerciseId])
    if (score > 0) results.push({ record: toRecord(ex), score })
  }
  return { results, missing }
}

export async function getMirrorExercise(exerciseId) {
  if (!isLegacyYuhonasId(exerciseId)) return null
  const { items } = await loadAll({})
  const hit = items.find((ex) => ex.exerciseId === exerciseId)
  return hit ? toRecord(hit) : null
}

// Muskel-Index für die Coverage: Name/Exercise-ID (klein + gefaltet) → Record mit
// primary_muscles/secondary_muscles im Quellvokabular (Yuhonas: "lower back",
// "abdominals", "lats" … — von muscleToRegion() per Freitext-Alias aufgelöst).
// Letzter Fallback hinter dem Katalog; leer, wenn kein Mirror geladen ist.
export async function getMirrorMuscleIndex() {
  const { items } = await loadAll({})
  const index = new Map()
  for (const ex of items) {
    if (!ex.primary?.length && !ex.secondary?.length) continue
    const record = toRecord(ex)
    for (const raw of [ex.exerciseId, ex.name]) {
      if (!raw) continue
      for (const key of [String(raw).toLowerCase(), foldName(raw)]) {
        if (key && !index.has(key)) index.set(key, record)
      }
    }
  }
  return index
}

// Katalog-Zeilen ohne alte yuhonas-Bulk-Records. curatedIds = IDs kuratierter
// Katalog-Einträge (Expert/Inbox), die zufällig ebenfalls `yuhonas_*` heißen —
// die bleiben, es sind Coach-Drafts mit eigenen Daten.
export function dropLegacyYuhonas(rows, curatedIds = new Set()) {
  return rows.filter((row) => {
    const id = row.exercise_id || row.id
    return !isLegacyYuhonasId(id) || curatedIds.has(id)
  })
}

// Gemeinsame Rangliste: Katalog-Zeilen (mit Tier-Bonus) + Mirror-Treffer.
export function mergeRanked(catalogRows, mirrorHits, query, limit) {
  const tierBonus = { expert: 10, inbox: 5 }
  const ranked = [
    ...catalogRows.map((row) => ({
      record: row,
      score: scoreNames(query, [row.display_name, row.name, row.german, row.english, row.exercise_id, row.id]) + (tierBonus[row.source] || 0),
    })),
    ...mirrorHits,
  ]
  return ranked.sort((a, b) => b.score - a.score).slice(0, limit).map((r) => r.record)
}
