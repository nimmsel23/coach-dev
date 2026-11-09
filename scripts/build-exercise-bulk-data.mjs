#!/usr/bin/env node
/* eslint-env node */
// Bulk-JS aus:
//   - exercises/unreviewed_wger.yml  (wger API-Dump)
//   - vendor/free-exercise-db/dist/exercises.json  (yuhonas Pin — kein unreviewed_yuhonas.yml mehr)
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as yaml from 'js-yaml'
import { isNonExercise } from '../src/lib/db/shared/nonExercises.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, '..')
const kbCandidates = [
  process.env.FITNESS_KB_DIR,
  join(REPO_ROOT, 'fitness/catalog/kb'),
  join(REPO_ROOT, '..', 'fitness'),
  join(REPO_ROOT, '..', 'coach-dev', 'fitness/catalog/kb'),
].filter(Boolean)
const KB_DIR = kbCandidates.find((c) => existsSync(c))
if (!KB_DIR) {
  throw new Error(`Fitness-KB nicht gefunden. Gesucht:\n  ${kbCandidates.join('\n  ')}`)
}
const EXERCISES_DIR = join(KB_DIR, 'exercises')
const YUHONAS_JSON = join(KB_DIR, 'vendor/free-exercise-db/dist/exercises.json')
const OUT_FILE = join(REPO_ROOT, 'src/lib/db/firestore/exerciseBulkData.generated.js')

const NON_EXERCISES_FILE = join(KB_DIR, 'registry/non_exercises.yml')
const NON_EXERCISES_OUT = join(REPO_ROOT, 'src/lib/db/shared/nonExercises.generated.js')

function loadYaml(path) {
  return yaml.load(readFileSync(path, 'utf-8'))
}

function normalizeBulkExercise(exercise) {
  const tags = Array.isArray(exercise?.tags) ? exercise.tags : []
  const nextTags = tags.filter((tag) => tag !== 'unreviewed')
  if (!nextTags.includes('bulk_import')) nextTags.push('bulk_import')
  return {
    ...exercise,
    tags: nextTags,
    review_state:
      exercise?.review_state?.status === 'draft'
        ? { ...exercise.review_state, status: 'imported' }
        : exercise?.review_state,
  }
}

function fromYuhonasRaw(item) {
  const id = item?.id
  const name = item?.name
  if (!id || !name) return null
  const exercise_id = `yuhonas_${String(id).toLowerCase().replace(/ /g, '_')}`
  return {
    exercise_id,
    display_name: name,
    english: name,
    category: item.category || 'other',
    primary_muscles: item.primaryMuscles || [],
    secondary_muscles: item.secondaryMuscles || [],
    equipment: item.equipment ? [item.equipment] : [],
    coaching_notes: item.instructions || [],
    original_description: item.instructions || [],
    instructions: item.instructions || [],
    images: item.images || [],
    tags: ['bulk_import', 'yuhonas'],
    yuhonas_id: id,
    level: item.level || null,
    force: item.force || null,
    mechanic: item.mechanic || null,
  }
}

const nonExercises = (existsSync(NON_EXERCISES_FILE) ? loadYaml(NON_EXERCISES_FILE)?.entries : []) || []
const nonExerciseBlock = {
  ids: nonExercises
    .map((e) => e.exercise_id)
    .filter(Boolean)
    .map(String),
  wger: nonExercises
    .map((e) => e.wger_id)
    .filter((v) => v != null)
    .map(String),
  yuhonas: nonExercises
    .map((e) => e.yuhonas_id)
    .filter(Boolean)
    .map((v) => String(v).toLowerCase()),
}

const exercises = []

const wgerPath = join(EXERCISES_DIR, 'unreviewed_wger.yml')
if (existsSync(wgerPath)) {
  const doc = loadYaml(wgerPath)
  for (const ex of doc?.exercises || []) {
    if (!ex || (!ex.exercise_id && !ex.id)) continue
    if (isNonExercise(ex, nonExerciseBlock)) continue
    exercises.push(normalizeBulkExercise(ex))
  }
} else {
  console.warn(`warn: missing ${wgerPath}`)
}

if (!existsSync(YUHONAS_JSON)) {
  throw new Error(
    `Yuhonas vendor JSON fehlt: ${YUHONAS_JSON}\n` + 'In der KB: git submodule update --init vendor/free-exercise-db',
  )
}
const yuhonasRaw = JSON.parse(readFileSync(YUHONAS_JSON, 'utf-8'))
if (!Array.isArray(yuhonasRaw)) {
  throw new Error(`Unerwartetes Yuhonas-Format in ${YUHONAS_JSON}`)
}
for (const item of yuhonasRaw) {
  const ex = fromYuhonasRaw(item)
  if (!ex) continue
  if (isNonExercise(ex, nonExerciseBlock)) continue
  exercises.push(normalizeBulkExercise(ex))
}

const banner = `// AUTO-GENERATED — nicht manuell editieren.
// Quellen: unreviewed_wger.yml + vendor/free-exercise-db/dist/exercises.json
// Neu erzeugen: pnpm run build:kb-data / build:bulk-data
`

writeFileSync(
  OUT_FILE,
  `${banner}
export const EXERCISE_BULK_DATA = ${JSON.stringify(exercises, null, 2)};

export default EXERCISE_BULK_DATA;
`,
)
writeFileSync(
  NON_EXERCISES_OUT,
  `// AUTO-GENERATED — nicht manuell editieren.
// Quelle: fitness/catalog/kb/registry/non_exercises.yml (SSOT).
export const NON_EXERCISE_BLOCK = ${JSON.stringify(nonExerciseBlock, null, 2)};
`,
)
console.log(`exerciseBulkData.generated.js geschrieben: ${exercises.length} Bulk-Übungen.`)
