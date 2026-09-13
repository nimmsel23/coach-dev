#!/usr/bin/env node
/* eslint-env node */
// Dünner Wrapper um die beiden Exercise-KB-Build-Skripte
// (build-exercise-bulk-data.mjs + build-ppl-data.mjs) — beide lesen aus
// fitness/catalog/kb/exercises/ und erzeugen src/lib/db/firestore/*.generated.js,
// laufen aber unabhängig voneinander (kein gemeinsamer State). Ein npm-Command
// dafür statt zwei einzelner `&&`-verketteter Aufrufe in build:kb-data.
// Einzeln bleiben sie über `build:bulk-data`/`build:ppl-data` weiter aufrufbar.
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const STEPS = ['build-exercise-bulk-data.mjs', 'build-ppl-data.mjs'];

for (const step of STEPS) {
  const result = spawnSync(process.execPath, [join(__dirname, step)], { stdio: 'inherit' });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
