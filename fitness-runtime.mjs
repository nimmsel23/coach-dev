import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import yaml from 'js-yaml'

// fitness_agent/server.py (aiohttp, :9120/:9130) ist archiviert (siehe archive/fitness_agent_server.py).
// Katalog-Daten kommen direkt von der Platte, dynamische Endpunkte (plan/weekly/export/inbox)
// werden an den laufenden FastAPI-Prod-Server weitergereicht.
const PYTHON_PORT = Number(process.env.FITNESS_PYTHON_PORT || 9150)
const PYTHON_BASE = `http://127.0.0.1:${PYTHON_PORT}`

// Relativ zu diesem File auflösen, nicht zu $HOME/dev/fitness-dev — sonst zeigt
// der Pfad in /opt/fitness (Prod-Deploy) auf den dev-Checkout statt auf die
// eigenen, mitgelieferten Dateien.
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CATALOG_JSON = path.join(process.env.HOME, '.aos', 'fitness', 'workouts', 'catalog.json')
const CONFIG_YML = path.join(__dirname, 'fitness', 'catalog', 'config.yml')
const WGER_MAPPING_YML = path.join(__dirname, 'fitness', 'catalog', 'kb', 'wger_mapping.yml')

// Single-key top-level dicts (e.g. { wger_mapping: { mappings: {...} } }) → unwrap to the inner dict
function unwrapSingleKey(section) {
  if (section && typeof section === 'object' && !Array.isArray(section)) {
    const keys = Object.keys(section)
    if (keys.length === 1 && section[keys[0]] && typeof section[keys[0]] === 'object') {
      return section[keys[0]]
    }
  }
  return section
}

