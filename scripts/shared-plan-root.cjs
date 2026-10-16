const { existsSync } = require('node:fs');
const { resolve } = require('node:path');

function sharedPlanRoot() {
  const root = resolve(__dirname, '..');
  const candidates = ['../plan-app', '../plan-dev', '.shared/plan'].map((path) => resolve(root, path));
  const found = candidates.find((path) => existsSync(resolve(path, 'src/views/Plan/CoachWorkspace.jsx')));
  if (!found) throw new Error('Shared Plan workflow missing. Initialize vitalos/plan-app or check out plan-dev at .shared/plan (see docs/COACH-PLAN-WORKFLOW.md).');
  return found;
}
module.exports = { sharedPlanRoot };
