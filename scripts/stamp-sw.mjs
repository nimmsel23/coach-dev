// Stempelt eine eindeutige Cache-Busting-Version in den BUILD-OUTPUT
// (dist/ oder dist-firebase/), nie in die getrackte Quelle unter public/.
// Vorher mutierte bump-sw.mjs public/sw.js + public/manifest.json direkt
// (zusätzlich per pre-commit-Hook automatisch bei jedem Commit auf master),
// was nach jedem Deploy einen Extra-Commit für die reine Versionszahl
// erzwang (Merge-Rauschen zwischen dev/master). Ein Zeitstempel macht
// jeden Build automatisch eindeutig — kein persistenter Zähler nötig.
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = resolve(root, process.argv[2] || 'dist-firebase')
const sw = resolve(outDir, 'sw.js')
const manifest = resolve(outDir, 'manifest.json')

const version = Date.now().toString(36) // kompakter, monoton wachsender Stempel

if (existsSync(sw)) {
  const content = readFileSync(sw, 'utf8')
  const stamped = content.replace(/fitness-v0\b/, `fitness-v${version}`)
  writeFileSync(sw, stamped)
  console.log(`🔢 ${outDir}/sw.js: CACHE → fitness-v${version}`)
} else {
  console.log(`⚠️  ${sw} nicht gefunden — skip`)
}

if (existsSync(manifest)) {
  const data = JSON.parse(readFileSync(manifest, 'utf8'))
  data.version = version
  writeFileSync(manifest, JSON.stringify(data, null, 2) + '\n')
  console.log(`🔢 ${outDir}/manifest.json: version → ${version}`)
} else {
  console.log(`⚠️  ${manifest} nicht gefunden — skip`)
}
