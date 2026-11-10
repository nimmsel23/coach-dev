#!/usr/bin/env node
/* eslint-env node */
// Vite 8 / Rolldown hängt an jeden __VITE_PRELOAD__-Marker einen 32-hex-Hash
// (__VITE_PRELOAD__<hash>). vite:build-import-analysis ersetzt nur den Prefix
// "__VITE_PRELOAD__" und lässt den Hash als bare Identifier stehen →
// SyntaxError "identifier starts immediately after numeric literal".
// Dieses Skript entfernt Rest-Hashes nach dem Vite-Build (Safety-Net).
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

const outDir = resolve(process.argv[2] || 'dist-coach')
const assetsDir = join(outDir, 'assets')
if (!existsSync(assetsDir)) {
  console.error(`fix-vite-preload-markers: ${assetsDir} fehlt`)
  process.exit(1)
}

const AFTER_MAPDEPS = /(__vite__mapDeps\(\[[\d,]*\]\))[0-9a-f]{32}/g
const RAW_MARKER = /__VITE_PRELOAD__[0-9a-f]{32}/g

let files = 0
let hits = 0
for (const name of readdirSync(assetsDir)) {
  if (!name.endsWith('.js')) continue
  const path = join(assetsDir, name)
  const code = readFileSync(path, 'utf8')
  let n = 0
  const next = code
    .replace(AFTER_MAPDEPS, (_, keep) => {
      n += 1
      return keep
    })
    .replace(RAW_MARKER, () => {
      n += 1
      return '__VITE_PRELOAD__'
    })
  if (n === 0) continue
  writeFileSync(path, next)
  files += 1
  hits += n
  console.log(`fix-vite-preload-markers: ${name} (${n})`)
}
console.log(`fix-vite-preload-markers: ${hits} Stellen in ${files} Dateien unter ${assetsDir}`)
