#!/usr/bin/env node
/**
 * Migration: alte Schwimm-Sessions → swimStyle-Feld + Brustschwimmen-Muskeln
 *
 * Vor Einführung des Brust/Rücken-Switches (c968d7a) hatten Schwimm-Sessions
 * entweder gar kein muscles-Array oder ein veraltetes Mapping (back-dominant).
 * Dieses Skript setzt:
 *   - activity.swimStyle = "breast" (Default, da User Brustschwimmer)
 *   - activity.muscles   = aktuelles Brustschwimmen-Profil
 *
 * Idempotent: Sessions mit bereits gesetztem swimStyle werden übersprungen.
 *
 * Usage:
 *   node scripts/migrate-swim-sessions.mjs [--dry-run] [--style=breast|back]
 */

import { readdirSync, readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { SWIM_STYLE_MUSCLES } from '../src/constants/ActivityConstants.js'

const SESSIONS_DIR = join(homedir(), '.aos', 'fitness', 'sessions')
const args = process.argv.slice(2)
const DRY = args.includes('--dry-run')
const styleArg = args.find((a) => a.startsWith('--style='))?.split('=')[1] || 'breast'
if (!SWIM_STYLE_MUSCLES[styleArg]) {
  console.error(`Unbekannter Stil: ${styleArg} (erlaubt: breast, back)`)
  process.exit(1)
}

if (!existsSync(SESSIONS_DIR)) {
  console.error(`Sessions-Dir fehlt: ${SESSIONS_DIR}`)
  process.exit(1)
}

const targetMuscles = SWIM_STYLE_MUSCLES[styleArg]
const files = readdirSync(SESSIONS_DIR).filter((f) => f.endsWith('.json') && !f.includes('history'))

let migrated = 0,
  skipped = 0,
  untouched = 0
const changedDates = []

for (const f of files) {
  const p = join(SESSIONS_DIR, f)
  let data
  try {
    data = JSON.parse(readFileSync(p, 'utf8'))
  } catch {
    skipped++
    continue
  }

  if (data.activity?.type !== 'swimming') {
    untouched++
    continue
  }
  if (data.activity.swimStyle) {
    skipped++
    continue
  }

  const next = {
    ...data,
    activity: {
      ...data.activity,
      swimStyle: styleArg,
      muscles: targetMuscles,
    },
    _migrated_at: new Date().toISOString(),
    _migration: 'swim-style-2026-06',
  }

  if (!DRY) {
    copyFileSync(p, p + '.pre-swim-migration.bak')
    writeFileSync(p, JSON.stringify(next, null, 2))
  }
  migrated++
  changedDates.push(f.replace('.json', ''))
}

console.log(`${DRY ? '[DRY-RUN] ' : ''}swim-migration done`)
console.log(`  migrated:    ${migrated}`)
console.log(`  skipped:     ${skipped} (bereits swimStyle gesetzt)`)
console.log(`  untouched:   ${untouched} (keine Schwimm-Session)`)
if (changedDates.length) console.log(`  Dates: ${changedDates.join(', ')}`)
