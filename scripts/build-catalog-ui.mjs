// Build the existing Catalog UI into Coach's output directory; do not mutate its source.
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
const root = fileURLToPath(new URL('../', import.meta.url))
const sources = process.env.COACH_CATALOG_SOURCE
  ? [resolve(process.env.COACH_CATALOG_SOURCE)]
  : [resolve(root, 'catalog-ui'), resolve(root, 'vitalos/fitness-app/catalog-ui'), resolve(root, '../fitness-dev/catalog-ui')]
const source = sources.find(path => existsSync(resolve(path, 'src/App.jsx')))
if (!source) throw new Error('Catalog UI source missing. Set COACH_CATALOG_SOURCE to the existing catalog-ui checkout.')
const vite = resolve(source, 'node_modules/vite/bin/vite.js')
if (!existsSync(vite)) throw new Error(`Install dependencies in ${source} first.`)
const result = spawnSync(process.execPath, [vite, 'build', '--outDir', resolve(root, 'dist-catalog'), '--emptyOutDir'], {cwd: source, stdio: 'inherit'})
process.exit(result.status ?? 1)
