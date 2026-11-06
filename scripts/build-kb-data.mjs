#!/usr/bin/env node
/* eslint-env node */
// build:kb-data mit Stempel: jeder Daten-Schritt läuft nur, wenn sich seine Eingaben
// (Inhalts-Hash) geändert haben oder eine Ausgabedatei fehlt. Die generierten Dateien sind
// gitignored, auf einem frischen Checkout (CI ohne Cache) laufen also alle Schritte wie bisher.
//
//   node scripts/build-kb-data.mjs            # nur veraltete Schritte
//   node scripts/build-kb-data.mjs --force    # alles neu (oder KB_DATA_FORCE=1)
//
// Stempel: .cache/kb-data/stamps.json (gitignored). Die Eingaben jedes Schritts sind unten
// aufgelistet; fehlt dort etwas, wird der Schritt zu selten ausgeführt — dann hier ergänzen.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const STAMP_FILE = join(REPO, '.cache/kb-data/stamps.json');
const FORCE = process.argv.includes('--force') || process.env.KB_DATA_FORCE === '1';

// Nachbar-Checkouts wie in den Einzel-Skripten (build-sixpack-data.mjs, build-plan-data.mjs)
const sibling = (names) => {
  const dir = names.map((n) => join(REPO, '..', n)).find(existsSync);
  if (!dir) throw new Error(`Checkout fehlt: ${names.map((n) => join(REPO, '..', n)).join(' | ')}`);
  return dir;
};
const SIXPACK = sibling(['6pack-app', '6pack-dev']);
const PLAN = sibling(['plan-app', 'plan-dev']);

const SKIP_DIRS = new Set(['.git', 'node_modules', '.cache', '.worktrees', 'android', 'ios', 'dist', 'dist-firebase', 'dist-versions']);
const DATA_EXT = /\.(mjs|js|json|ya?ml|md)$/;

function walk(path, out = []) {
  if (!existsSync(path)) return out;
  const st = statSync(path);
  if (st.isFile()) { out.push(path); return out; }
  for (const name of readdirSync(path).sort()) {
    if (SKIP_DIRS.has(name) || name.endsWith('.generated.js')) continue;
    const full = join(path, name);
    const s = statSync(full);
    if (s.isDirectory()) walk(full, out);
    else if (DATA_EXT.test(name)) out.push(full);
  }
  return out;
}

function hashInputs(paths) {
  const h = createHash('sha256');
  for (const p of paths) {
    for (const file of walk(p)) {
      h.update(relative('/', file));
      h.update('\0');
      h.update(readFileSync(file));
      h.update('\0');
    }
    if (!existsSync(p)) h.update(`fehlt:${relative('/', p)}\0`);
  }
  return h.digest('hex');
}

const r = (...p) => join(REPO, ...p);
const KB = r('fitness/catalog/kb');

const STEPS = [
  {
    name: 'sixpack-data',
    script: r('scripts/build-sixpack-data.mjs'),
    inputs: [r('scripts/build-sixpack-data.mjs'), join(KB, 'exercises/6pack'), join(KB, 'exercises/calisthenics'), join(KB, 'muscles'), r('public/videos'), SIXPACK],
    outputs: [r('src/views/SixPack/sixpackData.generated.js')],
  },
  {
    name: 'exercise-data',
    script: r('scripts/exercise-data.mjs'),
    inputs: [r('scripts/exercise-data.mjs'), r('scripts/build-exercise-bulk-data.mjs'), r('scripts/build-ppl-data.mjs'), join(KB, 'exercises'), join(KB, 'registry/non_exercises.yml'), r('src/lib/db/shared/nonExercises.js')],
    outputs: ['exerciseBulkData', 'push', 'pull', 'legs'].map((n) => r(`src/lib/db/firestore/${n}.generated.js`)).concat(r('src/lib/db/shared/nonExercises.generated.js')),
  },
  {
    name: 'coaching-notes',
    script: r('scripts/build-coaching-notes.mjs'),
    inputs: [r('scripts/build-coaching-notes.mjs'), join(KB, 'coaching_notes')],
    outputs: [r('src/lib/coachNotesData.generated.js')],
  },
  {
    // Der Plan-Checkout liest und schreibt seinen eigenen Baum (REPO_ROOT = Plan-Wurzel),
    // nicht den von fitness-dev.
    name: 'plan-data',
    script: r('scripts/build-plan-data.mjs'),
    inputs: [r('scripts/build-plan-data.mjs'), join(PLAN, 'scripts'), join(PLAN, 'fitness/catalog/kb/exercises'), join(PLAN, 'fitness/catalog/kb/registry/non_exercises.yml'), join(PLAN, 'src/lib/db/shared/nonExercises.js')],
    outputs: ['exerciseBulkData', 'push', 'pull', 'legs'].map((n) => join(PLAN, `src/lib/db/firestore/${n}.generated.js`)),
  },
];

let stamps = {};
try { stamps = JSON.parse(readFileSync(STAMP_FILE, 'utf8')); } catch { /* kein Stempel: alles läuft */ }

let ran = 0;
let skipped = 0;
for (const step of STEPS) {
  const hash = hashInputs(step.inputs);
  const outputsOk = step.outputs.every(existsSync);
  if (!FORCE && outputsOk && stamps[step.name] === hash) {
    console.log(`kb-data: ${step.name} übersprungen (Eingaben unverändert)`);
    skipped++;
    continue;
  }
  console.log(`kb-data: ${step.name} läuft${FORCE ? ' (--force)' : outputsOk ? ' (Eingaben geändert)' : ' (Ausgabe fehlt)'}`);
  const status = spawnSync(process.execPath, [step.script], { stdio: 'inherit' }).status ?? 1;
  if (status !== 0) process.exit(status);
  stamps[step.name] = hash;
  mkdirSync(dirname(STAMP_FILE), { recursive: true });
  writeFileSync(STAMP_FILE, JSON.stringify(stamps, null, 2) + '\n');
  ran++;
}
console.log(`kb-data: ${ran} gelaufen, ${skipped} übersprungen`);
