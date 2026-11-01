import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
const { sharedPlanRoot } = createRequire(import.meta.url)('./shared-plan-root.cjs');
const root = sharedPlanRoot();
const result = spawnSync(process.execPath, [resolve(root, 'scripts/build-exercise-bulk-data.mjs')], { cwd: root, stdio: 'inherit' });
if (result.status !== 0) process.exit(result.status ?? 1);
