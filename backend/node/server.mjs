import { createPythonProxy, registerPythonApi } from "./server/lib/python-proxy.mjs";
import { jsRoutineRoutes } from "./server/routes/js-routines.mjs";
import { defineJsonRoute, looseObjectSchema } from "./server/lib/routes.mjs";
import { registerExercises } from "./server/routes/exercises.mjs";
import { registerCoach } from "./server/routes/coach.mjs";
import { registerFitnessMisc } from "./server/routes/fitness-misc.mjs";
import { registerCoachingNotes } from "./server/routes/coaching-notes.mjs";
import { registerRoutines } from "./server/routes/routines.mjs";
import { registerWorkouts } from "./server/routes/workouts.mjs";
import { registerMacrocycles } from "./server/routes/macrocycles.mjs";
import { registerSession } from "./server/routes/session.mjs";
import { registerJournal } from "./server/routes/journal.mjs";
import { registerFitnessData } from "./server/routes/fitness-data.mjs";
import { registerFirestore } from "./server/routes/firestore.mjs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { swaggerUI } from "@hono/swagger-ui";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import pino from "pino";
import { buildPlan, exportSessionMarkdown, exportWithPython, fitnessData, getWeeklySummary, obsidianTargetPath, searchExercises } from "./fitness-runtime.mjs";
import { mirrorSession, mirrorSessionDelete, mirrorJournal, getFirestoreStatus, readJournalFull, listJournals, pullAllSessions, pullJournalTree } from "./firestore-mirror.mjs";
import { entriesPath as journalEntriesPath, freetextBody as journalFreetextBody, upsertEntry as journalUpsertEntry } from "./journal-store.mjs";
import { stravaRoutes } from "./server/routes/strava.mjs";

// pino-pretty IMMER aktiv, auch unter systemd/journalctl — das ist der
// tatsächliche Haupt-Log-Weg hier (nicht nur `npm run dev` im Terminal).
// Rohes JSON war unter journalctl deutlich unlesbarer als die alten
// console.log-Zeilen. Farbe bleibt an (journalctl rendert ANSI im Terminal
// sauber), kein translateTime — journalctl stempelt eh schon, ein zweiter
// Timestamp war nur Redundanz ohne Mehrwert.
const log = pino({
  transport: {
    target: "pino-pretty",
    options: { colorize: true, ignore: "pid,hostname,time" },
  },
});

