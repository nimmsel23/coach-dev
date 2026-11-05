#!/usr/bin/env node
// vos-portal — Registry + HTML-Portal der VitalOS-Mini-Apps. Keine Abhängigkeiten, nur lesen/schreiben von docs/ bzw. portal/.
//
//   node scripts/vos-portal.mjs                  Repo = aktuelles Verzeichnis: schreibt docs/apps.json + docs/apps.html
//   node scripts/vos-portal.mjs --repo <dir>     dasselbe für ein anderes Repo
//   node scripts/vos-portal.mjs --all [<root>]   alle Repos aus portal/repos.json (Standard-Root ~/dev): je Repo docs/apps.*,
//                                                dazu portal/registry.json + portal/index.html (Meta-Repo)
//   --check                                      schreibt nichts, Exit 1 wenn eine Datei veraltet wäre (für CI)
//
// Quellen je Repo (nichts wird doppelt gepflegt):
//   scripts/miniapps.json  Solo-Apps: id, site, (target)       → Mehr-App-Repos wie fitness-dev, fuel-dev
//   mini-app.json          apps.<id>: name, short, description, accent
//   .firebaserc            hosting-Targets → Site-Namen (Haupt-App und Einzel-App-Repos)
//   firebase.json          Fallback, wenn .firebaserc keine Targets hat (target = Site)
// Die Kopie dieses Skripts in jedem Repo heißt scripts/portal.mjs (Quelle: ~/vitalos/scripts/vos-portal.mjs).

import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const val = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const CHECK = flag("--check");
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const url = (site) => `https://${site}.web.app`;
let stale = 0;

function write(file, content) {
  const old = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
  if (old === content) return;
  if (CHECK) { stale++; console.error(`veraltet: ${file}`); return; }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  console.log(`geschrieben: ${file}`);
}

// ---- Repo einlesen -------------------------------------------------------------------------------------------------
export function scanRepo(dir) {
  const repo = path.basename(path.resolve(dir));
  const solo = readJson(path.join(dir, "scripts/miniapps.json"))?.apps ?? [];
  const meta = readJson(path.join(dir, "mini-app.json"))?.apps ?? {};
  const rc = readJson(path.join(dir, ".firebaserc"));
  const rcTargets = Object.values(rc?.targets ?? {})[0]?.hosting ?? {}; // { target: [site] }
  const fb = readJson(path.join(dir, "firebase.json"))?.hosting;
  const fbList = Array.isArray(fb) ? fb : fb ? [fb] : [];
  const fbSites = fbList.map((h) => h.site || h.target).filter(Boolean);

  const entries = [];
  const soloTargets = new Set();
  for (const a of solo) {
    soloTargets.add(a.target ?? a.id);
    const m = { ...(meta[a.id] ?? {}), ...Object.fromEntries(["name", "short", "description", "accent"].filter((k) => a[k]).map((k) => [k, a[k]])) };
    entries.push({
      id: a.id, kind: "solo", name: m.name ?? a.id, short: m.short ?? m.name ?? a.id,
      description: m.description ?? "", accent: m.accent ?? "#888",
      site: a.site, url: url(a.site), tab: a.tab ?? null,
    });
  }
  // Haupt-App(s): alle übrigen Hosting-Targets (bzw. firebase.json-Sites), die keine Solo-App sind
  const mainSites = Object.entries(rcTargets).filter(([t]) => !soloTargets.has(t)).flatMap(([t, sites]) => sites.map((s) => [t, s]));
  if (!mainSites.length) for (const s of fbSites) if (!entries.some((e) => e.site === s)) mainSites.push([s, s]);
  for (const [t, site] of mainSites) {
    const m = meta[t] ?? meta[repo.replace(/-dev$/, "")] ?? Object.values(meta).find((x) => !x.id || x.id === t) ?? {};
    entries.unshift({
      id: t, kind: "main", name: m.name ?? site, short: m.short ?? m.name ?? site,
      description: m.description ?? "", accent: m.accent ?? "#888", site, url: url(site), tab: null,
    });
  }
  return { repo, apps: entries };
}

