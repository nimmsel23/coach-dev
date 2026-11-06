// Übernimmt dist-origin/<id>/ (scripts/build-miniapps-origin.mjs) in das Hosting-Verzeichnis der Haupt-Site (gleiche Origin):
//   node scripts/merge-origin.mjs [siteDir=dist-firebase] [firebase.json] [hosting-target=client]
// - kopiert jede App nach <siteDir>/<id>/ (bestehende Ordner gleichen Namens werden ersetzt)
// - setzt die Rewrites /<id>/** -> /<id>/index.html VOR den "**"-Catch-all der Site in firebase.json (in-place; Datei ist im CI Wegwerf-Checkout)
// - ergänzt "no-cache" für /<id>/sw.js
import { readFileSync, writeFileSync, cpSync, rmSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';

const root = process.cwd();
const [siteDir = 'dist-firebase', fbFile = 'firebase.json', target = 'client'] = process.argv.slice(2);
const origin = resolve(root, 'dist-origin');
const ids = readdirSync(origin).filter((n) => statSync(join(origin, n)).isDirectory());
if (!ids.length) { console.error('merge-origin: dist-origin/ ist leer (erst build:origin)'); process.exit(1); }

for (const id of ids) {
  rmSync(resolve(root, siteDir, id), { recursive: true, force: true });
  cpSync(join(origin, id), resolve(root, siteDir, id), { recursive: true });
}

const fb = JSON.parse(readFileSync(resolve(root, fbFile), 'utf8'));
const list = Array.isArray(fb.hosting) ? fb.hosting : [fb.hosting];
const site = list.find((h) => (h.target || h.site) === target);
if (!site) { console.error(`merge-origin: Hosting-Target "${target}" nicht in ${fbFile}`); process.exit(1); }
const mine = new Set(ids.map((id) => `/${id}/**`));
const rewrites = (site.rewrites || []).filter((r) => !mine.has(r.source));
const catchAll = rewrites.findIndex((r) => r.source === '**');
const add = ids.map((id) => ({ source: `/${id}/**`, destination: `/${id}/index.html` }));
rewrites.splice(catchAll < 0 ? rewrites.length : catchAll, 0, ...add);
site.rewrites = rewrites;
const swSrc = `/@(${ids.join('|')})/sw.js`;
site.headers = (site.headers || []).filter((h) => h.source !== swSrc);
site.headers.push({ source: swSrc, headers: [{ key: 'Cache-Control', value: 'no-cache' }] });
writeFileSync(resolve(root, fbFile), JSON.stringify(fb, null, 2) + '\n');
console.log(`merge-origin: ${ids.join(', ')} -> ${siteDir}/ (+ Rewrites, sw.js no-cache) in ${fbFile}`);
