const { existsSync } = require('node:fs');
const { resolve } = require('node:path');
function sharedPlanRoot() {
  const root = resolve(__dirname, '../modules/plan');
  if (!existsSync(resolve(root, 'src/views/Plan/ProgramEditor.jsx'))) throw new Error('Pinned Plan source missing. Run git submodule update --init modules/plan.');
  return root;
}
module.exports = { sharedPlanRoot };