// firebase-admin/undici haben beim Boot ein bekanntes, nicht-deterministisches
// Stream-Close-Race (ERR_INVALID_STATE), das den ganzen Prozess mitreißt, weil
// es außerhalb jedes try/catch als uncaughtException landet (siehe
// notifyPythonSync + Firestore-Watcher-Kommentare unten für dieselbe Bug-Klasse,
// dort zeitbasiert umschifft — das reicht nicht immer, siehe 2026-08-15 Rückfall).
// Statt zu raten wie lange "warm genug" ist: diese spezifische, bekannt harmlose
// Race gezielt abfangen statt den Prozess sterben zu lassen. Alles andere crasht
// weiterhin normal.
process.on("uncaughtException", (err) => {
  if (err?.code === "ERR_INVALID_STATE" && /ReadableStream is already closed/.test(err?.message || "")) {
    log.warn(`[undici-race] bekanntes Boot-Race abgefangen, Prozess läuft weiter: ${err.message}`);
    return;
  }
  log.error({ err }, "[uncaughtException] unbekannt, Prozess beendet sich");
  process.exit(1);
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolveUid() {
  if (process.env.FITNESS_UID) return process.env.FITNESS_UID;
  const uidFile = path.join(os.homedir(), ".aos", "users", ".active-uid");
  try { return fs.readFileSync(uidFile, "utf-8").trim(); } catch {}
  return "59ole36uNpNwml5H6VDYCXyCME92";
}

const FITNESS_UID = resolveUid();
const DATA_DIR   = path.join(os.homedir(), ".aos", "users", FITNESS_UID, "fitness");
// Eigenes Repo: Frontend (public/, dist/) liegt im Nachbar-Repo fitness-dev (FITNESS_ROOT überschreibt).
const APP_ROOT   = process.env.FITNESS_ROOT ? path.resolve(process.env.FITNESS_ROOT) : path.join(__dirname, "..", "fitness-dev");
const PUBLIC_DIR = path.join(APP_ROOT, "public");
const DIST_DIR   = path.join(APP_ROOT, "dist");
const STATIC_DIR = process.env.FITNESS_STATIC_DIR ? path.resolve(process.env.FITNESS_STATIC_DIR) : (fs.existsSync(DIST_DIR) ? DIST_DIR : PUBLIC_DIR);
const PORT       = Number(process.env.PORT || (process.env.NODE_ENV === 'production' ? 6100 : 9100));
const HOST       = process.env.HOST || "127.0.0.1";
const PYTHON_PORT = Number(process.env.FITNESS_PYTHON_PORT || 9150);
const PYTHON_BASE = `http://127.0.0.1:${PYTHON_PORT}`;
const BODY_DIR = path.join(DATA_DIR, "body");

for (const d of ["sessions", "journal"]) fs.mkdirSync(path.join(DATA_DIR, d), { recursive: true });

// ── SQLite: Python (sync_gateway.py) ist der einzige Schreiber ──────────────
// Früher hatte Node hier einen eigenen better-sqlite3-Writer parallel zu
// Python — beide schrieben in dieselbe training_history.sqlite, ohne
// Koordination. Nodes Variante las zusätzlich ex.sets/reps/weight direkt
// (Summary-Felder, in echten Sessions leer, da nur setsArray befüllt wird)
// → ein Großteil der Zeilen hatte sets=0/reps=0/weight=0. Node schreibt jetzt
// nur noch die JSON-Datei (SOT) und benachrichtigt Python, das aus setsArray
// korrekt aggregiert (session_signal.py::training_values()) und per Upsert
// mit echtem UNIQUE(date, session_id, exercise_id) schreibt.

// ── Python sync_gateway — awaited, damit ein echter Sync-Fehler dem Client
// sichtbar wird (sqliteSync:false in der Response), statt still zu verschwinden.
async function notifyPythonSync(date, session, uid = FITNESS_UID, sessionId = null) {
  const res = await fetch(`${PYTHON_BASE}/internal/sync/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date, session, uid, session_id: sessionId }),
    signal: AbortSignal.timeout(3000),
  });
  // Body IMMER konsumieren, sonst race zwischen AbortSignal.timeout()-Cleanup
  // und undicis interner Stream-Close-Logik → ERR_INVALID_STATE crashed den
  // ganzen Prozess (unhandled, außerhalb jedes try/catch).
  await res.text().catch(() => {});
  if (!res.ok) throw new Error(`sync_gateway antwortete ${res.status}`);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function readJson(p, fallback = null) {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return fallback; }
}
function writeJson(p, data) { fs.writeFileSync(p, JSON.stringify(data, null, 2)); }

function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function lastDates(days) {
  const out = [];
  const base = new Date(localToday() + "T12:00:00");
  for (let i = 0; i < days; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() - i);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  }
  return out;
}

function escapeCsvValue(v) {
  return String(v ?? "").replaceAll('"', '""');
}
// wger-client.mjs wird erst per dynamic import() geladen, wenn der erste
// echte Fallback-Aufruf nötig ist (lokaler Katalog liefert nichts) — kein
// Boot-Ping, kein Token im Hauptmodul. wger ist meist offline, das Modul
// hat dafür einen eigenen Cooldown (siehe wger-client.mjs).
let _wgerClient = null;
async function wgerClient() {
  if (!_wgerClient) _wgerClient = await import("./wger-client.mjs");
  return _wgerClient;
}
async function fetchWger(wgerPath, qs = "") {
  return (await wgerClient()).fetchWger(wgerPath, qs);
}
async function postWger(wgerPath, body) {
  return (await wgerClient()).postWger(wgerPath, body);
}

function normMuscleKey(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function muscleToGroupId(muscleName) {
  const k = normMuscleKey(muscleName);
  if (!k) return null;
  const MAP = {
    chest:      ["chest","pec","pecs","pectoralis","pectoralis major","pectoralis minor","100_chest","101_pectoralis","102_pectoralis","103_pectoralis"],
    back:       ["back","lat","lats","latissimus","latissimus dorsi","trapezius","traps","rhomboids","rhomboid","lower back","erector spinae","erector","200_back","201_latissimus","202_trapezius","203_trapezius","204_trapezius","205_rhomboids","206_erector_spinae","206_erector","207_teres","208_quadratus"],
    shoulders:  ["shoulder","shoulders","delt","delts","deltoid","deltoids","anterior deltoid","posterior deltoid","lateral deltoid","rotator cuff","300_shoulders","301_anterior_deltoid","302_lateral_deltoid","303_posterior_deltoid","304_rotator"],
    arms:       ["arm","arms","biceps","biceps brachii","triceps","triceps brachii","forearms","forearm","brachialis","400_arms","401_biceps","402_brachialis","403_triceps","404_brachioradialis","405_forearm","406_anconeus"],
    core:       ["core","abs","abdominals","rectus abdominis","obliques","obliquus externus abdominis","oblique","transverse abdominis","500_core","501_rectus","502_obliques","503_transverse"],
    glutes:     ["glutes","glute","gluteus maximus","gluteus medius","gluteus minimus","601_gluteus_maximus","601_gluteus","602_gluteus_medius","602_gluteus"],
    quads:      ["quads","quad","quadriceps","quadriceps femoris","vastus lateralis","vastus medialis","rectus femoris","603_quadriceps"],
    hamstrings: ["hamstrings","hamstring","biceps femoris","semitendinosus","semimembranosus","604_hamstrings"],
    calves:     ["calves","calf","gastrocnemius","soleus","700_calves","701_gastrocnemius","702_soleus","triceps surae"],
  };
  for (const [id, keys] of Object.entries(MAP)) {
    if (keys.some(x => k.includes(x))) return id;
  }
  return null;
}

function displayMuscleName(s) {
  return String(s || "").trim().replace(/\s+/g, " ");
}

function defaultBlocks() {
  return [
    { id: "push",  label: "Push",  muscle_groups: ["chest", "shoulders", "arms"] },
    { id: "pull",  label: "Pull",  muscle_groups: ["back", "arms"] },
    { id: "legs",  label: "Legs",  muscle_groups: ["quads", "hamstrings", "glutes", "calves"] },
    { id: "upper", label: "Upper", muscle_groups: ["chest", "back", "shoulders", "arms"] },
    { id: "lower", label: "Lower", muscle_groups: ["quads", "hamstrings", "glutes", "calves"] },
  ];
}

const ROLE_W = { primary: 1, secondary: 0.5, stabilizer: 0.2 };
// Spiegel von src/lib/db/shared/scoring.js: Kraft × RPE/10, Cardio leichter,
// Split-Chip ohne Übungen = ganzer Muskelkomplex pauschal als primary.
const ACTIVITY_WEIGHT = 0.5;
const _PUSH = ["chest", "shoulders", "triceps"];
const _PULL = ["upper_back", "middle_back", "biceps"];
const _LEGS = ["quadriceps", "hamstrings", "glutes", "calves"];
const BLOCK_MUSCLES = {
  push: _PUSH, pull: _PULL, legs: _LEGS,
  upper: [..._PUSH, ..._PULL], lower: _LEGS, full: [..._PUSH, ..._PULL, ..._LEGS, "abs"],
};
function effortFactor(sess) {
  const rpe = Number(sess?.effort);
  return Number.isFinite(rpe) && rpe > 0 ? Math.min(rpe, 10) / 10 : 1;
}

// Rohe (Muskel, Rolle, Gewicht)-Treffer einer Session, aus geloggten Übungen
// UND einem geloggten Cardio/Activity-Finisher (activity.muscles[], bereits
// beim Speichern aufgelöst; activity.primaryMuscles[] markiert die
// Hauptmover, z.B. Brust beim Brustschwimmen — Rest bleibt secondary).
function sessionHits(sess) {
  const rows = [];
  const eff = effortFactor(sess);
  for (const ex of (sess?.exercises || [])) {
    const pm = ex.primary_muscles || ex.primaryMuscles || [];
    const sm = ex.secondary_muscles || ex.secondaryMuscles || [];
    const st = ex.stabilizers || [];
    for (const m of pm) rows.push([m, "primary", ROLE_W.primary * eff]);
    for (const m of sm) rows.push([m, "secondary", ROLE_W.secondary * eff]);
    for (const m of st) rows.push([m, "stabilizer", ROLE_W.stabilizer * eff]);
  }
  const actPrimary = new Set(sess?.activity?.primaryMuscles || []);
  for (const m of (sess?.activity?.muscles || [])) {
    const role = actPrimary.has(m) ? "primary" : "secondary";
    rows.push([m, role, ROLE_W[role] * ACTIVITY_WEIGHT]);
  }
  if (!(sess?.exercises || []).length) {
    const b = String(sess?.block || "").trim().toLowerCase();
    for (const m of (BLOCK_MUSCLES[b === "full body" ? "full" : b] || [])) rows.push([m, "primary", ROLE_W.primary * eff]);
  }
  return rows;
}

// Max-per-Muskel-Normalisierung: pro Session zählt für einen Muskel nur der
// höchste Rollen-Treffer (nicht die Summe über alle Übungen). One-Set-to-
// Failure: jede geloggte Übung ist ungefähr gleich hart, mehrere Übungen für
// denselben Muskel bedeuten mehr Breite, nicht automatisch mehr
// Gesamtbelastung — sonst zählt ein 4-Übungen-Rücken-Workout allein wegen
// der Übungsanzahl mehr als ein 1-2-Übungen-Brust-Workout. (Die zuvor
// versuchte Session-Budget-Skalierung war zu aggressiv — sie hat pro Session
// auf einen festen Gesamtwert gedeckelt, wodurch nach ein paar Tagen fast
// jeder Muskel auf denselben Wert konvergierte.) Spiegel von
// coaching.py::_normalized_session_hits.
function normalizedSessionHits(sess) {
  const raw = sessionHits(sess);
  const best = new Map();
  for (const [m, role, w] of raw) {
    const cur = best.get(m);
    if (!cur || w > cur[1]) best.set(m, [role, w]);
  }
  return Array.from(best.entries()).map(([m, [role, w]]) => [m, role, w]);
}

function computeCoverage(days) {
  const allDates = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(localToday() + "T12:00:00");
    d.setDate(d.getDate() - i);
    allDates.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  }
  const hits = {};
  for (const date of allDates) {
    const sess = readJson(path.join(DATA_DIR, "sessions", `${date}.json`));
    for (const [m, , w] of normalizedSessionHits(sess)) {
      const id = muscleToGroupId(m) || normMuscleKey(m);
      if (id) hits[id] = (hits[id] || 0) + w;
    }
  }
  return hits;
}

function computeCoverageAnatomy(days) {
  const allDates = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(localToday() + "T12:00:00");
    d.setDate(d.getDate() - i);
    allDates.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  }
  const map = new Map();
  function hit(name, w, kind) {
    const key = normMuscleKey(name);
    if (!key) return;
    const cur = map.get(key) || { name_en: displayMuscleName(name), primaryHits: 0, secondaryHits: 0, totalScore: 0 };
    if (kind === "primary")   cur.primaryHits   += w;
    if (kind === "secondary") cur.secondaryHits += w;
    cur.totalScore += w;
    const label = displayMuscleName(name);
    if (label.length > (cur.name_en || "").length) cur.name_en = label;
    map.set(key, cur);
  }
  for (const date of allDates) {
    const sess = readJson(path.join(DATA_DIR, "sessions", `${date}.json`));
    for (const [m, role, w] of normalizedSessionHits(sess)) {
      hit(m, w, role === "primary" ? "primary" : "secondary");
    }
  }
  return Array.from(map.values()).sort((a, b) => (b.totalScore || 0) - (a.totalScore || 0));
}

// ═════════════════════════════════════════════════════════════════════════════
const app = new OpenAPIHono(); // Drop-in-Ersatz für Hono, alle bestehenden app.get/post/etc. bleiben unverändert nutzbar

app.use("*", async (c, next) => {
  c.res.headers.set("Access-Control-Allow-Origin", "*");
  c.res.headers.set("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  c.res.headers.set("Access-Control-Allow-Headers", "Content-Type,Authorization,X-Fitness-Uid,X-User-UID");
  await next();
});

app.options("*", (c) => c.body(null, 204));

// ── Health ────────────────────────────────────────────────────────────────────
app.openapi(defineJsonRoute({
  method: "get",
  path: "/health",
  tags: ["system"],
  summary: "Healthcheck",
  responseSchema: z.object({ ok: z.boolean(), port: z.number(), uptime: z.number() }),
}), (c) =>
  c.json({ ok: true, port: PORT, uptime: Math.floor(process.uptime()) })
);

// ── Routines / Workouts ───────────────────────────────────────────────────────
// Reine Proxies zu fitness-api (Python, :9150) — Node hält hier absichtlich
// keine eigene Logik/keinen eigenen Datenschreiber mehr (war vorher
// routines.json/workouts.json direkt in Node gelesen/geschrieben, parallel
// zum späteren Python-Äquivalent möglich → zwei unabhängige Writer auf
// dieselbe Datei). Alles Neue kommt nur noch in fitness/api/routers/*.py.
const proxyToPython = createPythonProxy(PYTHON_BASE);
// Blind API forwarding: Python owns the complete path and all domain routing.
registerPythonApi(app, PYTHON_BASE);

// Route groups register on the root OpenAPIHono instance so Zod schemas remain in /openapi.json.
const routeContext = { PYTHON_BASE, readJson, fetchWger, fitnessData, searchExercises, FITNESS_UID, writeJson, localToday, DATA_DIR, defaultBlocks, buildPlan, exportSessionMarkdown, exportWithPython, getWeeklySummary, obsidianTargetPath, proxyToPython, notifyPythonSync, mirrorSession, mirrorSessionDelete, log, mirrorJournal, readJournalFull, listJournals, journalEntriesPath, journalFreetextBody, journalUpsertEntry, BODY_DIR, lastDates, escapeCsvValue, postWger, computeCoverage, computeCoverageAnatomy, STATIC_DIR, getFirestoreStatus, pullAllSessions, pullJournalTree };
registerExercises(app, routeContext);
registerCoach(app, routeContext);
registerFitnessMisc(app, routeContext);
registerCoachingNotes(app, routeContext);
registerRoutines(app, routeContext);
registerWorkouts(app, routeContext);
registerMacrocycles(app, routeContext);
registerSession(app, routeContext);
registerJournal(app, routeContext);
registerFitnessData(app, routeContext);
registerFirestore(app, routeContext);

// Isolierter Node-Prototyp: kein Zugriff auf Python-eigene Live-Daten ohne
// ausdrückliche Konfiguration eines separaten Verzeichnisses.
if (process.env.FITNESS_JS_ROUTINES_DATA_DIR) {
  app.route("/js/routines", jsRoutineRoutes({ dataRoot: process.env.FITNESS_JS_ROUTINES_DATA_DIR }));
}

// ── API-Doku (Swagger UI) ─────────────────────────────────────────────────────
// Spec wird zur Laufzeit aus Honos eigener Routing-Tabelle (app.routes)
// generiert statt von Hand gepflegt — bleibt automatisch synchron mit dem
// tatsächlichen Code, auch wenn oben Routen dazukommen/wegfallen. Bewusst
// ohne @hono/zod-openapi (würde ein Rewrite aller ~60 Handler auf
// Zod-Schemas verlangen, reiner "hat der Endpoint einen Namen"-Nutzen hier
// reicht für internes Debugging/Doku-Zweck).
function buildOpenApiSpec() {
  const paths = {};
  for (const r of app.routes) {
    if (r.method === "ALL" || r.path === "/*" || r.path === "*") continue;
    const method = r.method.toLowerCase();
    if (!["get", "post", "put", "patch", "delete"].includes(method)) continue;
    const openApiPath = r.path.replace(/:([^/]+)/g, "{$1}");
    paths[openApiPath] ??= {};
    const params = [...r.path.matchAll(/:([^/]+)/g)].map(([, name]) => ({
      name, in: "path", required: true, schema: { type: "string" },
    }));
    paths[openApiPath][method] = {
      summary: `${r.method} ${r.path}`,
      tags: [openApiPath.split("/").filter(Boolean)[0] || "root"],
      parameters: params,
      responses: { 200: { description: "OK" } },
    };
  }
  return {
    openapi: "3.0.3",
    info: {
      title: "fitness-dev API",
      version: "1.0.0",
      description: "Auto-generiert aus der Hono-Routing-Tabelle (server.mjs) — kein Handschrift-Spec, immer synchron mit dem laufenden Code.",
    },
    servers: [{ url: "/" }],
    paths,
  };
}

// ── Strava-Live-Import (Radtouren-Tab, OAuth2) ──────────────────────────────
// Routen ausgelagert in server/routes/strava.mjs (Hono-Sub-Router), Logik in
// strava-integration.mjs — hier nur Mount, analog zum Dependency-Injection-
// Stil der anderen importierten Module (firestore-mirror.mjs, journal-store.mjs).
app.route("/tours/strava", stravaRoutes({ usersRoot: path.join(os.homedir(), ".aos", "users"), log }));

app.get("/openapi.json", (c) => {
  // Basis: alle Routen generisch aus der Hono-Routing-Tabelle (immer
  // vollständig). Overlay: die paar Routen, die per .openapi()+Zod
  // registriert sind (aktuell /exercises/search, /fitness/plan, POST
  // /session) — deren echte Request/Response-Schemas ersetzen den
  // generischen Eintrag. OpenAPIHono liefert diese eigene Teil-Spec über
  // getOpenAPIDocument(), unabhängig von den restlichen Hono-Plain-Routen.
  const spec = buildOpenApiSpec();
  const zodDoc = app.getOpenAPIDocument({ openapi: "3.0.3", info: spec.info });
  for (const [p, methods] of Object.entries(zodDoc.paths || {})) {
    spec.paths[p] = { ...spec.paths[p], ...methods };
  }
  if (zodDoc.components) spec.components = zodDoc.components;
  return c.json(spec);
});
app.get("/docs", swaggerUI({ url: "/openapi.json" }));

// ── Static / SPA fallback ─────────────────────────────────────────────────────
app.get("*", async (c) => {
  const reqPath = c.req.path === "/" ? "/index.html" : c.req.path;
  const abs     = path.join(STATIC_DIR, reqPath);

  if (!abs.startsWith(STATIC_DIR)) return c.text("Forbidden", 403);

  if (fs.existsSync(abs)) {
    const ext  = path.extname(abs);
    const MIME = {
      ".html": "text/html;charset=utf-8", ".js": "application/javascript;charset=utf-8",
      ".css": "text/css;charset=utf-8",  ".json": "application/json;charset=utf-8",
      ".svg": "image/svg+xml",           ".png": "image/png",
      ".ico": "image/x-icon",            ".woff2": "font/woff2",
      ".woff": "font/woff",              ".webmanifest": "application/manifest+json",
    };
    return new Response(fs.createReadStream(abs), {
      headers: { "Content-Type": MIME[ext] || "application/octet-stream" },
    });
  }

  // SPA fallback
  const idx = path.join(STATIC_DIR, "index.html");
  if (fs.existsSync(idx)) {
    return new Response(fs.createReadStream(idx), {
      headers: { "Content-Type": "text/html;charset=utf-8" },
    });
  }
  return c.text("Not Found", 404);
});

// ═════════════════════════════════════════════════════════════════════════════
export { app };
if (process.env.FITNESS_SERVER_NO_LISTEN !== "1") {
  serve({ fetch: app.fetch, port: PORT, hostname: HOST }, () =>
    log.info(`💪 fitness-dev on http://${HOST}:${PORT}`)
  );
}

// User-Data-Firestore-Listener (Cloud → lokal) läuft NICHT hier — der lief kurz
// (9c9fb3e, 2026-08-14) eingebettet in server.mjs, war aber ein unbemerktes
// Duplikat: fitness-api.service (fitness/api/main.py) bettet denselben Sync
// bereits seit 2026-08-06 ein (siehe dortiger Kommentar). Zwei Prozesse
// hörten damit parallel auf dieselben Firestore-Collections und schrieben in
// dieselben lokalen Dateien/SQLite-Zeilen (sync_gateway deckt das in Python
// vollständig ab, inkl. Delete). Das war zugleich die Quelle des
// undici-Boot-Race (ERR_INVALID_STATE) — mit dem Listener entfernt entfällt
// der Trigger, nicht nur dessen Symptom (siehe uncaughtException-Guard oben,
// bleibt als genereller Schutz, ist aber jetzt nicht mehr der Normalfall).
// mirrorSession/mirrorSessionDelete/mirrorJournal (Push lokal → Cloud, bei
// jedem Write-Endpoint) bleiben unverändert — kein Duplikat, eigener Zweck.
