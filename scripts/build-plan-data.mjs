#!/usr/bin/env node
// Plan-Übungsdaten generieren: führt plan/scripts/exercise-data.mjs im Plan-Checkout aus.
// Quelle: Nachbar-Checkout (plan-app im vitalos-Workspace, sonst ~/dev/plan-dev), sonst verschachtelter ./plan.
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const planRoot = ['plan-app', 'plan-dev'].map((n) => join(repoRoot, '..', n)).find(existsSync) || join(repoRoot, 'plan');
const script = join(planRoot, 'scripts/exercise-data.mjs');
if (!existsSync(script)) {
  console.error(`build-plan-data: ${script} fehlt (Plan-Checkout nicht gefunden).`);
  process.exit(1);
}
process.exit(spawnSync(process.execPath, [script], { stdio: 'inherit' }).status ?? 1);
