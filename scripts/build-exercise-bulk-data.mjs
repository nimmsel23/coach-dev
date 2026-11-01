#!/usr/bin/env node
/* eslint-env node */
// Generiert src/lib/db/firestore/exerciseBulkData.generated.js aus den beiden
// Bulk-KB-Dateien (unreviewed_wger.yml, unreviewed_yuhonas.yml) — diese ändern
// sich praktisch nie (Rohimport aus wger/yuhonas), im Gegensatz zu den
// kuratierten/expert-Übungen, die laufend über Firestore-Approvals dazukommen.
// Die Firebase-PWA (fitness-aos.web.app) musste bisher bei JEDER Suche erst
// die komplette Firestore-Collection (>1700 Docs) laden, nur um an diese
// statischen 1717 Bulk-Einträge zu kommen. Mit diesem Build-Step werden sie
// stattdessen einmalig ins JS-Bundle gebacken; src/lib/db/firestore/kb.js
// holt aus Firestore nur noch den kleinen, aktiv wachsenden Rest (expert +
// inbox). KB-YAMLs bleiben SSOT — dieses Skript ist der einzige Ort, der ihren
// Inhalt in JS dupliziert (gleiches Muster wie build-sixpack-data.mjs).
//
// Wichtige Semantik ab 2026-08-30: Im Client-Bundle sind diese beiden Quellen
// NICHT mehr "unreviewed". "unreviewed" bezeichnet nur noch echte KB-Drafts/
// Review-Kandidaten. Die eingebackenen Bulk-Records behalten ihren Ursprung
// (wger/yuhonas), bekommen aber statt des unreviewed-Tags ein bulk_import-Marker.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as yaml from 'js-yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const EXERCISES_DIR = join(REPO_ROOT, 'fitness/catalog/kb/exercises');
const OUT_FILE = join(REPO_ROOT, 'src/lib/db/firestore/exerciseBulkData.generated.js');

const SOURCE_FILES = ['unreviewed_wger.yml', 'unreviewed_yuhonas.yml'];

function loadYaml(path) {
  return yaml.load(readFileSync(path, 'utf-8'));
}

function normalizeBulkExercise(exercise) {
  const tags = Array.isArray(exercise?.tags) ? exercise.tags : [];
  const nextTags = tags.filter((tag) => tag !== 'unreviewed');
  if (!nextTags.includes('bulk_import')) nextTags.push('bulk_import');
  return {
    ...exercise,
    tags: nextTags,
    review_state: exercise?.review_state?.status === 'draft'
      ? { ...exercise.review_state, status: 'imported' }
      : exercise?.review_state,
  };
}

const exercises = [];
for (const file of SOURCE_FILES) {
  const doc = loadYaml(join(EXERCISES_DIR, file));
  for (const ex of doc?.exercises || []) {
    if (!ex || (!ex.exercise_id && !ex.id)) continue;
    exercises.push(normalizeBulkExercise(ex));
  }
}

const banner = `// AUTO-GENERATED — nicht manuell editieren.
// Quelle: fitness/catalog/kb/exercises/unreviewed_{wger,yuhonas}.yml (SSOT).
// Neu erzeugen: npm run build:bulk-data (läuft automatisch vor dev/build).
`;

const out = `${banner}
export const EXERCISE_BULK_DATA = ${JSON.stringify(exercises, null, 2)};

export default EXERCISE_BULK_DATA;
`;

writeFileSync(OUT_FILE, out);
console.log(`exerciseBulkData.generated.js geschrieben: ${exercises.length} Bulk-Übungen.`);
