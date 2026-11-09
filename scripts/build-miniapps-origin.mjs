// Variante "gemeinsame Origin": alle Solo-Mini-Apps als Unterpfade EINER Hosting-Site (z. B. fitness-vos.web.app/<id>/),
// statt je einer eigenen Site. Cache/IndexedDB/Login sind dann mit der Haupt-App der Origin geteilt.
//
//   node scripts/build-miniapps-origin.mjs [id …]      ohne id: alle aus scripts/miniapps.json
//
// Ergebnis: dist-origin/<id>/ je App (eigener SW mit Scope /<id>/, Manifest scope+start_url /<id>/) und
// dist-origin/_hosting-rewrites.json (Rewrites für die Ziel-Site, VOR dem "**"-Catch-all einfügen).
// Die Ziel-Site übernimmt dist-origin/* in ihr Hosting-Verzeichnis (siehe docs/MINI-APPS.md, Abschnitt Variante B).
//
// Gegenüber build-miniapp.mjs: ausser vite --mode <id> nur zwei Unterschiede,
//   1. das inline `register('/sw.js')` der index.html wird `register('./sw.js')` (sonst registriert die App den SW der Origin-Wurzel),
//   2. Manifest scope und start_url hängen unter /<id>/ (MINIAPP_SCOPE für stamp-training.mjs).
// Der SW-Generator ermittelt seinen Präfix selbst aus registration.scope (sw-template.js: BASE), alle Assets sind relativ (base './').
import { readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const { apps } = JSON.parse(readFileSync(resolve(root, 'scripts/miniapps.json'), 'utf8'))
const wanted = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const list = wanted.length
  ? wanted.map((id) => apps.find((a) => a.id === id) || (console.error(`unbekannte App: ${id}`), process.exit(1)))
  : apps

const q = (s) => JSON.stringify(s)
const run = (cmd, env = {}) => {
  console.log(`\n▶ ${cmd}`)
  const r = spawnSync(cmd, { cwd: root, shell: true, stdio: 'inherit', env: { ...process.env, ...env } })
  if (r.status !== 0) {
    console.error(`❌ fehlgeschlagen: ${cmd}`)
    process.exit(r.status || 1)
  }
}

rmSync(resolve(root, 'dist-origin'), { recursive: true, force: true })
mkdirSync(resolve(root, 'dist-origin'), { recursive: true })
run('pnpm run build:kb-data')

for (const app of list) {
  const out = `dist-origin/${app.id}`
  const scope = `/${app.id}/`
  // start aus der Tabelle ("/#session/logbuch") -> "/<id>/#session/logbuch"
  const start = scope + app.start.replace(/^\//, '')
  run(`vite build --mode ${app.id} --outDir ${out}`, { VITE_SOLO_TAB: app.tab })
  const htmlPath = resolve(root, out, 'index.html')
  const html = readFileSync(htmlPath, 'utf8')
  if (!html.includes("register('/sw.js')")) {
    console.error(`❌ ${app.id}: register('/sw.js') nicht in index.html gefunden — Patch nötig`)
    process.exit(1)
  }
  writeFileSync(htmlPath, html.replace("register('/sw.js')", "register('./sw.js')"))
  // Eigener Cache-Präfix je App: Der SW räumt in activate alle Caches mit seinem Präfix ab, die er nicht kennt. Teilten sich
  // Haupt-App ("fitness-") und Unterpfad-Apps den Präfix, löschten sie einander die Shell-Caches (Offline kaputt).
  // "vos-<id>-" beginnt nicht mit "fitness-"; dataCache ebenfalls je App (Quota/Versionierung getrennt).
  const cfg = JSON.parse(readFileSync(resolve(root, 'mini-app.json'), 'utf8'))
  cfg.apps.fitness.sw = { ...cfg.apps.fitness.sw, prefix: `vos-${app.id}-` }
  const cfgPath = `dist-origin/_cfg-${app.id}.json`
  writeFileSync(resolve(root, cfgPath), JSON.stringify(cfg))
  run(`node scripts/mini-app-shell/cli.mjs sw ${out} --app fitness --config ${cfgPath}`)
  run(`node scripts/stamp-training.mjs ${out} ${q(app.name)} ${q(app.short)} ${q(start)} ${q(app.description)}`, {
    MINIAPP_SCOPE: scope,
  })
}

const rewrites = list.map((a) => ({ source: `/${a.id}/**`, destination: `/${a.id}/index.html` }))
writeFileSync(resolve(root, 'dist-origin/_hosting-rewrites.json'), JSON.stringify(rewrites, null, 2) + '\n')
console.log(`\n✅ dist-origin/: ${list.map((a) => a.id).join(', ')} (+ _hosting-rewrites.json)`)
