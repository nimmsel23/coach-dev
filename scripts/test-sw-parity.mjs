// Paritätstest: alter handgeschriebener Fitness-SW vs. aus mini-app.json generierter SW.
// Beide laufen in einer vm-Sandbox mit denselben Fetch-/Cache-Mocks und denselben Szenarien; verglichen wird,
// was beobachtbar ist (antwortet der SW? Status/Quelle, was landet im Cache, Aufräumen, Messages).
//   node scripts/test-sw-parity.mjs [--app fitness] [--old docs/archive/sw.fitness-main-v1.js]
//   node scripts/test-sw-parity.mjs --app frontend --old frontend/public/sw.js
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";
import { buildSw } from "./mini-app-shell/sw.mjs";

const root = resolve(new URL("..", import.meta.url).pathname);
const oldPath = process.argv.includes("--old") ? process.argv[process.argv.indexOf("--old") + 1] : "docs/archive/sw.fitness-main-v1.js";
const appName = process.argv.includes("--app") ? process.argv[process.argv.indexOf("--app") + 1] : "fitness";
const cfg = JSON.parse(readFileSync(resolve(root, "mini-app.json"), "utf8")).apps[appName];

const OLD_CACHE = "fitness-vTEST";
const oldSrc = readFileSync(resolve(root, oldPath), "utf8").replace(/fitness-v0\b/, OLD_CACHE);
const newSrc = buildSw({ appId: cfg.id, sw: cfg.sw, version: "TEST", extra: "" });

const ORIGIN = "https://app.test";

function harness(src, { online, seed }) {
  const handlers = {};
  const stores = new Map(); // cacheName -> Map(pathname|url -> Response)
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
  const fetchLog = [];
  const ctx = {
    self: {
      registration: { scope: ORIGIN + "/", showNotification: async () => {}, getNotifications: async () => [] },
      location: { origin: ORIGIN },
      addEventListener: (t, f) => (handlers[t] ||= []).push(f), // mehrere Listener je Event erlaubt (Extras)
      skipWaiting() {},
      clients: { claim: async () => {}, matchAll: async () => [], openWindow: async () => null },
    },
    caches, URL, Response, console, setTimeout, clearTimeout, indexedDB: {},
    fetch: async (req) => {
      fetchLog.push(norm(req));
      if (!online) throw new TypeError("offline");
      return new Response("net:" + norm(req), { status: 200 });
    },
  };
  vm.runInNewContext(src, ctx);
  return { handlers, stores, deleted, caches, norm, fetchLog };
}

const emit = (h, type, evt) => (h.handlers[type] || []).forEach((f) => f(evt));
const mainName = (stores) => [...stores.keys()].find((k) => k.startsWith("fitness-v"));

async function install(h) {
  let p;
  emit(h, "install", { waitUntil: (x) => (p = x) });
  await p;
}

async function run(src, scenario, online) {
  const h = harness(src, { online, seed: [] });
  await install(h);
  const before = new Set([...[...h.stores.values()].flatMap((m) => [...m.keys()])]);
  let responded = null;
  const req = { method: scenario.method || "GET", url: scenario.url, mode: scenario.mode || "cors", destination: scenario.destination || "" };
  emit(h, "fetch", { request: req, respondWith: (p) => (responded = Promise.resolve(p)) });
  let out = { responded: false };
  if (responded) {
    out.responded = true;
    try {
      const res = await responded;
      out.status = res ? res.status : "undefined";
      out.source = res && res.headers ? res.headers.get("X-Source") || "" : "";
      out.body = res && res.clone ? await res.clone().text().catch(() => "") : "";
    } catch (e) {
      out.status = "error";
    }
  }
  await new Promise((r) => setTimeout(r, 5));
  // was ist NEU im Cache (nach Cache-Art getrennt)
  out.cached = [...h.stores.entries()].flatMap(([n, m]) => [...m.keys()].filter((k) => !(n.startsWith("fitness-v") && before.has(k))).map((k) => (n === "fitness-exercise-images" ? "IMG:" : "") + k)).sort();
  return out;
}

