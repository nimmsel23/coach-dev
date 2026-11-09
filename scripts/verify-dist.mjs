#!/usr/bin/env node
// Smoke-Test für ein Build-Verzeichnis: Pflichtdateien vorhanden und kein HTML-Fallback.
// Fängt den Fall ab, dass ein fehlender Service Worker von der SPA-Rewrite (** -> index.html) als HTML ausgeliefert wird.
// Aufruf: node scripts/verify-dist.mjs <dist-dir>
import fs from 'node:fs'
import path from 'node:path'

const dir = process.argv[2] || 'dist'
const must = [
  ['index.html', 'html'],
  ['manifest.json', 'json'],
  ['sw.js', 'js'],
  ['fitness-messaging-sw.js', 'js'],
]
const errors = []
for (const [name, kind] of must) {
  const f = path.join(dir, name)
  if (!fs.existsSync(f)) {
    errors.push(`fehlt: ${name}`)
    continue
  }
  const txt = fs.readFileSync(f, 'utf8')
  if (!txt.trim()) {
    errors.push(`leer: ${name}`)
    continue
  }
  if (kind !== 'html' && /^\s*<(!doctype|html)/i.test(txt)) errors.push(`HTML statt ${kind}: ${name}`)
  if (kind === 'json') {
    try {
      JSON.parse(txt)
    } catch {
      errors.push(`kein gültiges JSON: ${name}`)
    }
  }
}
if (errors.length) {
  console.error(`❌ verify-dist (${dir}):\n  - ${errors.join('\n  - ')}`)
  process.exit(1)
}
console.log(`✅ verify-dist (${dir}): ${must.length} Pflichtdateien OK`)
