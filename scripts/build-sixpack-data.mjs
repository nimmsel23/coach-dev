#!/usr/bin/env node
// Generiert src/views/SixPack/sixpackData.generated.js aus der KB
// (fitness/catalog/kb/exercises/6pack/ + /calisthenics/) — die KB bleibt SSOT,
// dieses Skript ist der einzige Ort, der KB-Inhalte in JS dupliziert. Läuft
// vor jedem Dev-Start und Build (predev/prebuild in package.json), damit neue
// Exercises/Workouts/Skills ohne Code-Änderung auftauchen, sobald sie in der
// KB liegen.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import * as yaml from 'js-yaml'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, '..')
// 6Pack-Quelle: Nachbar-Checkout (~/dev/6pack-dev bzw. im vitalos-Workspace 6pack-app).
const SIXPACK_SRC = ['6pack-app', '6pack-dev'].map((n) => join(REPO_ROOT, '..', n)).find(existsSync)
if (!SIXPACK_SRC) {
  console.error('build-sixpack-data: Checkout ../6pack-app bzw. ../6pack-dev fehlt')
  process.exit(1)
}
const { loadMuscles, exerciseContent } = await import(pathToFileURL(join(SIXPACK_SRC, 'catalogContent.mjs')).href)
const SIXPACK_DIR = join(REPO_ROOT, 'fitness/catalog/kb/exercises/6pack')
const CALISTHENICS_DIR = join(REPO_ROOT, 'fitness/catalog/kb/exercises/calisthenics')
const OUT_FILE = join(REPO_ROOT, 'src/views/SixPack/sixpackData.generated.js')
// Eigene Clips (public/videos/<exercise_id>.mp4) ersetzen die Katalog-Demo, siehe 6pack-dev docs/VIDEO_URLS.md.
const CLIPS_DIR = join(REPO_ROOT, 'public/videos')

// Tag → grobe Learn/Shuffle-Kategorie. Neue Tags fallen auf 'lower' zurück
// (häufigste Kategorie) statt den Build brechen zu lassen.
const TAG_TO_CATEGORY = {
  lower_abs: 'lower',
  upper_abs: 'upper',
  obliques: 'lateral_chain',
  rotation: 'rotation',
  standing: 'rotation',
  plank: 'anti_extension',
  anti_rotation: 'anti_extension',
  conditioning: 'anti_extension',
  full_range: 'upper',
}

const CATEGORY_LABELS = {
  lower: 'Lower Abs',
  anti_extension: 'Plank / Anti-Extension',
  lateral_chain: 'Obliques / Lateral Chain',
  rotation: 'Rotation',
  upper: 'Upper Abs',
}

function categoryFromTags(tags) {
  for (const tag of tags || []) {
    if (TAG_TO_CATEGORY[tag]) return TAG_TO_CATEGORY[tag]
  }
  return 'lower'
}

function loadYaml(path) {
  return yaml.load(readFileSync(path, 'utf-8'))
}

function isProgramFile(filename) {
  return /_workouts\.yml$/.test(filename)
}

function buildExercises() {
  const muscles = loadMuscles(join(REPO_ROOT, 'fitness/catalog/kb/muscles'))
  const files = readdirSync(SIXPACK_DIR).filter((f) => f.endsWith('.yml') && !isProgramFile(f))
  const exercises = {}
  const coaching = {}
  for (const file of files) {
    const doc = loadYaml(join(SIXPACK_DIR, file))
    const ex = doc.exercises?.[0]
    if (!ex) continue
    const category = categoryFromTags(ex.tags)
    exercises[ex.id] = {
      id: ex.id,
      name: ex.name,
      ...exerciseContent(ex, muscles, CLIPS_DIR),
      category,
      focusLabel: CATEGORY_LABELS[category] || 'Core',
      ...(ex.video_url ? { videoUrl: ex.video_url } : {}),
    }
    coaching[ex.id] = {
      coachingNotes: ex.coaching_notes || [],
      commonErrors: ex.common_errors || [],
      equipment: ex.equipment || [],
    }
  }
  return { exercises, coaching }
}