const scenarios = [
  { name: "API-SWR /session?date=1", url: ORIGIN + "/session?date=1" },
  { name: "API-SWR /fitness/weekly", url: ORIGIN + "/fitness/weekly" },
  { name: "API-SWR /health", url: ORIGIN + "/health" },
  { name: "API-SWR /exercises/search?q=a", url: ORIGIN + "/exercises/search?q=a" },
  { name: "Asset /assets/app.js", url: ORIGIN + "/assets/app.js" },
  { name: "Asset /offline-queue.js", url: ORIGIN + "/offline-queue.js" },
  { name: "Asset /icon-192.png", url: ORIGIN + "/icon-192.png" },
  { name: "Unbekannt /foo/bar", url: ORIGIN + "/foo/bar" },
  { name: "Navigation /", url: ORIGIN + "/", mode: "navigate" },
  { name: "Navigation /index.html", url: ORIGIN + "/index.html", mode: "navigate" },
  { name: "POST /session", url: ORIGIN + "/session", method: "POST" },
  { name: "Bild cdn.jsdelivr.net", url: "https://cdn.jsdelivr.net/x/a.png", destination: "image" },
  { name: "Bild fremder Host", url: "https://img.example/a.png", destination: "image" },
  { name: "Fremder Host JS", url: "https://other.example/x.js" },
  { name: "API /api/users (SWR im Frontend-Fork)", url: ORIGIN + "/api/users" },
  { name: "API /api/plan?x=1", url: ORIGIN + "/api/plan?x=1" },
  { name: "API /api/sync/pull (nie cachen)", url: ORIGIN + "/api/sync/pull" },
  { name: "API /api/health (nie cachen)", url: ORIGIN + "/api/health" },
];

let failures = 0;
const diffs = [];
for (const online of [true, false]) {
  for (const sc of scenarios) {
    const a = await run(oldSrc, sc, online);
    const b = await run(newSrc, sc, online);
    const same = JSON.stringify(a) === JSON.stringify(b);
    if (!same) {
      failures++;
      diffs.push({ szenario: `${online ? "online " : "offline"} ${sc.name}`, alt: a, neu: b });
    }
  }
}

// Lebenszyklus: install-Precache, activate-Aufräumen, Messages, notificationclick, Sync-Tag
{
  const a = harness(oldSrc, { online: true, seed: [OLD_CACHE.replace("TEST", "OLD"), "fitness-exercise-images", "fitness-v1"] });
  const b = harness(newSrc, { online: true, seed: ["fitness-vOLD", "fitness-exercise-images", "fitness-v1"] });
  await install(a); await install(b);
  const pre = (h) => [...h.stores.get(mainName(h.stores)).keys()].sort();
  const preA = pre(a), preB = pre(b);
  if (JSON.stringify(preA) !== JSON.stringify(preB)) { failures++; diffs.push({ szenario: "install-Precache", alt: preA, neu: preB }); }
  for (const h of [a, b]) { let p; emit(h, "activate", { waitUntil: (x) => (p = x) }); await p; }
  const delA = a.deleted.sort(), delB = b.deleted.sort();
  if (JSON.stringify(delA) !== JSON.stringify(delB)) { failures++; diffs.push({ szenario: "activate räumt auf", alt: delA, neu: delB }); }
  for (const [lbl, h] of [["alt", a], ["neu", b]]) {
    const msgs = [];
    emit(h, "message", { data: { type: "GET_VERSION" }, source: { postMessage: (m) => msgs.push(m) }, waitUntil() {} });
    if (!msgs[0] || !/^fitness-v/.test(msgs[0].version)) { failures++; diffs.push({ szenario: `GET_VERSION (${lbl})`, ist: msgs }); }
    const shown = [];
    emit(h, "message", { data: { type: "SHOW_WORKOUT_TIMER_NOTIFICATION", title: "T" }, waitUntil: (p) => shown.push(p) });
    if (shown.length !== 1) { failures++; diffs.push({ szenario: `Workout-Notification (${lbl})`, ist: shown.length }); }
    if (!(h.handlers.sync || []).length) { failures++; diffs.push({ szenario: `Background-Sync-Handler fehlt (${lbl})` }); }
  }
}

console.log(`Szenarien: ${scenarios.length * 2} + Lebenszyklus — Abweichungen: ${failures}`);
for (const d of diffs) console.log(JSON.stringify(d, null, 1));
process.exit(failures ? 1 : 0);
