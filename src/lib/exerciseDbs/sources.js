import { yuhonasImageUrl } from '../yuhonasImage.js'

// Registry der Übungs-Datenbanken, die ein Gerät lokal spiegeln kann.
// Jede Quelle liefert die Rohdaten 1:1 aus ihrem Git-Repo (kein Umbau, keine
// Feld-Auswahl) — `normalize()` bringt einen Roh-Eintrag erst beim Lesen in
// die gemeinsame Form, die der Atlas-Tab anzeigt. Weitere DBs werden hier als
// zusätzlicher Eintrag eingehängt, der Rest (IndexedDB, Hook, UI) bleibt gleich.
//
// Gemeinsame Form (normalize):
//   { uid, source, id, exerciseId, name, category, level, force, mechanic, equipment,
//     primary[], secondary[], steps[], images[] }

const YUHONAS_REPO = 'yuhonas/free-exercise-db'
const YUHONAS_FILE = 'dist/exercises.json'

async function yuhonasLatest() {
  // Commit-SHA der Datei = unveränderliche Version. GitHub-API ist
  // rate-limitiert (60/h/IP) — bei Fehlschlag fällt der Download auf `main`
  // zurück, der Mirror kennt dann nur keine Version.
  try {
    const res = await fetch(
      `https://api.github.com/repos/${YUHONAS_REPO}/commits?path=${YUHONAS_FILE}&per_page=1`,
      { headers: { Accept: 'application/vnd.github+json' } },
    )
    if (!res.ok) return null
    const [commit] = await res.json()
    if (!commit?.sha) return null
    return { version: commit.sha, versionDate: commit.commit?.committer?.date || null }
  } catch {
    return null
  }
}

async function yuhonasDownload() {
  const latest = await yuhonasLatest()
  const ref = latest?.version || 'main'
  const url = `https://raw.githubusercontent.com/${YUHONAS_REPO}/${ref}/${YUHONAS_FILE}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Download fehlgeschlagen (HTTP ${res.status})`)
  const text = await res.text()
  const items = JSON.parse(text)
  if (!Array.isArray(items) || !items.length || !items[0]?.name) {
    throw new Error('Unerwartetes Datenformat von upstream')
  }
  return {
    items,
    bytes: new Blob([text]).size,
    url,
    version: latest?.version || null,
    versionDate: latest?.versionDate || null,
  }
}

function yuhonasNormalize(raw) {
  const frames = Array.isArray(raw.images) && raw.images.length ? raw.images : [0, 1]
  return {
    uid: `yuhonas:${raw.id}`,
    // Gleiche ID wie der frühere Katalog-Import (importer.py: safe_id) — bestehende
    // Session-/Plan-Einträge mit `yuhonas_*`-IDs bleiben damit gültig.
    exerciseId: `yuhonas_${String(raw.id).toLowerCase().replace(/ /g, '_')}`,
    source: 'yuhonas',
    id: raw.id,
    name: raw.name,
    category: raw.category || null,
    level: raw.level || null,
    force: raw.force || null,
    mechanic: raw.mechanic || null,
    equipment: raw.equipment || null,
    primary: raw.primaryMuscles || [],
    secondary: raw.secondaryMuscles || [],
    steps: raw.instructions || [],
    images: frames.map((_, i) => yuhonasImageUrl({ yuhonas_id: raw.id }, i)),
  }
}

export const EXERCISE_DB_SOURCES = [
  {
    id: 'yuhonas',
    label: 'free-exercise-db',
    author: 'yuhonas',
    repoUrl: `https://github.com/${YUHONAS_REPO}`,
    license: 'Unlicense (Public Domain)',
    description: 'Offene Übungsdatenbank mit Anleitung, Level, Equipment und zwei Bildframes je Übung.',
    imageHint: 'grob 100 MB',
    latest: yuhonasLatest,
    download: yuhonasDownload,
    normalize: yuhonasNormalize,
  },
]

export function getSource(id) {
  return EXERCISE_DB_SOURCES.find((s) => s.id === id) || null
}
