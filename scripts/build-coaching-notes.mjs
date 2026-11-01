#!/usr/bin/env node
/* eslint-env node */
// Generiert src/lib/coachNotesData.generated.js aus
// fitness/catalog/kb/coaching_notes/ (SSOT) — analoges Muster zu
// build-sixpack-data.mjs: Coaching-Notes ändern sich selten (Coach schreibt
// gelegentlich einen neuen "WhatsApp Wisdom Drop"), brauchen aber weder
// Firestore-Sync noch eine Live-API-Abhängigkeit im Firebase-Build. Läuft
// vor jedem Dev-Start und Build (predev/prebuild → build:kb-data).
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as yaml from 'js-yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const NOTES_DIR = join(REPO_ROOT, 'fitness/catalog/kb/coaching_notes');
const OUT_FILE = join(REPO_ROOT, 'src/lib/coachNotesData.generated.js');

function loadYaml(path) {
  return yaml.load(readFileSync(path, 'utf-8'));
}

const files = existsSync(NOTES_DIR)
  ? readdirSync(NOTES_DIR).filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'))
  : [];

const notes = files
  .map((file) => loadYaml(join(NOTES_DIR, file)))
  .filter((doc) => doc && doc.id)
  .sort((a, b) => String(a.id).localeCompare(String(b.id)));

const banner = `// AUTO-GENERATED — nicht manuell editieren.
// Quelle: fitness/catalog/kb/coaching_notes/ (SSOT).
// Neu erzeugen: npm run build:coaching-notes (läuft automatisch vor dev/build).
`;

const out = `${banner}
export const COACHING_NOTES = ${JSON.stringify(notes, null, 2)};
`;

writeFileSync(OUT_FILE, out);
console.log(`coachNotesData.generated.js geschrieben: ${notes.length} Coaching Notes.`);
