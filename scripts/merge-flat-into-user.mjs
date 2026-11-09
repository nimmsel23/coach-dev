#!/usr/bin/env node
/**
 * Merge: ~/.aos/fitness/sessions/{date}.json  →  user-dir Session
 *
 * Die flat-Sessions enthalten reichere Felder (location, ausführliche notes)
 * als die user-dir Versionen, die später durch PWA-Save überschrieben wurden.
 *
 * Strategie (non-destruktiv, additive):
 *  - Top-Level Scalar (location, notes): aus flat übernehmen falls user-dir
 *    das Feld fehlt oder ein Leerstring/null ist. Falls user-dir schon
 *    eigenen non-trivialen Wert hat → behalten.
 *  - Spezial: notes — wenn user-dir kürzer ist als flat, nimm flat (Annahme:
 *    flat ist die "Original"-Version mit mehr Detail).
 *  - effort: nur übernehmen wenn user-dir null/0 ist.
 *  - exercises: per id|exercise_id matchen, gleiche Logik feld-für-feld.
 *    Übungen die nur in einer Quelle existieren bleiben unverändert.
 *  - saved_at, snapshot_version, date: NICHT überschreiben (user-dir wins).
 *
 * Backup: jede modifizierte Datei wird als *.pre-merge.bak gesichert.
 *
 * Usage:
 *   node scripts/merge-flat-into-user.mjs --uid 59ole36u... [--dry-run]
 */
import { readdirSync, readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const args = process.argv.slice(2)
const DRY = args.includes('--dry-run')
const uidArg = args.find((a) => a.startsWith('--uid='))?.split('=')[1] || args[args.indexOf('--uid') + 1]

if (!uidArg) {
  console.error('Usage: merge-flat-into-user.mjs --uid <UID> [--dry-run]')
  process.exit(1)
}

const FLAT_DIR = join(homedir(), '.aos', 'fitness', 'sessions')
const USER_DIR = join(homedir(), '.aos', 'fitness', 'users', uidArg, 'sessions')

if (!existsSync(USER_DIR)) {
  console.error(`User-Dir fehlt: ${USER_DIR}`)
  process.exit(1)
}

const TRIVIAL = (v) => v == null || v === '' || (typeof v === 'number' && v === 0)

function mergeScalar(userVal, flatVal, key) {
  if (TRIVIAL(userVal) && !TRIVIAL(flatVal)) return { merged: flatVal, changed: true }
  if (
    key === 'notes' &&
    typeof userVal === 'string' &&
    typeof flatVal === 'string' &&
    flatVal.length > userVal.length * 1.5 &&
    flatVal.length > userVal.length + 20
  ) {
    return { merged: flatVal, changed: true } // flat substanziell ausführlicher
  }
  return { merged: userVal, changed: false }
}

function exId(e) {
  return e.id || e.exercise_id || e.exercise_id_at_log || e.name
}

function mergeExercise(userEx, flatEx) {
  let changed = false
  const out = { ...userEx }
  for (const k of ['note', 'notes', 'weight', 'reps', 'sets', 'rpe']) {
    if (flatEx[k] === undefined) continue
    const r = mergeScalar(userEx[k], flatEx[k], k)
    if (r.changed) {
      out[k] = r.merged
      changed = true
    }
  }
  return { merged: out, changed }
}

const files = readdirSync(FLAT_DIR).filter((f) => f.endsWith('.json') && !f.includes('.bak') && !f.includes('history'))

let modified = 0,
  untouched = 0,
  missing = 0
const summary = []

for (const f of files) {
  const flatPath = join(FLAT_DIR, f)
  const userPath = join(USER_DIR, f)

  if (!existsSync(userPath)) {
    missing++
    summary.push(`  ${f}: nur in flat — überspringe (manuell prüfen ob neu kopieren)`)
    continue
  }

  let flat, user
  try {
    flat = JSON.parse(readFileSync(flatPath, 'utf8'))
  } catch {
    continue
  }
  try {
    user = JSON.parse(readFileSync(userPath, 'utf8'))
  } catch {
    continue
  }

  const next = { ...user }
  const changes = []

  for (const k of ['location', 'notes', 'block', 'mood', 'effort']) {
    if (flat[k] === undefined) continue
    const r = mergeScalar(user[k], flat[k], k)
    if (r.changed) {
      next[k] = r.merged
      changes.push(k)
    }
  }

  if (Array.isArray(user.exercises) && Array.isArray(flat.exercises)) {
    const flatMap = new Map()
    for (const e of flat.exercises) {
      const id = exId(e)
      if (id) flatMap.set(String(id).toLowerCase(), e)
    }
    const mergedEx = user.exercises.map((e) => {
      const id = exId(e)
      const flatE = id && flatMap.get(String(id).toLowerCase())
      if (!flatE) return e
      const r = mergeExercise(e, flatE)
      if (r.changed) changes.push(`ex:${id}`)
      return r.merged
    })
    next.exercises = mergedEx
  }

  if (changes.length === 0) {
    untouched++
    continue
  }

  if (!DRY) {
    copyFileSync(userPath, userPath + '.pre-merge.bak')
    writeFileSync(userPath, JSON.stringify(next, null, 2))
  }
  modified++
  summary.push(`  ${f}: ${changes.join(', ')}`)
}

console.log(`${DRY ? '[DRY-RUN] ' : ''}merge done`)
console.log(`  modified:  ${modified}`)
console.log(`  untouched: ${untouched}`)
console.log(`  missing in user-dir: ${missing}`)
if (summary.length) {
  console.log('\nDetails:')
  summary.forEach((s) => console.log(s))
}
