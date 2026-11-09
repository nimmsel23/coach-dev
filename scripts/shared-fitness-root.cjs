// fitness-dev liefert, was plan-dev nicht selbst hält (Overlay in modules/plan/vite-fitness-overlay.mjs).
// FITNESS_ROOT überschreibt die Nachbar-Suche (~/dev/fitness-dev bzw. ~/vitalos/fitness-app; in der CI
// der Checkout nach .fitness-dev, Stand aus modules/plan/fitness.ref).
const { existsSync } = require('node:fs')
const { resolve } = require('node:path')
function sharedFitnessRoot() {
  if (process.env.FITNESS_ROOT) return resolve(process.env.FITNESS_ROOT)
  for (const parent of ['..', '../..', '../../..']) {
    for (const name of ['fitness-app', 'fitness-dev']) {
      const candidate = resolve(__dirname, '..', parent, name)
      if (existsSync(resolve(candidate, 'src'))) return candidate
    }
  }
  throw new Error('fitness-dev nicht gefunden. FITNESS_ROOT setzen oder ../fitness-dev auschecken.')
}
module.exports = { sharedFitnessRoot }
