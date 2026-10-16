import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { sharedPlanRoot } from './shared-plan.mjs';

// Use the source owner's existing generator, never a second exercise import.
const root = sharedPlanRoot();
const result = spawnSync(process.execPath, [resolve(root, 'scripts/build-exercise-bulk-data.mjs')], { cwd: root, stdio: 'inherit' });
if (result.status !== 0) process.exit(result.status ?? 1);