// ---- HTML ----------------------------------------------------------------------------------------------------------
const CSS = `
:root{--bg:#0b0d12;--fg:#e8eaf0;--mut:#8b93a7;--card:#141822;--line:#232a3a}
@media(prefers-color-scheme:light){:root{--bg:#f5f6fa;--fg:#161a24;--mut:#5d667a;--card:#fff;--line:#dde1ea}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,sans-serif;padding:24px 16px 48px}
main{max-width:1000px;margin:0 auto}h1{font-size:22px;margin:0 0 4px}h2{font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:var(--mut);margin:28px 0 10px}
p.sub{color:var(--mut);margin:0 0 16px}input{width:100%;padding:10px 12px;border-radius:10px;border:1px solid var(--line);background:var(--card);color:var(--fg);font:inherit}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:10px}
a.card{display:block;text-decoration:none;color:inherit;background:var(--card);border:1px solid var(--line);border-left:4px solid var(--accent);border-radius:12px;padding:12px 14px}
a.card:hover{border-color:var(--accent)}b{display:block}small{color:var(--mut);display:block}.tag{display:inline-block;font-size:11px;color:var(--mut);border:1px solid var(--line);border-radius:6px;padding:0 6px;margin-top:6px}
.hide{display:none}`;

function card(a, withRepo) {
  return `<a class="card" style="--accent:${esc(a.accent)}" href="${esc(a.url)}" target="_blank" rel="noopener" data-q="${esc((a.name + " " + a.description + " " + a.site + " " + (a.repo ?? "")).toLowerCase())}">
  <b>${esc(a.name)}</b><small>${esc(a.description || "–")}</small>
  <span class="tag">${esc(a.site)}</span>${a.kind === "main" ? ' <span class="tag">Haupt-App</span>' : ""}${a.tab ? ` <span class="tag">Tab ${esc(a.tab)}</span>` : ""}${withRepo ? ` <span class="tag">${esc(a.repo)}</span>` : ""}
</a>`;
}

const SEARCH = `<script>const q=document.getElementById("q");q&&q.addEventListener("input",()=>{const v=q.value.toLowerCase();document.querySelectorAll("a.card").forEach(c=>c.classList.toggle("hide",!c.dataset.q.includes(v)));document.querySelectorAll("section").forEach(s=>s.classList.toggle("hide",!s.querySelector("a.card:not(.hide)")))})</script>`;

function page(title, sub, sections, withRepo) {
  const body = sections.map((s) => `<section><h2>${esc(s.title)}</h2><div class="grid">${s.apps.map((a) => card(a, withRepo)).join("\n")}</div></section>`).join("\n");
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><style>${CSS}</style></head><body><main>
<h1>${esc(title)}</h1><p class="sub">${esc(sub)}</p><input id="q" type="search" placeholder="Suchen …" autocomplete="off">
${body}
</main>${SEARCH}</body></html>
`;
}

// ---- Ausgabe -------------------------------------------------------------------------------------------------------
function emitRepo(dir) {
  const r = scanRepo(dir);
  write(path.join(dir, "docs/apps.json"), JSON.stringify(r, null, 2) + "\n");
  const main = r.apps.filter((a) => a.kind === "main"), solo = r.apps.filter((a) => a.kind === "solo");
  const sections = [main.length && { title: "Haupt-App", apps: main }, solo.length && { title: "Mini-Apps", apps: solo }].filter(Boolean);
  write(path.join(dir, "docs/apps.html"), page(`${r.repo} — Apps`, `${r.apps.length} Apps, erzeugt aus mini-app.json, scripts/miniapps.json und .firebaserc. Nicht von Hand ändern.`, sections));
  return r;
}

if (flag("--all")) {
  const meta = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
  const root = args[args.indexOf("--all") + 1]?.startsWith("--") || !args[args.indexOf("--all") + 1] ? path.join(os.homedir(), "dev") : args[args.indexOf("--all") + 1];
  const repos = readJson(path.join(meta, "portal/repos.json")) ?? [];
  const all = [];
  for (const name of repos) {
    const dir = path.join(root, name);
    if (!fs.existsSync(dir)) { console.error(`übersprungen (fehlt): ${dir}`); continue; }
    const r = emitRepo(dir);
    all.push({ ...r, apps: r.apps.map((a) => ({ ...a, repo: r.repo })) });
  }
  write(path.join(meta, "portal/registry.json"), JSON.stringify({ repos: all }, null, 2) + "\n");
  const total = all.reduce((n, r) => n + r.apps.length, 0);
  write(path.join(meta, "portal/index.html"), page("VitalOS Portal", `${total} Apps in ${all.length} Repos. Registry: portal/registry.json (erzeugt, nicht von Hand ändern).`, all.map((r) => ({ title: r.repo, apps: r.apps })), false));
} else {
  emitRepo(val("--repo") ?? process.cwd());
}
if (CHECK && stale) process.exit(1);
