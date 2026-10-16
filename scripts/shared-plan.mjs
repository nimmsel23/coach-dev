import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export function sharedPlanRoot() {
  const candidates = ['../plan-app', '../plan-dev', '.shared/plan'].map((path) => resolve(root, path));
  const found = candidates.find((path) => existsSync(resolve(path, 'src/views/Plan/CoachWorkspace.jsx')));
  if (!found) throw new Error('Shared Plan workflow missing. Initialize vitalos/plan-app or check out plan-dev at .shared/plan (see docs/COACH-PLAN-WORKFLOW.md).');
  return found;
}
