// Nach `vite build --mode training|atlas`: macht aus dist-<mode>/ eine eigene
// installierbare App (eigener Name/Start-URL), getrennt von der Haupt-App.
// Aufruf: node scripts/stamp-training.mjs <outDir> ["Name" "Kurzname" "/#start" "Beschreibung"]
// public/manifest.json bleibt unberührt — nur der Build-Output wird umgeschrieben.
// Manifest/Titel/Icons/Splash macht @vos/mini-app-shell (scripts/mini-app-shell/); der SW bleibt der
// der Haupt-App (Push, Workout-Notifications) und wird von `mini-app-shell sw` (scripts/mini-app-shell/cli.mjs) versioniert.
import { existsSync, readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { stampApp } from './mini-app-shell/stamp.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = resolve(root, process.argv[2] || 'dist-training')
const [
  ,
  ,
  ,
  NAME = 'VitalOS Training',
  SHORT = 'Training',
  START = '/#session',
  DESC = 'Krafttraining loggen — Session-Tab als eigene App',
] = process.argv
const ACCENTS = Object.fromEntries(
  JSON.parse(readFileSync(resolve(root, 'scripts/miniapps.json'), 'utf8')).apps.map((a) => [a.id, a.accent]),
)

if (!existsSync(resolve(outDir, 'manifest.json'))) {
  console.error(`❌ ${resolve(outDir, 'manifest.json')} nicht gefunden — erst "vite build --mode training"`)
  process.exit(1)
}

// <mode> kommt aus dem Ordnernamen dist-<mode>; Icons: solo-icons/<mode>/ (scripts/solo-icons.py)
const mode = outDir
  .split('/')
  .pop()
  .replace(/^dist-/, '')
stampApp({
  outDir,
  root,
  app: {
    id: mode,
    name: NAME,
    short: SHORT,
    description: DESC,
    start: START,
    scope: process.env.MINIAPP_SCOPE || '/', // gemeinsame Origin: "/<id>/" (scripts/build-miniapps-origin.mjs)
    accent: ACCENTS[mode] || '#e8a020',
    iconDir: `solo-icons/${mode}`,
    sw: { mode: 'keep' },
  },
})
