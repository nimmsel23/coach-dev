// Baut (und deployt optional) eine Solo-Mini-App aus fitness-dev.
//   node scripts/build-miniapp.mjs <id> [--deploy]      <id> = Eintrag in scripts/miniapps.json
// Ablauf wie früher build:training/build:atlas: KB-Daten (gestempelt) -> vite build --mode <id>
// -> SW versionieren -> stampen (Manifest/Icons/Splash) -> Snapshot. --deploy: firebase deploy --only hosting:<id>.
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const { apps } = JSON.parse(readFileSync(resolve(root, 'scripts/miniapps.json'), 'utf8'))
const id = process.argv[2]
const deploy = process.argv.includes('--deploy')
const app = apps.find((a) => a.id === id)
if (!app) {
  console.error(`build-miniapp: unbekannte App "${id}". Gültig: ${apps.map((a) => a.id).join(', ')}`)
  process.exit(1)
}

const out = `dist-${id}`
const q = (s) => JSON.stringify(s)
const steps = [
  'pnpm run build:kb-data',
  `vite build --mode ${id} --outDir ${out}`,
  `node scripts/mini-app-shell/cli.mjs sw ${out} --app fitness`,
  `node scripts/stamp-training.mjs ${out} ${q(app.name)} ${q(app.short)} ${q(app.start)} ${q(app.description)}`,
  `node scripts/snapshot.mjs ${out}`,
]
if (deploy) steps.push(`firebase deploy --only hosting:${id}`)

for (const cmd of steps) {
  console.log(`\n▶ [${id}] ${cmd}`)
  const r = spawnSync(cmd, {
    cwd: root,
    shell: true,
    stdio: 'inherit',
    env: { ...process.env, VITE_SOLO_TAB: app.tab },
  })
  if (r.status !== 0) {
    console.error(`❌ build-miniapp ${id}: Schritt fehlgeschlagen: ${cmd}`)
    process.exit(r.status || 1)
  }
}
console.log(`\n✅ ${id} -> ${out}${deploy ? ` deployt (${app.site}.web.app)` : ''}`)