async function fetchPython(endpoint, options = {}, { silent = false } = {}) {
  try {
    const res = await fetch(`${PYTHON_BASE}${endpoint}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...options.headers },
    })
    return res.ok ? res.json() : null
  } catch (err) {
    if (!silent) console.error(`[fitness-runtime] python backend fetch failed (${endpoint}):`, err.message)
    return null
  }
}

function readYaml(filePath) {
  try {
    return yaml.load(fs.readFileSync(filePath, 'utf8')) || {}
  } catch (err) {
    console.error(`[fitness-runtime] readYaml failed (${filePath}):`, err.message)
    return {}
  }
}

function readCatalogJson() {
  try {
    const raw = JSON.parse(fs.readFileSync(CATALOG_JSON, 'utf8'))
    return { exercises: raw.exercises || [] }
  } catch (err) {
    console.error(`[fitness-runtime] readCatalogJson failed (${CATALOG_JSON}):`, err.message)
    return { exercises: [] }
  }
}

// Minimal placeholder data while nothing has loaded yet
const fallbackData = {
  config: {},
  exercises: [],
  wgerMapping: {},
}

let cachedSnapshot = null
let lastSnapshotAttempt = 0
const SNAPSHOT_TTL_MS = 30_000

export async function loadRuntimeSnapshot({ force = false } = {}) {
  const now = Date.now()
  const hasData = cachedSnapshot && (cachedSnapshot.exercises?.length || 0) > 0
  if (!force && hasData && now - lastSnapshotAttempt < SNAPSHOT_TTL_MS) {
    return cachedSnapshot
  }
  lastSnapshotAttempt = now

  const { exercises } = readCatalogJson()
  cachedSnapshot = {
    config: readYaml(CONFIG_YML),
    wgerMapping: unwrapSingleKey(readYaml(WGER_MAPPING_YML)),
    exercises,
  }
  return cachedSnapshot
}

// Lazy proxy — re-reads cachedSnapshot on every property access so callers
// don't capture a stale empty object from boot time.
export const fitnessData = new Proxy({}, {
  get(_t, prop) {
    const src = cachedSnapshot || fallbackData
    return src[prop]
  },
})

// Kick off an initial load in the background (non-blocking).
loadRuntimeSnapshot().catch(() => {})

export function obsidianTargetPath() {
  return fitnessData.config?.obsidian?.export_path || ''
}

function toFrontendExercise(ex, extra = {}) {
  if (!ex) return null
  return {
    ...ex,
    id: ex.exercise_id || ex.id,
    name: ex.display_name || ex.name_de || ex.name || ex.exercise_id,
    displayName: ex.display_name || ex.name,
    primaryMuscles: ex.primary_muscles || ex.primaryMuscles || [],
    secondaryMuscles: ex.secondary_muscles || ex.secondaryMuscles || [],
    source: ex.source || 'local_yaml',
    ...extra,
  }
}

export async function searchExercises(query, limit = 12) {
  let snapshot = cachedSnapshot
  if (!snapshot || !(snapshot.exercises?.length)) {
    snapshot = await loadRuntimeSnapshot({ force: true })
  }
  const normalized = query.toLowerCase()
  const matches = (snapshot?.exercises || [])
    .filter(ex =>
      (ex.id || ex.exercise_id || '').toLowerCase().includes(normalized) ||
      (ex.display_name || '').toLowerCase().includes(normalized) ||
      (ex.name_de || '').toLowerCase().includes(normalized)
    )
    .slice(0, limit)
    .map(ex => toFrontendExercise(ex))

  return {
    ok: true,
    source: 'snapshot',
    query,
    results: matches,
    suggestions: matches.slice(0, 3).map(m => ({ canonical_id: m.id, display_name: m.name })),
  }
}


export async function buildPlan(options = {}) {
  const query = new URLSearchParams(options).toString()
  return fetchPython(`/fitness/plan?${query}`)
}

export async function getWeeklySummary(weekSelector = 'current') {
  return fetchPython(`/fitness/weekly?week=${weekSelector}`)
}

export async function exportWithPython(kind, payload = {}) {
  return fetchPython(`/fitness/export/${kind}`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function exportSessionMarkdown(session) {
  const targetDir = obsidianTargetPath()
  if (!targetDir) return { error: 'obsidian export path missing' }

  const date = session?.date || new Date().toISOString().slice(0, 10)
  const noteName = `Sessions/${date}`
  const target = path.join(targetDir, `${noteName}.md`)

  try {
    fs.mkdirSync(path.dirname(target), { recursive: true })

    const exercises = Array.isArray(session?.exercises) ? session.exercises : []
    const lines = [
      '---',
      'type: training-session',
      `date: ${JSON.stringify(date)}`,
      `block: ${JSON.stringify(session?.block || '')}`,
      '---',
      `# Session ${date}`,
      '',
      '## Summary',
      `- Block: ${session?.block || 'n/a'}`,
      `- Effort: ${session?.effort ?? 'n/a'}`,
      `- Mood: ${session?.mood || 'n/a'}`,
      '',
      '## Exercises',
      '| Exercise | Sets | Reps | Weight | Note |',
      '| --- | --- | --- | --- | --- |',
      ...(exercises.length
        ? exercises.map(ex => `| ${ex.name || 'Uebung'} | ${ex.sets ?? ''} | ${ex.reps ?? ''} | ${ex.weight ?? ''} | ${ex.note || ''} |`)
        : ['| - | - | - | - | - |']),
      '',
      '## Notes',
      session?.notes ? String(session.notes) : '-',
    ]

    const content = lines.join('\n').replace(/\n+$/, '\n')
    fs.writeFileSync(target, content, 'utf8')
    return { path: target, used_fallback_name: false, overwritten: false, warning: null }
  } catch (err) {
    console.error('[fitness-runtime] exportSessionMarkdown failed:', err.message)
    return { error: err.message }
  }
}

export async function queueForEnrichment(ex) {
  if (!ex || ex.source === 'expert') return
  fetchPython('/fitness/inbox/queue', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ exercise_id: ex.id || ex.exercise_id, name: ex.name || ex.display_name }),
  }, { silent: true }).catch(() => {})
}

const FAV_KEY = 'fitness_favourites'
export function getFavourites() {
  try { return JSON.parse(localStorage.getItem(FAV_KEY) || '[]') } catch { return [] }
}
export function toggleFavourite(exerciseId) {
  const favs = getFavourites()
  const idx = favs.indexOf(exerciseId)
  const next = idx >= 0 ? favs.filter(f => f !== exerciseId) : [...favs, exerciseId]
  localStorage.setItem(FAV_KEY, JSON.stringify(next))
  return next.includes(exerciseId)
}
