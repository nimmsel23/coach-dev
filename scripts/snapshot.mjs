import { cpSync, mkdirSync, readdirSync, rmSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

// Snapshots sind Rollback-Sicherungen des letzten Builds. Ohne Retention
// waechst dist-versions/ bei jedem Build um einen kompletten dist (~2-3 MB
// komprimiert, unkomprimiert deutlich mehr) und muellt die Platte zu.
const KEEP = 3

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const srcName = process.argv[2]
const src = resolve(root, srcName)
const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const versionsDir = resolve(root, 'dist-versions')
const dest = resolve(versionsDir, `${srcName}_${ts}`)

mkdirSync(dest, { recursive: true })
cpSync(src, dest, { recursive: true })
console.log(`snapshot → dist-versions/${srcName}_${ts}`)

// Alte Snapshots desselben Targets loeschen, nur die neuesten KEEP behalten.
const snapshots = readdirSync(versionsDir)
  .filter((name) => name.startsWith(`${srcName}_`))
  .sort()
for (const name of snapshots.slice(0, Math.max(0, snapshots.length - KEEP))) {
  rmSync(resolve(versionsDir, name), { recursive: true, force: true })
  console.log(`pruned  dist-versions/${name}`)
}
