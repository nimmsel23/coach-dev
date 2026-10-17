// Paritätstest: alter handgeschriebener Service Worker vs. aus mini-app.json generierter SW.
// Beide laufen in einer vm-Sandbox mit denselben Fetch-/Cache-Mocks und denselben Szenarien (aus der Config
// abgeleitet: API-Pfade, Assets, Navigation, POST, Bilder, Fremd-Hosts); verglichen wird, was beobachtbar ist:
// antwortet der SW, Status/Quelle/Body, was landet im Cache, Install-Precache, Aufräumen, Messages.
//   node scripts/mini-app-shell/cli.mjs parity --app fuel --old docs/archive/sw.fuel-v1.js [--ignore Navigation,POST]
// --ignore: Szenarien (Teilstring des Namens), deren Abweichung gewollt ist → werden angezeigt, zählen nicht als Fehler.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";
import { buildSw } from "./sw.mjs";

const ORIGIN = "https://app.test";

function harness(src, { online, seed }) {
  const handlers = {};
  const stores = new Map();
  const deleted = [];
  const norm = (r) => {
    const u = new URL(typeof r === "string" ? r : r.url, ORIGIN + "/");
    return u.origin === ORIGIN ? u.pathname + u.search : u.href;
  };
  const store = (n) => (stores.has(n) ? stores.get(n) : stores.set(n, new Map()).get(n));
  const caches = {
    open: async (n) => ({
      addAll: async (urls) => urls.forEach((u) => store(n).set(norm(u), new Response("precached"))),
      put: async (r, res) => store(n).set(norm(r), res),
      match: async (r) => store(n).get(norm(r)),
    }),
    keys: async () => [...stores.keys()],
    delete: async (n) => { deleted.push(n); stores.delete(n); },
    match: async (r) => { for (const m of stores.values()) { const h = m.get(norm(r)); if (h) return h; } },
  };
  for (const n of seed) store(n);
  const ctx = {
    self: {
      registration: { scope: ORIGIN + "/", showNotification: async () => {}, getNotifications: async () => [] },
      location: { origin: ORIGIN, hostname: "app.test" },
      addEventListener: (t, f) => (handlers[t] ||= []).push(f),
      skipWaiting() {},
      clients: { claim: async () => {}, matchAll: async () => [], openWindow: async () => null },
    },
    clients: { claim: async () => {}, matchAll: async () => [], openWindow: async () => null },
    caches, URL, Response, console, setTimeout, clearTimeout, indexedDB: {},
    fetch: async (req) => {
      if (!online) throw new TypeError("offline");
      return new Response("net:" + norm(req), { status: 200 });
    },
  };
  vm.runInNewContext(src, ctx);
  return { handlers, stores, deleted };
}

const emit = (h, type, evt) => (h.handlers[type] || []).forEach((f) => f(evt));

async function install(h) {
  let p;
  emit(h, "install", { waitUntil: (x) => (p = x) });
  await p;
}

function scenariosFor(sw) {
  const api = [...(sw.api?.swr || []), ...(sw.api?.networkFirst || [])];
  const apiUrl = (p) => ORIGIN + (p.endsWith("/") ? p + "x" : p);
  const out = [];
  api.slice(0, 8).forEach((p) => out.push({ name: `API ${p}`, url: apiUrl(p) + (p.endsWith("/") ? "" : "?q=1") }));
  out.push(
    { name: "Asset /assets/app.js", url: ORIGIN + "/assets/app.js" },
    { name: "Asset /icon-192.png", url: ORIGIN + "/icon-192.png" },
    { name: "Asset /offline-queue.js", url: ORIGIN + "/offline-queue.js" },
    { name: "Unbekannt /foo/bar", url: ORIGIN + "/foo/bar" },
    { name: "Navigation /", url: ORIGIN + "/", mode: "navigate" },
    { name: "Navigation /index.html", url: ORIGIN + "/index.html", mode: "navigate" },
    { name: "POST /foo/bar", url: ORIGIN + "/foo/bar", method: "POST" },
    { name: "Fremder Host JS", url: "https://other.example/x.js" },
    { name: "Bild fremder Host", url: "https://img.example/a.png", destination: "image" },
  );
  if (api[0]) out.push({ name: `POST ${api[0]}`, url: apiUrl(api[0]), method: "POST" });
  (sw.imageCaches || []).forEach((ic) => out.push({ name: `Bild ${ic.hosts[0]}`, url: `https://${ic.hosts[0]}/x/a.png`, destination: "image" }));
  (sw.neverCache || []).forEach((p) => out.push({ name: `neverCache ${p}`, url: ORIGIN + p + (p.endsWith("/") ? "x" : "") }));
  return out;
}

