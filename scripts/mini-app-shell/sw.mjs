// Erzeugt den Service Worker einer Mini-App aus sw-template.js + Konfiguration.
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const TEMPLATE = resolve(HERE, "sw-template.js");

// Gemeinsame SW-Bausteine aus extras/<name>.js (z. B. "workout-notifications")
export function loadExtras(names = []) {
  return names
    .map((n) => {
      const p = resolve(HERE, "extras", `${n}.js`);
      if (!existsSync(p)) throw new Error(`SW-Extra "${n}" nicht gefunden (${p})`);
      return `// ---- extra: ${n}\n${readFileSync(p, "utf8")}`;
    })
    .join("\n");
}

// Default-Konfiguration einer Mini-App; alles per mini-app.json (Block "sw") überschreibbar.
export function swConfig(appId, sw = {}, version) {
  const prefix = sw.prefix || `vos-${appId}-`;
  return {
    prefix,
    cache: `${prefix}v${version}`,
    shell: ["./", "./index.html", "./manifest.json", "./icon-192.png"],
    navTimeoutMs: 4000,
    assetsPath: "/assets/",
    cacheAllSameOrigin: false,
    api: { swr: [], networkFirst: [] },
    imageCaches: [],
    keepCaches: [],
    notificationLink: "./",
    ...sw,
    // Build-Zeit-Optionen gehören nicht in die Laufzeit-Config
    extra: undefined,
    extraFile: undefined,
    extras: undefined,
    file: undefined,
    mode: undefined,
    precacheAssets: undefined,
  };
}

// version: Build-Stempel (Date.now().toString(36)) — macht jeden Build byte-verschieden,
// damit der Browser den neuen SW erkennt und der Splash "Update wird geladen …" zeigen kann.
export function buildSw({ appId, sw = {}, version, extra = "" }) {
  if (!appId) throw new Error("buildSw: appId fehlt");
  const cfg = swConfig(appId, sw, version);
  const tpl = readFileSync(TEMPLATE, "utf8");
  return tpl
    .replace("/*__VOS_CONFIG__*/ {}", () => JSON.stringify(cfg, null, 2))
    .replace("/*__VOS_EXTRA__*/", () => [loadExtras(sw.extras), extra].filter(Boolean).join("\n"));
}

export const newVersion = () => Date.now().toString(36);
