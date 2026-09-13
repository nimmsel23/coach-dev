#!/usr/bin/env node
/* eslint-env node */
// Generiert push.generated.js / pull.generated.js / legs.generated.js aus den
// expert-approved Exercises (kb/exercises/**/*.yml, ohne unreviewed_wger.yml/
// unreviewed_yuhonas.yml) — Muster wie build-exercise-bulk-data.mjs, siehe
// fitness/catalog/kb/AGENTS.md. "expert" wird hier wie im Python-Resolver
// (resolver.py::build_exercise_index) rein über die Datei-Herkunft vergeben
// (jede Datei in kb/exercises/ außer den beiden unreviewed_*.yml-Dumps zählt
// als approved) — keine wger/yuhonas-Merge-Logik nötig, weil approved Files
// bereits fertige Einzel-Records sind, kein Cross-Referencing über mehrere
// Quellen wie beim Bulk-Import.
import { readFileSync, readdirSync, writeFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const EXERCISES_DIR = join(REPO_ROOT, 'fitness/catalog/kb/exercises');
const OUT_DIR = join(REPO_ROOT, 'src/lib/db/firestore');

const UNREVIEWED_FILES = new Set(['unreviewed_wger.yml', 'unreviewed_yuhonas.yml']);

// Kategorie -> Split-Bucket. Alles andere (core, strength, stretching, ...)
// gehört zu keinem der drei Split-Tage und wird ausgelassen.
const CATEGORY_TO_BUCKET = {
  push: 'push',
  pull: 'pull',
  squat: 'legs',
  lunge: 'legs',
  legs: 'legs',
};

const EXPORT_FIELDS = [
  'exercise_id', 'id', 'display_name', 'name', 'german', 'english', 'category',
  'movement_pattern', 'movements', 'equipment', 'primary_muscles',
  'secondary_muscles', 'stabilizers', 'tags', 'wger_id', 'yuhonas_id',
];

function walkYamlFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out.push(...walkYamlFiles(full));
    } else if (entry.endsWith('.yml') && !UNREVIEWED_FILES.has(entry)) {
      out.push(full);
    }
  }
  return out;
}

function loadYaml(path) {
  try {
    return yaml.load(readFileSync(path, 'utf-8'));
  } catch (err) {
    console.warn(`build-ppl-data: übersprungen (${relative(REPO_ROOT, path)}): ${err.message}`);
    return null;
  }
}

function slim(exercise) {
  const out = {};
  for (const field of EXPORT_FIELDS) {
    const value = exercise[field];
    if (value !== undefined && value !== null && value !== '' &&
        !(Array.isArray(value) && value.length === 0)) {
      out[field] = value;
    }
  }
  out.id = exercise.exercise_id || exercise.id;
  return out;
}

const buckets = { push: new Map(), pull: new Map(), legs: new Map() };

for (const file of walkYamlFiles(EXERCISES_DIR)) {
  const doc = loadYaml(file);
  const exercises = doc?.exercises;
  if (!Array.isArray(exercises)) continue;
  for (const ex of exercises) {
    if (!ex || (!ex.exercise_id && !ex.id)) continue;
    const bucket = CATEGORY_TO_BUCKET[String(ex.category || '').trim().toLowerCase()];
    if (!bucket) continue;
    const id = ex.exercise_id || ex.id;
    if (buckets[bucket].has(id)) continue; // erste Fundstelle gewinnt
    buckets[bucket].set(id, slim(ex));
  }
}

const banner = `// AUTO-GENERATED — nicht manuell editieren.
// Quelle: fitness/catalog/kb/exercises/**/*.yml (expert-approved, alles außer
// unreviewed_wger.yml/unreviewed_yuhonas.yml), gruppiert nach category.
// Neu erzeugen: npm run build:ppl-data (läuft automatisch via build:kb-data).
`;

function writeBucket(name, exportName) {
  const list = [...buckets[name].values()].sort(
    (a, b) => (a.display_name || a.id).localeCompare(b.display_name || b.id),
  );
  const outFile = join(OUT_DIR, `${name}.generated.js`);
  const out = `${banner}
export const ${exportName} = ${JSON.stringify(list, null, 2)};

export default ${exportName};
`;
  writeFileSync(outFile, out);
  console.log(`${relative(REPO_ROOT, outFile)} geschrieben: ${list.length} Übungen.`);
}

writeBucket('push', 'PUSH_EXERCISES');
writeBucket('pull', 'PULL_EXERCISES');
writeBucket('legs', 'LEGS_EXERCISES');