export async function runParity({ root, appName, oldPath, configPath = "mini-app.json", ignore = [], log = console.log }) {
  const cfg = JSON.parse(readFileSync(resolve(root, configPath), "utf8")).apps[appName];
  if (!cfg) throw new Error(`App "${appName}" fehlt in ${configPath}`);
  const sw = cfg.sw || {};
  const prefix = sw.prefix || `vos-${appName}-`;
  const oldCache = `${prefix}vTEST`;
  const oldSrc = readFileSync(resolve(root, oldPath), "utf8").replace(/(const\s+CACHE\s*=\s*)(["'])[^"']+\2/, `$1"${oldCache}"`);
  const extra = sw.extraFile ? readFileSync(resolve(root, sw.extraFile), "utf8") : sw.extra || "";
  const newSrc = buildSw({ appId: cfg.id || appName, sw, version: "TEST", extra });
  const isMain = (n) => n.startsWith(prefix + "v");
  const imageCacheNames = new Set((sw.imageCaches || []).map((c) => c.cache));

  async function run(src, scenario, online) {
    const h = harness(src, { online, seed: [] });
    await install(h);
    const before = new Set([...h.stores.values()].flatMap((m) => [...m.keys()]));
    let responded = null;
    const req = { method: scenario.method || "GET", url: scenario.url, mode: scenario.mode || "cors", destination: scenario.destination || "" };
    emit(h, "fetch", { request: req, respondWith: (p) => (responded = Promise.resolve(p)) });
    const out = { responded: false };
    if (responded) {
      out.responded = true;
      try {
        const res = await responded;
        if (res && res.type === "error") {
          out.status = "error"; // Response.error() == abgelehntes respondWith: für den Browser ein Netzwerkfehler
        } else {
          out.status = res ? res.status : "undefined";
          out.source = res && res.headers ? res.headers.get("X-Source") || "" : "";
          out.body = res && res.clone ? await res.clone().text().catch(() => "") : "";
        }
      } catch {
        out.status = "error";
      }
    }
    await new Promise((r) => setTimeout(r, 5));
    out.cached = [...h.stores.entries()]
      .flatMap(([n, m]) => [...m.keys()].filter((k) => !(isMain(n) && before.has(k))).map((k) => (imageCacheNames.has(n) ? "IMG:" : "") + k))
      .sort();
    return out;
  }

  const scenarios = scenariosFor(sw);
  let failures = 0;
  const diffs = [];
  const accepted = [];
  for (const online of [true, false]) {
    for (const sc of scenarios) {
      const a = await run(oldSrc, sc, online);
      const b = await run(newSrc, sc, online);
      if (JSON.stringify(a) !== JSON.stringify(b)) {
        const entry = { szenario: `${online ? "online " : "offline"} ${sc.name}`, alt: a, neu: b };
        if (ignore.some((i) => sc.name.includes(i))) accepted.push(entry);
        else { failures++; diffs.push(entry); }
      }
    }
  }

  // Lebenszyklus
  const seedOld = [`${prefix}vOLD`, `${prefix}v1`, ...imageCacheNames];
  const a = harness(oldSrc, { online: true, seed: seedOld });
  const b = harness(newSrc, { online: true, seed: seedOld });
  await install(a); await install(b);
  const pre = (h) => [...(h.stores.get(oldCache) || h.stores.get(`${prefix}vTEST`) || new Map()).keys()].sort();
  if (JSON.stringify(pre(a)) !== JSON.stringify(pre(b))) { failures++; diffs.push({ szenario: "install-Precache", alt: pre(a), neu: pre(b) }); }
  for (const h of [a, b]) { let p; emit(h, "activate", { waitUntil: (x) => (p = x) }); await p; }
  const delA = a.deleted.sort(), delB = b.deleted.sort();
  if (JSON.stringify(delA) !== JSON.stringify(delB)) { failures++; diffs.push({ szenario: "activate räumt auf", alt: delA, neu: delB }); }
  for (const [lbl, h] of [["alt", a], ["neu", b]]) {
    const msgs = [];
    emit(h, "message", { data: { type: "GET_VERSION" }, source: { postMessage: (m) => msgs.push(m) }, waitUntil() {} });
    if (!msgs[0] || !new RegExp("^" + prefix).test(msgs[0].version)) { failures++; diffs.push({ szenario: `GET_VERSION (${lbl})`, ist: msgs }); }
    if (sw.sync && !(h.handlers.sync || []).length) { failures++; diffs.push({ szenario: `Background-Sync-Handler fehlt (${lbl})` }); }
    if ((sw.extras || []).includes("workout-notifications")) {
      const shown = [];
      emit(h, "message", { data: { type: "SHOW_WORKOUT_TIMER_NOTIFICATION", title: "T" }, waitUntil: (p) => shown.push(p) });
      if (shown.length !== 1) { failures++; diffs.push({ szenario: `Workout-Notification (${lbl})`, ist: shown.length }); }
    }
  }
  // Event-Listener-Anzahl je Typ (z. B. doppelter notificationclick wäre ein Bug)
  const count = (h) => Object.fromEntries(Object.entries(h.handlers).map(([k, v]) => [k, v.length]));
  const ca = count(a), cb = count(b);
  for (const k of ["install", "activate", "fetch", "push", "notificationclick", "sync"]) {
    if ((ca[k] || 0) !== (cb[k] || 0)) { failures++; diffs.push({ szenario: `Listener "${k}"`, alt: ca[k] || 0, neu: cb[k] || 0 }); }
  }

  // gewollte Lebenszyklus-Abweichungen (--ignore, z. B. "activate", "install-Precache", "Listener") nicht als Fehler zählen
  for (let i = diffs.length - 1; i >= 0; i--) {
    if (ignore.some((g) => String(diffs[i].szenario).includes(g))) { accepted.push(diffs[i]); diffs.splice(i, 1); failures--; }
  }
  log(`Szenarien: ${scenarios.length * 2} + Lebenszyklus — Abweichungen: ${failures}${accepted.length ? `, gewollt (--ignore): ${accepted.length}` : ""}`);
  for (const d of diffs) log("✖ " + JSON.stringify(d, null, 1));
  for (const d of accepted) log("≈ gewollt: " + d.szenario);
  return { failures, diffs, accepted };
}