function buildWorkouts(exercises) {
  const files = readdirSync(SIXPACK_DIR).filter(isProgramFile)
  const workouts = {}
  for (const file of files) {
    const doc = loadYaml(join(SIXPACK_DIR, file))
    // week{N}_workouts.yml → Woche N, sonst Fallback Woche 1. Absoluter Tag =
    // (Woche-1)*7 + Tag-in-Woche, damit künftige Wochen ohne Code-Änderung
    // an der richtigen Stelle im Programm auftauchen.
    const weekMatch = file.match(/week(\d+)_workouts\.yml$/)
    const week = weekMatch ? Number(weekMatch[1]) : 1
    for (const [dayInWeek, dayData] of Object.entries(doc.verified_days || {})) {
      const absoluteDay = (week - 1) * 7 + Number(dayInWeek)
      workouts[absoluteDay] = {
        source: doc.program_id || file,
        totalSeconds: dayData.total_seconds,
        items: (dayData.items || []).map((item) => ({
          type: item.type,
          name: item.type === 'exercise' ? exercises[item.exercise_id]?.name || item.exercise_id : 'Rest',
          exerciseId: item.exercise_id,
          seconds: item.duration_seconds,
          ...(exercises[item.exercise_id]?.videoUrl ? { videoUrl: exercises[item.exercise_id].videoUrl } : {}),
          ...(item.notes ? { notes: item.notes } : {}),
        })),
      }
    }
  }
  return workouts
}

function attachVerifiedDays(exercises, workouts) {
  for (const ex of Object.values(exercises)) ex.verifiedDays = []
  for (const [day, workout] of Object.entries(workouts)) {
    for (const item of workout.items) {
      if (item.type !== 'exercise') continue
      const ex = exercises[item.exerciseId]
      if (ex && !ex.verifiedDays.includes(Number(day))) ex.verifiedDays.push(Number(day))
    }
  }
  for (const ex of Object.values(exercises)) ex.verifiedDays.sort((a, b) => a - b)
}

function buildCategories(exercises) {
  const byCategory = {}
  for (const ex of Object.values(exercises)) {
    ;(byCategory[ex.category] ||= []).push(ex.name)
  }
  return Object.entries(CATEGORY_LABELS).map(([id, label]) => ({
    id,
    label,
    exercises: byCategory[id] || [],
  }))
}

function buildSkills() {
  const files = readdirSync(CALISTHENICS_DIR).filter((f) => f.endsWith('.yml'))
  return files
    .map((file) => loadYaml(join(CALISTHENICS_DIR, file)))
    .map((doc) => ({ id: doc.id, name: doc.name, tier: doc.tier, progressions: doc.progressions || [] }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

const { exercises, coaching } = buildExercises()
const workouts = buildWorkouts(exercises)
attachVerifiedDays(exercises, workouts)
const categories = buildCategories(exercises)
const skills = buildSkills()

const exerciseDetails = Object.fromEntries(
  Object.entries(exercises).sort(([, a], [, b]) => a.name.localeCompare(b.name)),
)

const banner = `// AUTO-GENERATED — nicht manuell editieren.
// Quelle: fitness/catalog/kb/exercises/6pack/ + /calisthenics/ (SSOT).
// Neu erzeugen: npm run build:sixpack-data (läuft automatisch vor dev/build).
`

const out = `${banner}
export const SIXPACK_EXERCISE_DETAILS = ${JSON.stringify(exerciseDetails, null, 2)};

export const SIXPACK_EXERCISE_COACHING = ${JSON.stringify(coaching, null, 2)};

export const SIXPACK_EXERCISE_POOL = ${JSON.stringify(
  Object.values(exercises).map((e) => e.name),
  null,
  2,
)};

export const SIXPACK_CATEGORIES = ${JSON.stringify(categories, null, 2)};

export const SIXPACK_VERIFIED_WORKOUTS = ${JSON.stringify(workouts, null, 2)};

export const SIXPACK_CALISTHENICS_SKILLS = ${JSON.stringify(skills, null, 2)};
`

// src/views/SixPack ist nicht mehr eingecheckt (Code kommt aus dem 6pack-Submodul).
mkdirSync(dirname(OUT_FILE), { recursive: true })
writeFileSync(OUT_FILE, out)
console.log(
  `sixpackData.generated.js geschrieben: ${Object.keys(exercises).length} Exercises, ${Object.keys(workouts).length} Workout-Tage, ${skills.length} Skills.`,
)
