// Macht aus einem Vite-Build-Output (outDir) eine fertige, installierbare Mini-App:
// Icons, Manifest, HTML-Titel/Meta, Splash, Service Worker (+ Register-Snippet).
// Fasst nur den Build-Output an, nie die Quelle unter public/.
import { copyFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { injectSplash } from "./splash.mjs";
import { injectRegister } from "./register.mjs";
import { buildSw, newVersion } from "./sw.mjs";

const ICONS = ["icon-180.png", "icon-192.png", "icon-512.png", "icon-maskable-512.png"];

// app: { id, name, short, accent, description?, start?, scope?, themeColor?, bg?, iconDir?,
//        html? (Default index.html), manifest? (Dateiname, Default manifest.json|manifest.webmanifest),
//        splash?: false | {...}, register?: boolean | { expose: true }, titleSuffix?,
//        sw?: false | { mode:"generate"|"keep", file? (Default sw.js), extras?: [...], extraFile?,
//                       precacheAssets?: bool, ...swConfig } }
export function stampApp({ outDir, app, root = process.cwd(), log = console.log }) {
  const need = ["id", "name", "short", "accent"].filter((k) => !app[k]);
  if (need.length) throw new Error(`mini-app.json: ${need.join(", ")} fehlt`);
  const out = resolve(outDir);
  const version = newVersion();
  const done = [];

  // --- Icons
  const iconDir = app.iconDir ? resolve(root, app.iconDir) : null;
  const hasIcons = !!iconDir && existsSync(resolve(iconDir, "icon-512.png"));
  if (hasIcons) {
    for (const f of ICONS) if (existsSync(resolve(iconDir, f))) copyFileSync(resolve(iconDir, f), resolve(out, f));
    if (existsSync(resolve(iconDir, "icon.svg"))) copyFileSync(resolve(iconDir, "icon.svg"), resolve(out, "favicon.svg"));
    done.push("Icons");
  } else if (app.iconDir) {
    log(`⚠️  ${app.iconDir}/icon-512.png fehlt — vorhandene Icons bleiben`);
  }

  const sw = app.sw === undefined ? { mode: "generate" } : app.sw;
  const genSw = !!sw && sw.mode !== "keep";

  // --- Manifest (manifest.json oder .webmanifest)
  const mfName = [app.manifest, "manifest.json", "manifest.webmanifest"].filter(Boolean).find((n) => existsSync(resolve(out, n)));
  if (mfName) {
    const p = resolve(out, mfName);
    const m = JSON.parse(readFileSync(p, "utf8"));
    Object.assign(m, {
      name: app.name,
      short_name: app.short,
      ...(app.start && { start_url: app.start }),
      ...(app.scope && { scope: app.scope }),
      ...(genSw && { version }), // bei "keep" stempelt stamp-sw.mjs die Version selbst
      ...(app.description && { description: app.description }),
      ...(app.themeColor && { theme_color: app.themeColor }),
      ...(app.bg && { background_color: app.bg }),
    });
    if (hasIcons) {
      m.icons = [
        { src: "./icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "./icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
        { src: "./icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ];
    }
    writeFileSync(p, JSON.stringify(m, null, 2) + "\n");
    done.push(mfName);
  } else {
    log(`⚠️  kein Manifest in ${out} — übersprungen`);
  }

  // --- HTML: Titel, iOS-Meta, Splash, SW-Register
  const htmlPath = resolve(out, app.html || "index.html");
  if (existsSync(htmlPath)) {
    let html = readFileSync(htmlPath, "utf8");
    html = html.replace(/<title>[^<]*<\/title>/, `<title>${app.short}${app.titleSuffix ?? " - VitalOS"}</title>`);
    if (hasIcons) {
      html = html
        .replace(/(<link rel="apple-touch-icon" href=")[^"]*(")/, "$1./icon-180.png$2")
        .replace(/(<meta name="apple-mobile-web-app-title" content=")[^"]*(")/, `$1${app.short}$2`);
    }
    if (app.splash !== false) {
      html = injectSplash(html, { name: app.short, accent: app.accent, icon: "./icon-192.png", ...(app.bg && { bg: app.bg }), ...(typeof app.splash === "object" && app.splash) });
      done.push("Splash");
    }
    if (app.register) {
      html = injectRegister(html, { swUrl: `./${(sw && sw.file) || "sw.js"}`, exposeRegistration: !!(app.register && app.register.expose) });
      done.push("SW-Register");
    }
    writeFileSync(htmlPath, html);
  } else {
    log(`⚠️  ${htmlPath} nicht gefunden — kein Titel/Splash`);
  }

  // --- Service Worker
  if (genSw) {
    const extra = sw.extraFile ? readFileSync(resolve(root, sw.extraFile), "utf8") : sw.extra || "";
    const file = sw.file || "sw.js";
    let cfg = sw;
    if (sw.precacheAssets && existsSync(resolve(out, "assets"))) {
      // alle gehashten Build-Assets beim Installieren vorladen (voll offline ab dem ersten Start)
      const assets = readdirSync(resolve(out, "assets")).map((n) => `./assets/${n}`);
      cfg = { ...sw, shell: [...(sw.shell || ["./", "./index.html"]), ...assets] };
    }
    writeFileSync(resolve(out, file), buildSw({ appId: app.id, sw: cfg, version, extra }));
    done.push(`${file} (${(sw.prefix || `vos-${app.id}-`)}v${version})`);
  }

  log(`✨ ${out}: ${app.short} — ${done.join(", ")}`);
  return { version, done };
}
