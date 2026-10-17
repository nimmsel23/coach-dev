#!/usr/bin/env node
// vos-mini-app stamp <outDir> --app <id> [--config mini-app.json]
//
// mini-app.json (im Repo-Root der App):
//   { "apps": { "plan": { "name": "VitalOS Plan", "short": "Plan", "accent": "#5b8cff",
//       "iconDir": "solo-icons/plan", "start": "./", "sw": { "api": { "swr": ["/plan/today"] } }, "register": true } } }
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { stampApp, stampSw, stampSplash } from "./stamp.mjs";
import { runParity } from "./parity.mjs";

// Consumer-Repos bauen standalone (GitHub Actions, ohne vitalos) → das Paket wird in sie kopiert.
// vendor <zielordner>          kopiert die Paketdateien (Ziel z. B. scripts/mini-app-shell)
// vendor <zielordner> --check  Exit 1, wenn die Kopie vom Paket abweicht (Drift)
const VENDOR_FILES = ["package.json", "index.mjs", "splash.mjs", "register.mjs", "sw.mjs", "sw-template.js", "stamp.mjs", "parity.mjs", "cli.mjs", "extras/workout-notifications.js"];

function vendor(target, check) {
  const here = dirname(fileURLToPath(import.meta.url));
  const dst = resolve(target);
  const drift = [];
  for (const f of VENDOR_FILES) {
    const a = readFileSync(resolve(here, f), "utf8");
    const b = existsSync(resolve(dst, f)) ? readFileSync(resolve(dst, f), "utf8") : null;
    if (a !== b) drift.push(f);
    if (!check && a !== b) { mkdirSync(dirname(resolve(dst, f)), { recursive: true }); copyFileSync(resolve(here, f), resolve(dst, f)); }
  }
  if (check) {
    if (drift.length) { console.error(`❌ ${dst} weicht vom Paket ab: ${drift.join(", ")} — "vendor ${target}" neu ausführen`); process.exit(1); }
    console.log(`✅ ${dst} entspricht dem Paket`);
    return;
  }
  writeFileSync(resolve(dst, "VENDORED.md"), "GENERIERT aus ~/vitalos/packages/mini-app-shell (@vos/mini-app-shell) — nicht hier editieren.\nAktualisieren: node ~/vitalos/packages/mini-app-shell/cli.mjs vendor <dieser-ordner>\nDrift prüfen:  ... vendor <dieser-ordner> --check\n");
  console.log(`📦 ${drift.length ? `${drift.length} Datei(en) aktualisiert` : "bereits aktuell"}: ${dst}`);
}

async function main(argv) {
  if (argv[0] === "vendor" && argv[1]) return vendor(argv[1], argv.includes("--check"));
  if (argv[0] === "parity") {
    const a = (k) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : undefined);
    if (!a("app") || !a("old")) { console.error("Aufruf: vos-mini-app parity --app <id> --old <alter-sw.js> [--ignore Navigation,POST] [--config mini-app.json]"); process.exit(1); }
    const cfgPath = resolve(a("config") || "mini-app.json");
    const { failures } = await runParity({ root: dirname(cfgPath), appName: a("app"), oldPath: a("old"), configPath: cfgPath.split("/").pop(), ignore: (a("ignore") || "").split(",").filter(Boolean) });
    process.exit(failures ? 1 : 0);
  }
  const [cmd, outDir, ...rest] = argv;
  const arg = (k) => (rest.includes(`--${k}`) ? rest[rest.indexOf(`--${k}`) + 1] : undefined);
  if (!["stamp", "sw", "splash"].includes(cmd) || !outDir || !arg("app")) {
    console.error("Aufruf: vos-mini-app stamp|sw|splash <outDir> --app <id> [--config mini-app.json]   (sw = nur Service Worker + Manifest-Version, splash = nur Splash)\n       vos-mini-app vendor <zielordner> [--check]\n       vos-mini-app parity --app <id> --old <alter-sw.js> [--ignore a,b]");
    process.exit(1);
  }
  const cfgPath = resolve(arg("config") || "mini-app.json");
  const cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
  const app = cfg.apps?.[arg("app")];
  if (!app) {
    console.error(`❌ App "${arg("app")}" fehlt in ${cfgPath} (vorhanden: ${Object.keys(cfg.apps || {}).join(", ") || "—"})`);
    process.exit(1);
  }
  const full = { id: arg("app"), ...cfg.defaults, ...app };
  ({ sw: stampSw, splash: stampSplash }[cmd] || stampApp)({ outDir, app: full, root: dirname(cfgPath) });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
