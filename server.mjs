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
const PUBLIC_DIR = path.join(__dirname, "public");
const DIST_DIR   = path.join(__dirname, "dist");
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

// Rohe (Muskel, Rolle, Gewicht)-Treffer einer Session, aus geloggten Übungen
// UND einem geloggten Cardio/Activity-Finisher (activity.muscles[], bereits
// beim Speichern aufgelöst; activity.primaryMuscles[] markiert die
// Hauptmover, z.B. Brust beim Brustschwimmen — Rest bleibt secondary).
function sessionHits(sess) {
  const rows = [];
  for (const ex of (sess?.exercises || [])) {
    const pm = ex.primary_muscles || ex.primaryMuscles || [];
    const sm = ex.secondary_muscles || ex.secondaryMuscles || [];
    const st = ex.stabilizers || [];
    for (const m of pm) rows.push([m, "primary", ROLE_W.primary]);
    for (const m of sm) rows.push([m, "secondary", ROLE_W.secondary]);
    for (const m of st) rows.push([m, "stabilizer", ROLE_W.stabilizer]);
  }
  const actPrimary = new Set(sess?.activity?.primaryMuscles || []);
  for (const m of (sess?.activity?.muscles || [])) {
    const role = actPrimary.has(m) ? "primary" : "secondary";
    rows.push([m, role, ROLE_W[role]]);
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
  c.res.headers.set("Access-Control-Allow-Headers", "Content-Type,Authorization");
  await next();
});

app.options("*", (c) => c.body(null, 204));

const anyJsonSchema = z.any();
const looseObjectSchema = z.object({}).loose();
const jsonContent = (schema = anyJsonSchema) => ({ "application/json": { schema } });
const jsonResponse = (schema = anyJsonSchema, description = "OK") => ({
  description,
  content: jsonContent(schema),
});
function defineJsonRoute({ method, path, tags, summary, description, query, params, jsonBody, responseSchema = anyJsonSchema, responseDescription = "OK", responses }) {
  const request = {};
  if (query) request.query = query;
  if (params) request.params = params;
  if (jsonBody) request.body = { content: jsonContent(jsonBody) };
  return createRoute({
    method,
    path,
    tags,
    summary,
    description,
    ...(Object.keys(request).length ? { request } : {}),
    responses: responses || { 200: jsonResponse(responseSchema, responseDescription) },
  });
}

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

// ── Exercise search ───────────────────────────────────────────────────────────
const exerciseSearchRoute = createRoute({
  method: "get",
  path: "/exercises/search",
  tags: ["exercises"],
  summary: "Übungssuche lokal + wger-Fallback",
  request: {
    query: z.object({
      q: z.string().optional().default("").openapi({ example: "bankdrücken" }),
      limit: z.coerce.number().int().positive().max(50).optional().default(12),
    }),
  },
  responses: {
    200: {
      description: "Suchergebnisse",
      content: { "application/json": { schema: z.object({ ok: z.boolean(), source: z.string().optional(), results: z.array(z.record(z.string(), z.any())) }) } },
    },
  },
});
app.openapi(exerciseSearchRoute, async (c) => {
  const { q, limit } = c.req.valid("query");
  if (q.length < 1) return c.json({ ok: true, results: [] });
  const local = await searchExercises(q, limit);
  if (local?.results?.length) return c.json(local);
  if (q.length < 2) return c.json({ ok: true, results: [] });
  const data = await fetchWger("/exerciseinfo/", `limit=${limit}&name__search=${encodeURIComponent(q)}&language=2`);
  const results = (data.results || []).map(e => {
    const trans = (e.translations || []).find(t => t.language === 2) || (e.translations || [])[0] || {};
    return {
      id:               `wger_${e.id}`, // Präfix + numerische ID, muss zu importer.py (safe_id = f"wger_{item.id}") passen
      name:             trans.name || "",
      category:         e.category?.name || "",
      primaryMuscles:   (e.muscles           || []).map(m => m.name_en || m.name).filter(Boolean),
      secondaryMuscles: (e.muscles_secondary || []).map(m => m.name_en || m.name).filter(Boolean),
      wger_muscle_ids: {
        primary:   (e.muscles           || []).map(m => m.id),
        secondary: (e.muscles_secondary || []).map(m => m.id),
      },
      source: "wger",
    };
  }).filter(e => e.name);
  return c.json({ ok: true, source: "wger", results });
});

// ── Exercises by muscle group ─────────────────────────────────────────────────
app.openapi(defineJsonRoute({
  method: "get",
  path: "/exercises/by-group",
  tags: ["exercises"],
  summary: "Übungen nach Muskelgruppe",
  query: z.object({ group: z.string().optional().default("") }),
}), async (c) => {
  const { group } = c.req.valid("query");
  // Delegating search logic to agent if possible, but keeping local filter for now
  const normalized = group.toLowerCase().replace(/\s+/g, "_");
  const local = (fitnessData.exercises || []).filter(ex => {
    const primary   = (ex.primary_muscles   || []).map(x => String(x || "").toLowerCase());
    const secondary = (ex.secondary_muscles || []).map(x => String(x || "").toLowerCase());
    const tags      = (ex.tags              || []).map(x => String(x || "").toLowerCase());
    const haystack  = [...primary, ...secondary, ...tags, String(ex.category || "").toLowerCase()];
    return haystack.includes(group.toLowerCase()) || haystack.includes(normalized);
  }).map(ex => ({
    id:       ex.exercise_id,
    name_en:  ex.display_name || ex.name || ex.exercise_id,
    relevance:"primary",
  }));

  if (local.length) return c.json({ ok: true, exercises: local });

  const mappings = fitnessData.wgerMapping?.mappings || {};
  const wgerIds  = Object.entries(mappings).filter(([, id]) => id === group).map(([wId]) => wId);

  let data;
  if (wgerIds.length) {
    data = await fetchWger("/exerciseinfo/", `limit=20&language=2&${wgerIds.map(id => `muscles=${id}`).join("&")}`);
  } else {
    data = await fetchWger("/exerciseinfo/", `limit=20&muscles__name_en__icontains=${encodeURIComponent(group)}&language=2`);
  }
  const exercises = (data.results || []).map(e => {
    const trans = (e.translations || []).find(t => t.language === 2) || (e.translations || [])[0] || {};
    return { id: `wger_${e.id}`, name_en: trans.name || "", relevance: "primary", source: "wger" };
  }).filter(e => e.name_en);
  return c.json({ ok: true, exercises });
});

// ── Exercise teaching (anatomy-kb → catalog/kb/anatomy_teaching) ─────────────
app.openapi(defineJsonRoute({
  method: "get",
  path: "/exercise/{id}/teaching",
  tags: ["exercises"],
  summary: "Teaching/Lesson zu einer Übung",
  params: z.object({ id: z.string() }),
}), async (c) => {
  const id = c.req.param("id");
  try {
    const res = await fetch(`${PYTHON_BASE}/exercise/${id}`);
    const data = await res.json();
    if (!data || !data.lesson) return c.json({ ok: false, error: "no_lesson" }, 404);
    return c.json({ ok: true, lesson: data.lesson });
  } catch (err) {
    return c.json({ ok: false, error: "agent_unreachable" }, 502);
  }
});

// ── Inbox Management ─────────────────────────────────────────────────────────
app.openapi(defineJsonRoute({
  method: "get",
  path: "/fitness/clients",
  tags: ["fitness"],
  summary: "Bekannte Fitness-Clients",
}), (c) => {
  const usersDir = path.join(os.homedir(), ".aos", "fitness", "users");
  const klienten = loadKlientenRegistry();
  const clients = Object.entries(klienten).map(([uid, meta]) => ({ uid, name: meta.name, slug: meta.slug }));
  const knownUids = new Set(clients.map(c => c.uid));

  if (!fs.existsSync(usersDir)) return c.json({ ok: true, clients });

  const uids = fs.readdirSync(usersDir).filter(d =>
    fs.statSync(path.join(usersDir, d)).isDirectory() && !["default", "kb"].includes(d) && !knownUids.has(d)
  );

  for (const uid of uids) {
    let name = uid.slice(0, 8);
    const sessDir = path.join(usersDir, uid, "sessions");
    if (fs.existsSync(sessDir)) {
      const files = fs.readdirSync(sessDir).filter(f => f.endsWith(".json")).sort().reverse();
      if (files.length) {
        const lastSess = readJson(path.join(sessDir, files[0]));
        if (lastSess?.user_name) name = lastSess.user_name;
      }
    }
    clients.push({ uid, name });
  }

  return c.json({ ok: true, clients });
});

app.openapi(defineJsonRoute({
  method: "get",
  path: "/fitness/inbox",
  tags: ["inbox"],
  summary: "Inbox-Entwürfe lesen",
}), async (c) => {
  try {
    const res = await fetch(`${PYTHON_BASE}/fitness/inbox`);
    const data = await res.json();
    return c.json(data);
  } catch (err) {
    return c.json({ ok: false, error: "python_unreachable" }, 502);
  }
});

app.openapi(defineJsonRoute({
  method: "get",
  path: "/fitness/inbox/merge-candidates",
  tags: ["inbox"],
  summary: "Fuzzy-Merge-Kandidaten fuer Inbox-Drafts (Hinweis, kein Auto-Link)",
}), async (c) => {
  try {
    const res = await fetch(`${PYTHON_BASE}/fitness/inbox/merge-candidates`);
    const data = await res.json();
    return c.json(data);
  } catch (err) {
    return c.json({ ok: false, error: "python_unreachable" }, 502);
  }
});

app.openapi(defineJsonRoute({
  method: "post",
  path: "/fitness/inbox/queue",
  tags: ["inbox"],
  summary: "Inbox-Entwurf enqueuen",
  jsonBody: looseObjectSchema,
}), async (c) => {
  try {
    const body = c.req.valid("json");
    const res = await fetch(`${PYTHON_BASE}/fitness/inbox/queue`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return c.json(data, res.status);
  } catch (err) {
    return c.json({ ok: false, error: "python_unreachable" }, 502);
  }
});

app.openapi(defineJsonRoute({
  method: "post",
  path: "/fitness/inbox/{id}/approve",
  tags: ["inbox"],
  summary: "Inbox-Entwurf freigeben",
  params: z.object({ id: z.string() }),
  jsonBody: looseObjectSchema,
}), async (c) => {
  const id = c.req.param("id");
  try {
    const body = c.req.valid("json");
    const res = await fetch(`${PYTHON_BASE}/fitness/inbox/${id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    });
    const data = await res.json();
    return c.json(data, res.status);
  } catch (err) {
    return c.json({ ok: false, error: "python_unreachable" }, 502);
  }
});

app.openapi(defineJsonRoute({
  method: "post",
  path: "/fitness/inbox/{id}/reenrich",
  tags: ["inbox"],
  summary: "Inbox-Entwurf neu anreichern",
  params: z.object({ id: z.string() }),
  jsonBody: looseObjectSchema,
}), async (c) => {
  const id = c.req.param("id");
  try {
    const body = c.req.valid("json");
    const res = await fetch(`${PYTHON_BASE}/fitness/inbox/${id}/reenrich`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return c.json(data, res.status);
  } catch (err) {
    return c.json({ ok: false, error: "python_unreachable" }, 502);
  }
});

app.openapi(defineJsonRoute({
  method: "post",
  path: "/fitness/inbox/{id}/link-source",
  tags: ["inbox"],
  summary: "wger-/yuhonas-Quelle mit Inbox-Entwurf verlinken",
  params: z.object({ id: z.string() }),
  jsonBody: looseObjectSchema,
}), async (c) => {
  const id = c.req.param("id");
  try {
    const body = c.req.valid("json");
    const res = await fetch(`${PYTHON_BASE}/fitness/inbox/${id}/link-source`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return c.json(data, res.status);
  } catch (err) {
    return c.json({ ok: false, error: "python_unreachable" }, 502);
  }
});

app.openapi(defineJsonRoute({
  method: "get",
  path: "/fitness/inbox/{id}/duplicates",
  tags: ["inbox"],
  summary: "Duplicate-Gruppe fuer Inbox-Entwurf pruefen",
  params: z.object({ id: z.string() }),
  query: z.object({ uid: z.string().optional() }).optional(),
}), async (c) => {
  const id = c.req.param("id");
  const uid = c.req.query("uid");
  const suffix = uid ? `?uid=${encodeURIComponent(uid)}` : "";
  try {
    const res = await fetch(`${PYTHON_BASE}/fitness/inbox/${id}/duplicates${suffix}`);
    const data = await res.json();
    return c.json(data, res.status);
  } catch (err) {
    return c.json({ ok: false, error: "python_unreachable" }, 502);
  }
});

app.openapi(defineJsonRoute({
  method: "post",
  path: "/fitness/inbox/{id}/merge-duplicates",
  tags: ["inbox"],
  summary: "Duplicate-Gruppe fuer Inbox-Entwurf zusammenfuehren",
  params: z.object({ id: z.string() }),
  jsonBody: looseObjectSchema,
}), async (c) => {
  const id = c.req.param("id");
  try {
    const body = c.req.valid("json");
    const res = await fetch(`${PYTHON_BASE}/fitness/inbox/${id}/merge-duplicates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return c.json(data, res.status);
  } catch (err) {
    return c.json({ ok: false, error: "python_unreachable" }, 502);
  }
});

app.openapi(defineJsonRoute({
  method: "delete",
  path: "/fitness/inbox/{id}",
  tags: ["inbox"],
  summary: "Inbox-Entwurf löschen",
  params: z.object({ id: z.string() }),
}), async (c) => {
  const id = c.req.param("id");
  try {
    const res = await fetch(`${PYTHON_BASE}/fitness/inbox/${id}`, { method: "DELETE" });
    const data = await res.json();
    return c.json(data, res.status);
  } catch (err) {
    return c.json({ ok: false, error: "python_unreachable" }, 502);
  }
});

// ── Coach Feed (alle Klienten-Workouts, optional auf einen Klienten
// eingeschränkt via ?uid=) ────────────────────────────────────────────────
// Ohne ?uid= wird global über alle Klienten hinweg auf `limit` gedeckelt —
// bei mehreren aktiven Usern (inkl. Coach selbst) können die Einträge eines
// bestimmten Klienten dadurch aus dem Feed fallen, bevor ein
// clientseitiger Filter sie sieht. Mit ?uid= wird gezielt nur dieser eine
// Ordner gelesen, kein globaler Cutoff greift dazwischen.
app.openapi(defineJsonRoute({
  method: "get",
  path: "/fitness/coach/feed",
  tags: ["coach"],
  summary: "Coach-Feed über Workout-Sessions",
  query: z.object({
    limit: z.coerce.number().int().positive().max(500).optional().default(100),
    uid: z.string().optional(),
  }),
}), (c) => {
  const { limit, uid: onlyUid = null } = c.req.valid("query");
  const usersDir = path.join(os.homedir(), ".aos", "fitness", "users");
  if (!fs.existsSync(usersDir)) return c.json({ ok: true, feed: [] });

  const uids = onlyUid
    ? [onlyUid].filter(uid => fs.existsSync(path.join(usersDir, uid)))
    : fs.readdirSync(usersDir).filter(d =>
        fs.statSync(path.join(usersDir, d)).isDirectory() && !["default", "kb"].includes(d)
      );

  const feed = [];
  for (const uid of uids) {
    const sessDir = path.join(os.homedir(), ".aos", "fitness", "users", uid, "sessions");
    if (!fs.existsSync(sessDir)) continue;
    const files = fs.readdirSync(sessDir).filter(f => f.endsWith(".json") && !f.includes("history"));
    for (const f of files) {
      const data = readJson(path.join(sessDir, f));
      if (!data) continue;
      const date = f.replace(".json", "");
      feed.push({
        id: `${uid}__${date}`,
        userId: uid,
        date: data.date || date,
        block: data.block || null,
        exercises: data.exercises || [],
        effort: data.effort ?? null,
        mood: data.mood || "",
        notes: data.notes || "",
        coachFeedback: data.coachFeedback || "",
        type: "workout",
      });
    }
  }

  feed.sort((a, b) => b.date.localeCompare(a.date));
  return c.json({ ok: true, feed: feed.slice(0, limit) });
});

// uid -> { name, slug } aus ~/Klienten/*/client.json (firebase_uid / firebase_uids).
// Das ist die eigentliche SOT für Klientennamen (siehe fitness-sync add-client) —
// vorher riet /fitness/coach/profiles nur aus der letzten Session oder zeigte
// die rohe UID an, obwohl der Klient hier längst mit echtem Namen registriert ist.
function loadKlientenRegistry() {
  const dir = path.join(os.homedir(), "Klienten");
  const registry = {};
  if (!fs.existsSync(dir)) return registry;
  for (const slug of fs.readdirSync(dir)) {
    const cfgPath = path.join(dir, slug, "client.json");
    if (!fs.existsSync(cfgPath)) continue;
    const cfg = readJson(cfgPath);
    if (!cfg) continue;
    const uids = new Set(cfg.firebase_uids || []);
    if (cfg.firebase_uid) uids.add(cfg.firebase_uid);
    for (const uid of uids) {
      if (uid) registry[uid] = { name: cfg.name, slug };
    }
  }
  return registry;
}

app.openapi(defineJsonRoute({
  method: "get",
  path: "/fitness/coach/profiles",
  tags: ["coach"],
  summary: "Coach-Profile für bekannte UIDs",
}), (c) => {
  const usersDir = path.join(os.homedir(), ".aos", "fitness", "users");
  const klienten = loadKlientenRegistry();
  const profiles = {};

  for (const [uid, meta] of Object.entries(klienten)) {
    profiles[uid] = { displayName: meta.name, uid, slug: meta.slug };
  }

  if (!fs.existsSync(usersDir)) return c.json({ ok: true, profiles });

  const uids = fs.readdirSync(usersDir).filter(d =>
    fs.statSync(path.join(usersDir, d)).isDirectory() && !["default", "kb"].includes(d)
  );

  for (const uid of uids) {
    if (profiles[uid]) continue; // Klienten-Registry hat Vorrang
    const sessDir = path.join(os.homedir(), ".aos", "fitness", "users", uid, "sessions");
    let displayName = uid.slice(0, 8);
    if (fs.existsSync(sessDir)) {
      const files = fs.readdirSync(sessDir).filter(f => f.endsWith(".json")).sort().reverse();
      if (files.length) {
        const lastSess = readJson(path.join(sessDir, files[0]));
        if (lastSess?.user_name) displayName = lastSess.user_name;
        else if (lastSess?.user_email) displayName = lastSess.user_email;
      }
    }
    profiles[uid] = { displayName, uid };
  }
  return c.json({ ok: true, profiles });
});

app.openapi(defineJsonRoute({
  method: "post",
  path: "/fitness/coach/feedback",
  tags: ["coach"],
  summary: "Coach-Feedback in Session schreiben",
  jsonBody: z.object({
    userId: z.string().optional(),
    sessionId: z.string().optional(),
    text: z.string().optional(),
  }).loose(),
}), async (c) => {
  const { userId, sessionId, text } = c.req.valid("json");
  if (!userId || !sessionId || !text) return c.json({ ok: false, error: "missing fields" }, 400);

  const sessFile = path.join(os.homedir(), ".aos", "fitness", "users", userId, "sessions", `${sessionId.replace(`${userId}__`, "")}.json`);
  if (!fs.existsSync(sessFile)) return c.json({ ok: false, error: "session not found" }, 404);

  const data = readJson(sessFile, {});
  writeJson(sessFile, { ...data, coachFeedback: text, feedbackAt: new Date().toISOString() });
  return c.json({ ok: true });
});

// ── Coach-AssignedPlans (lokal, ~/.aos/fitness/users/<uid>/plans/) ───────────
// Kein Firestore-Only-Stub mehr: Coach baut lokal einen Plan (z.B. via
// /fitness/plan) und pusht ihn hier direkt in den User-Ordner des Klienten.
function clientPlansDir(uid) {
  return path.join(os.homedir(), ".aos", "fitness", "users", uid, "plans");
}

app.openapi(defineJsonRoute({
  method: "get",
  path: "/fitness/coach/plans/{clientUid}",
  tags: ["coach"],
  summary: "Zugewiesene Pläne eines Klienten",
  params: z.object({ clientUid: z.string() }),
  query: z.object({ coachUid: z.string().optional().default("") }),
}), (c) => {
  const { coachUid } = c.req.valid("query");
  const clientUid = c.req.param("clientUid");
  const dir = clientPlansDir(clientUid);
  if (!fs.existsSync(dir)) return c.json({ ok: true, plans: [] });
  const plans = fs.readdirSync(dir)
    .filter(f => f.endsWith(".json"))
    .map(f => readJson(path.join(dir, f)))
    .filter(p => p && (!coachUid || p.createdBy === coachUid));
  return c.json({ ok: true, plans });
});

// ── Split-Zyklus-Habit-Tracking (Coach legt fest, welche `block`-Tags als
// Zyklus gezählt werden + Zielzahl, z.B. Push/Pull/Legs x10) ────────────────
function habitCycleFile(uid) {
  return path.join(os.homedir(), ".aos", "fitness", "users", uid, "habit-cycle.json");
}

app.openapi(defineJsonRoute({
  method: "get",
  path: "/fitness/coach/habit-cycle/{clientUid}",
  tags: ["coach"],
  summary: "Habit-Cycle-Konfiguration eines Klienten",
  params: z.object({ clientUid: z.string() }),
}), (c) => {
  const clientUid = c.req.param("clientUid");
  return c.json({ ok: true, config: readJson(habitCycleFile(clientUid), { tags: [], targetCycles: 0 }) });
});

app.openapi(defineJsonRoute({
  method: "post",
  path: "/fitness/coach/habit-cycle/{clientUid}",
  tags: ["coach"],
  summary: "Habit-Cycle-Konfiguration speichern",
  params: z.object({ clientUid: z.string() }),
  jsonBody: z.object({
    tags: z.array(z.string()).optional(),
    targetCycles: z.coerce.number().int().min(0).optional(),
  }).loose(),
}), async (c) => {
  const clientUid = c.req.param("clientUid");
  const body = c.req.valid("json");
  const config = { tags: Array.isArray(body.tags) ? body.tags : [], targetCycles: body.targetCycles || 0 };
  writeJson(habitCycleFile(clientUid), config);
  return c.json({ ok: true, config });
});

app.openapi(defineJsonRoute({
  method: "post",
  path: "/fitness/coach/plans/{clientUid}",
  tags: ["coach"],
  summary: "Plan einem Klienten zuweisen",
  params: z.object({ clientUid: z.string() }),
  jsonBody: z.object({
    coachUid: z.string().optional(),
    plan: looseObjectSchema.optional(),
  }).loose(),
}), async (c) => {
  const clientUid = c.req.param("clientUid");
  const body = c.req.valid("json");
  const { coachUid, plan } = body;
  if (!coachUid || !plan) return c.json({ ok: false, error: "missing fields" }, 400);

  const dir = clientPlansDir(clientUid);
  fs.mkdirSync(dir, { recursive: true });
  const id = plan.id || `plan_${Date.now()}`;
  const record = {
    ...plan,
    id,
    createdBy: coachUid,
    assignedTo: clientUid,
    assignedAt: new Date().toISOString(),
  };
  writeJson(path.join(dir, `${id}.json`), record);
  return c.json({ ok: true, plan: record });
});

app.openapi(defineJsonRoute({
  method: "get",
  path: "/fitness/coach/plans/{clientUid}/{planId}/progress",
  tags: ["coach"],
  summary: "Fortschritt eines zugewiesenen Plans",
  params: z.object({ clientUid: z.string(), planId: z.string() }),
  query: z.object({ date: z.string().optional() }),
}), (c) => {
  const { date: todayQ } = c.req.valid("query");
  const clientUid = c.req.param("clientUid");
  const planId    = c.req.param("planId");
  const plan = readJson(path.join(clientPlansDir(clientUid), `${planId}.json`));
  if (!plan) return c.json({ ok: true, progress: null });

  const today = todayQ || localToday();
  const completion = readJson(path.join(clientPlansDir(clientUid), planId, "completions", `${today}.json`));
  const exercises  = plan.exercises || [];
  const doneCount  = completion?.doneExerciseIds?.length || 0;

  return c.json({
    ok: true,
    progress: {
      planId,
      planName: plan.name || "Unnamed Plan",
      totalExercises: exercises.length,
      doneExercises: doneCount,
      completionPercentage: exercises.length > 0 ? Math.round((doneCount / exercises.length) * 100) : 0,
      lastUpdate: completion?.completedAt || null,
    },
  });
});

// Klienten-Seite: eigene zugewiesene Pläne lesen + Completions togglen.
app.openapi(defineJsonRoute({
  method: "get",
  path: "/fitness/plans/assigned",
  tags: ["fitness"],
  summary: "Dem User zugewiesene Pläne",
  query: z.object({ uid: z.string().optional() }),
}), (c) => {
  const { uid: uidQ } = c.req.valid("query");
  const uid = uidQ || c.req.header("X-User-UID") || FITNESS_UID;
  const dir = clientPlansDir(uid);
  if (!fs.existsSync(dir)) return c.json({ ok: true, plans: [] });
  const plans = fs.readdirSync(dir)
    .filter(f => f.endsWith(".json"))
    .map(f => readJson(path.join(dir, f)))
    .filter(Boolean);
  return c.json({ ok: true, plans });
});

app.openapi(defineJsonRoute({
  method: "post",
  path: "/fitness/plans/{planId}/completions",
  tags: ["fitness"],
  summary: "Plan-Completions schreiben oder togglen",
  params: z.object({ planId: z.string() }),
  query: z.object({ uid: z.string().optional() }),
  jsonBody: z.object({
    date: z.string().optional(),
    doneExerciseIds: z.array(z.string()).optional(),
    exerciseId: z.string().optional(),
  }).loose(),
}), async (c) => {
  const { uid: uidQ } = c.req.valid("query");
  const planId = c.req.param("planId");
  const uid    = uidQ || c.req.header("X-User-UID") || FITNESS_UID;
  const body   = c.req.valid("json");
  const date   = body.date || localToday();

  const dir  = path.join(clientPlansDir(uid), planId, "completions");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${date}.json`);
  const current = readJson(file) || { date, doneExerciseIds: [] };
  const doneSet = new Set(current.doneExerciseIds || []);

  if (Array.isArray(body.doneExerciseIds)) {
    doneSet.clear();
    body.doneExerciseIds.forEach(id => doneSet.add(id));
  } else if (body.exerciseId) {
    if (doneSet.has(body.exerciseId)) doneSet.delete(body.exerciseId);
    else doneSet.add(body.exerciseId);
  }

  const record = { date, doneExerciseIds: [...doneSet], completedAt: new Date().toISOString() };
  writeJson(file, record);
  return c.json({ ok: true, completion: record });
});

// ── Fitness config / search / plan / weekly / export ─────────────────────────
app.openapi(defineJsonRoute({
  method: "get",
  path: "/fitness/config",
  tags: ["fitness"],
  summary: "Lokale Fitness-Konfiguration",
}), (c) =>
  c.json({
    ok:         true,
    config:     fitnessData.config,
    exportPath: obsidianTargetPath(),
    root:       fitnessData.config?.paths?.root || "~/.fitness-agent",
    source:     "local_yaml",
  })
);

app.openapi(defineJsonRoute({
  method: "get",
  path: "/fitness/search",
  tags: ["fitness"],
  summary: "Exercize Search mit Source-Auswahl",
  query: z.object({
    q: z.string().optional().default(""),
    limit: z.coerce.number().int().positive().max(50).optional().default(12),
    sources: z.string().optional().default("wger,yuhonas"),
  }),
}), async (c) => {
  const { q, limit, sources } = c.req.valid("query");
  return c.json(await searchExercises(q, limit, sources));
});

app.openapi(defineJsonRoute({
  method: "get",
  path: "/fitness/exercises/all",
  tags: ["fitness"],
  summary: "Alle lokalen Übungen",
}), (c) => {
  return c.json({ ok: true, exercises: fitnessData.exercises || [] });
});

app.openapi(defineJsonRoute({
  method: "get",
  path: "/fitness/muscles",
  tags: ["fitness"],
  summary: "Muskelindex laden",
}), async (c) => {
  try {
    const res = await fetch(`${PYTHON_BASE}/fitness/muscles`);
    return c.json(await res.json());
  } catch (err) {
    return c.json({ ok: false, error: "agent_unreachable" }, 502);
  }
});

app.openapi(defineJsonRoute({
  method: "get",
  path: "/fitness/muscles/{id}",
  tags: ["fitness"],
  summary: "Muskel-Detail laden",
  params: z.object({ id: z.string() }),
}), async (c) => {
  const id = c.req.param("id");
  try {
    const res = await fetch(`${PYTHON_BASE}/fitness/muscles`);
    const data = await res.json();
    const muscle = data.muscles?.[id];
    if (!muscle) return c.json({ ok: false, error: "not_found" }, 404);
    return c.json(muscle);
  } catch (err) {
    return c.json({ ok: false, error: "agent_unreachable" }, 502);
  }
});

const fitnessPlanRoute = createRoute({
  method: "get",
  path: "/fitness/plan",
  tags: ["fitness"],
  summary: "Trainingsplan-Generator",
  request: {
    query: z.object({
      template: z.string().optional().default(""),
      split: z.string().optional().default(""),
      day: z.string().optional().default(""),
      goal: z.string().optional().default(""),
    }),
  },
  responses: {
    200: { description: "Generierter Plan", content: { "application/json": { schema: z.record(z.string(), z.any()) } } },
  },
});
app.openapi(fitnessPlanRoute, async (c) => {
  const { template, split, day, goal } = c.req.valid("query");
  return c.json(await buildPlan({ template, split, day, goal }));
});

app.openapi(defineJsonRoute({
  method: "get",
  path: "/fitness/weekly",
  tags: ["fitness"],
  summary: "Wochensummary",
  query: z.object({ week: z.string().optional().default("current") }),
}), async (c) => {
  const { week } = c.req.valid("query");
  try { return c.json(await getWeeklySummary(week)); }
  catch (e) { return c.json({ ok: false, error: e.message }, 500); }
});

app.openapi(defineJsonRoute({
  method: "post",
  path: "/fitness/export",
  tags: ["fitness"],
  summary: "Export erzeugen",
  jsonBody: looseObjectSchema,
}), async (c) => {
  const data = c.req.valid("json");
  const kind = String(data.kind || "").trim();
  try {
    if (kind === "session") {
      const result = exportSessionMarkdown(data.session || data);
      return c.json({ ok: true, kind, ...result });
    }
    if (kind === "exercise_sheet") {
      const query = String(data.query || data.exercise_id || "").trim();
      if (!query) return c.json({ ok: false, error: "missing_query" }, 400);
      return c.json({ ok: true, kind, ...await exportWithPython("exercise_sheet", { query, force: !!data.force }) });
    }
    if (kind === "exercise_lesson") {
      const exercise_id = String(data.exercise_id || "").trim();
      if (!exercise_id) return c.json({ ok: false, error: "missing_exercise_id" }, 400);
      return c.json({ ok: true, kind, ...await exportWithPython("exercise_lesson", { exercise_id, mode: data.mode || "trainer", force: !!data.force }) });
    }
    if (kind === "plan") {
      const plan   = data.plan || await buildPlan(data.plan_options || data);
      return c.json({ ok: true, kind, ...await exportWithPython("plan", { plan, force: !!data.force }) });
    }
    if (kind === "weekly") {
      return c.json({ ok: true, kind, ...await exportWithPython("weekly", { week_selector: data.week_selector || "current", force: !!data.force }) });
    }
    return c.json({ ok: false, error: "unknown_export_kind" }, 400);
  } catch (error) {
    return c.json({ ok: false, error: "export_failed", details: String(error?.message || error) }, 500);
  }
});

app.openapi(defineJsonRoute({
  method: "get",
  path: "/plan/today",
  tags: ["plan"],
  summary: "Heutige Plan-Suggestion",
  query: z.object({ date: z.string().optional() }),
}), (c) => {
  const { date: dateQ } = c.req.valid("query");
  const date = dateQ || localToday();
  const plan = readJson(path.join(DATA_DIR, "plan.json"));
  const einheiten = (plan && plan.einheiten) || [];

  // Letztes geloggtes Workout ermitteln (block-Feld), unabhängig vom Wochentag.
  const sessionsDir = path.join(DATA_DIR, "sessions");
  const files = fs.existsSync(sessionsDir)
    ? fs.readdirSync(sessionsDir).filter((name) => name.endsWith(".json")).sort().reverse()
    : [];
  let lastBlock = null, lastLoggedAt = null;
  for (const name of files) {
    const sess = readJson(path.join(sessionsDir, name), {});
    if (sess?.block) {
      lastBlock = sess.block;
      lastLoggedAt = sess.date || name.replace(".json", "").split("__")[0];
      break;
    }
  }

  // Rotation statt Wochentag-Matching: nächste Einheit nach der zuletzt geloggten.
  if (einheiten.length) {
    const lastIdx = einheiten.findIndex((e) => e.name === lastBlock);
    const next = einheiten[lastIdx === -1 ? 0 : (lastIdx + 1) % einheiten.length];
    const exercises = (next.abschnitte || []).flatMap((a) => (a.übungen || a.uebungen || []).map((u) => u.name));
    return c.json({ ok: true, suggestion: { block: next.name, exercises, lastBlock, lastLoggedAt } });
  }

  const dow  = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"][new Date(date + "T12:00:00").getDay()];
  const fallback = {
    Mo: { block: "Push",      exercises: ["Incline Dumbbell Press", "Dips", "Lateral Raise", "Cable Fly", "Triceps Extension"] },
    Di: { block: "Pull",      exercises: ["Pull-Up", "Row", "Lat Pulldown", "Face Pull", "Biceps Curl"] },
    Mi: { block: "Legs",      exercises: ["Squat", "Romanian Deadlift", "Lunge", "Leg Curl", "Calf Raise"] },
    Do: { block: "Upper",     exercises: ["Bench Press", "Row", "Overhead Press", "Pulldown", "Curl"] },
    Fr: { block: "Lower",     exercises: ["Deadlift", "Split Squat", "Hip Thrust", "Leg Curl", "Calf Raise"] },
    Sa: { block: "Full Body", exercises: ["Squat", "Press", "Row", "Hinge", "Carry"] },
    So: { block: "Recovery",  exercises: ["Mobility", "Walk", "Core Breathing"] },
  }[dow] || { block: "Full Body", exercises: ["Squat", "Press", "Row"] };
  return c.json({ ok: true, suggestion: { day: dow, block: fallback.block, exercises: fallback.exercises, lastBlock, lastLoggedAt } });
});

// ── Blocks ────────────────────────────────────────────────────────────────────
app.openapi(defineJsonRoute({
  method: "get",
  path: "/blocks",
  tags: ["plan"],
  summary: "Verfügbare Trainingsblöcke",
}), (c) => {
  const plan   = readJson(path.join(DATA_DIR, "plan.json"));
  const blocks = defaultBlocks();
  for (const unit of (plan?.einheiten || [])) {
    const id = String(unit.name || "").trim().toLowerCase().replace(/\s+/g, "_");
    if (!id) continue;
    const label         = String(unit.name || "").trim() || id;
    const muscle_groups = Array.isArray(unit.muscle_groups) ? unit.muscle_groups : [];
    const existing      = blocks.find(b => b.id === id);
    if (existing) {
      existing.label         = label || existing.label;
      existing.muscle_groups = [...new Set([...(existing.muscle_groups || []), ...muscle_groups])];
    } else {
      blocks.push({ id, label, muscle_groups });
    }
  }
  return c.json({ ok: true, blocks });
});

// ── Routines / Workouts ───────────────────────────────────────────────────────
// Reine Proxies zu fitness-api (Python, :9150) — Node hält hier absichtlich
// keine eigene Logik/keinen eigenen Datenschreiber mehr (war vorher
// routines.json/workouts.json direkt in Node gelesen/geschrieben, parallel
// zum späteren Python-Äquivalent möglich → zwei unabhängige Writer auf
// dieselbe Datei). Alles Neue kommt nur noch in fitness/api/routers/*.py.
async function proxyToPython(c, pythonPath) {
  const qs = c.req.query();
  const search = new URLSearchParams(qs).toString();
  const url = `${PYTHON_BASE}${pythonPath}${search ? `?${search}` : ""}`;
  const init = { method: c.req.method, headers: {} };
  const uid = c.req.header("X-User-UID");
  if (uid) init.headers["X-User-UID"] = uid;
  if (!["GET", "HEAD"].includes(c.req.method)) {
    init.headers["Content-Type"] = "application/json";
    init.body = await c.req.text();
  }
  try {
    const res = await fetch(url, init);
    const text = await res.text();
    return c.body(text, res.status, { "Content-Type": res.headers.get("content-type") || "application/json" });
  } catch (err) {
    return c.json({ ok: false, error: "fitness_api_unreachable", details: String(err?.message || err) }, 502);
  }
}

app.openapi(defineJsonRoute({
  method: "get",
  path: "/coaching-notes",
  tags: ["coaching-notes"],
  summary: "Coaching-Notes Liste",
}), (c) => proxyToPython(c, "/coaching-notes"));
app.openapi(defineJsonRoute({
  method: "get",
  path: "/coaching-notes/product-signals",
  tags: ["coaching-notes"],
  summary: "Coaching-Notes Product Signals",
}), (c) => proxyToPython(c, "/coaching-notes/product-signals"));
app.openapi(defineJsonRoute({
  method: "get",
  path: "/coaching-notes/{id}",
  tags: ["coaching-notes"],
  summary: "Coaching-Note Detail",
  params: z.object({ id: z.string() }),
}), (c) => proxyToPython(c, `/coaching-notes/${c.req.param("id")}`));

app.openapi(defineJsonRoute({
  method: "get",
  path: "/routines",
  tags: ["routines"],
  summary: "Routines Liste",
}), (c) => proxyToPython(c, "/routines"));
app.openapi(defineJsonRoute({
  method: "post",
  path: "/routines",
  tags: ["routines"],
  summary: "Routine anlegen",
  jsonBody: looseObjectSchema,
}), (c) => proxyToPython(c, "/routines"));
app.openapi(defineJsonRoute({
  method: "get",
  path: "/routines/{id}",
  tags: ["routines"],
  summary: "Routine Detail",
  params: z.object({ id: z.string() }),
}), (c) => proxyToPython(c, `/routines/${c.req.param("id")}`));
app.openapi(defineJsonRoute({
  method: "patch",
  path: "/routines/{id}",
  tags: ["routines"],
  summary: "Routine aktualisieren",
  params: z.object({ id: z.string() }),
  jsonBody: looseObjectSchema,
}), (c) => proxyToPython(c, `/routines/${c.req.param("id")}`));
app.openapi(defineJsonRoute({
  method: "delete",
  path: "/routines/{id}",
  tags: ["routines"],
  summary: "Routine löschen",
  params: z.object({ id: z.string() }),
}), (c) => proxyToPython(c, `/routines/${c.req.param("id")}`));
app.openapi(defineJsonRoute({
  method: "post",
  path: "/routines/{id}/exercises",
  tags: ["routines"],
  summary: "Übung an Routine anhängen",
  params: z.object({ id: z.string() }),
  jsonBody: looseObjectSchema,
}), (c) => proxyToPython(c, `/routines/${c.req.param("id")}/exercises`));
app.openapi(defineJsonRoute({
  method: "put",
  path: "/routines/{id}/exercises/order",
  tags: ["routines"],
  summary: "Routine-Übungsreihenfolge speichern",
  params: z.object({ id: z.string() }),
  jsonBody: looseObjectSchema,
}), (c) => proxyToPython(c, `/routines/${c.req.param("id")}/exercises/order`));
app.openapi(defineJsonRoute({
  method: "patch",
  path: "/routines/{id}/exercises/{eid}",
  tags: ["routines"],
  summary: "Routine-Übung aktualisieren",
  params: z.object({ id: z.string(), eid: z.string() }),
  jsonBody: looseObjectSchema,
}), (c) => proxyToPython(c, `/routines/${c.req.param("id")}/exercises/${c.req.param("eid")}`));
app.openapi(defineJsonRoute({
  method: "delete",
  path: "/routines/{id}/exercises/{eid}",
  tags: ["routines"],
  summary: "Routine-Übung löschen",
  params: z.object({ id: z.string(), eid: z.string() }),
}), (c) => proxyToPython(c, `/routines/${c.req.param("id")}/exercises/${c.req.param("eid")}`));

app.openapi(defineJsonRoute({
  method: "get",
  path: "/workouts",
  tags: ["workouts"],
  summary: "Workouts Liste",
}), (c) => proxyToPython(c, "/workouts"));
app.openapi(defineJsonRoute({
  method: "post",
  path: "/workouts",
  tags: ["workouts"],
  summary: "Workout anlegen",
  jsonBody: looseObjectSchema,
}), (c) => proxyToPython(c, "/workouts"));
app.openapi(defineJsonRoute({
  method: "get",
  path: "/workouts/{id}",
  tags: ["workouts"],
  summary: "Workout Detail",
  params: z.object({ id: z.string() }),
}), (c) => proxyToPython(c, `/workouts/${c.req.param("id")}`));
app.openapi(defineJsonRoute({
  method: "patch",
  path: "/workouts/{id}",
  tags: ["workouts"],
  summary: "Workout aktualisieren",
  params: z.object({ id: z.string() }),
  jsonBody: looseObjectSchema,
}), (c) => proxyToPython(c, `/workouts/${c.req.param("id")}`));
app.openapi(defineJsonRoute({
  method: "delete",
  path: "/workouts/{id}",
  tags: ["workouts"],
  summary: "Workout löschen",
  params: z.object({ id: z.string() }),
}), (c) => proxyToPython(c, `/workouts/${c.req.param("id")}`));
app.openapi(defineJsonRoute({
  method: "post",
  path: "/workouts/{id}/exercises",
  tags: ["workouts"],
  summary: "Übung an Workout anhängen",
  params: z.object({ id: z.string() }),
  jsonBody: looseObjectSchema,
}), (c) => proxyToPython(c, `/workouts/${c.req.param("id")}/exercises`));
app.openapi(defineJsonRoute({
  method: "put",
  path: "/workouts/{id}/exercises/order",
  tags: ["workouts"],
  summary: "Workout-Übungsreihenfolge speichern",
  params: z.object({ id: z.string() }),
  jsonBody: looseObjectSchema,
}), (c) => proxyToPython(c, `/workouts/${c.req.param("id")}/exercises/order`));
app.openapi(defineJsonRoute({
  method: "delete",
  path: "/workouts/{id}/exercises/{eid}",
  tags: ["workouts"],
  summary: "Workout-Übung löschen",
  params: z.object({ id: z.string(), eid: z.string() }),
}), (c) => proxyToPython(c, `/workouts/${c.req.param("id")}/exercises/${c.req.param("eid")}`));
app.openapi(defineJsonRoute({
  method: "post",
  path: "/workouts/{id}/exercises/{eid}/sets",
  tags: ["workouts"],
  summary: "Set an Workout-Übung anhängen",
  params: z.object({ id: z.string(), eid: z.string() }),
  jsonBody: looseObjectSchema,
}), (c) => proxyToPython(c, `/workouts/${c.req.param("id")}/exercises/${c.req.param("eid")}/sets`));
app.openapi(defineJsonRoute({
  method: "patch",
  path: "/workouts/{id}/exercises/{eid}/sets/{sid}",
  tags: ["workouts"],
  summary: "Workout-Set aktualisieren",
  params: z.object({ id: z.string(), eid: z.string(), sid: z.string() }),
  jsonBody: looseObjectSchema,
}), (c) => proxyToPython(c, `/workouts/${c.req.param("id")}/exercises/${c.req.param("eid")}/sets/${c.req.param("sid")}`));
app.openapi(defineJsonRoute({
  method: "delete",
  path: "/workouts/{id}/exercises/{eid}/sets/{sid}",
  tags: ["workouts"],
  summary: "Workout-Set löschen",
  params: z.object({ id: z.string(), eid: z.string(), sid: z.string() }),
}), (c) => proxyToPython(c, `/workouts/${c.req.param("id")}/exercises/${c.req.param("eid")}/sets/${c.req.param("sid")}`));

// ── Makrozyklen (Coach-Trainingszyklus, rotierend, kein Kalender) ──────────
// Nachgebaut 2026-09-05: fitness/api/routers/macrocycles.py war bereits
// vollständig implementiert + registriert (main.py), nur der Node-Proxy
// fehlte hier — dieselbe Lücke wie ursprünglich bei /routines/{id}. Lokaler
// Dev-Server (@db → lib/db/local/macrocycles.js) rief bisher ins Leere,
// TodayPlan-Gate (Session-Tab) konnte lokal nie einen echten Zyklus laden.
app.openapi(defineJsonRoute({
  method: "get",
  path: "/fitness/coach/macrocycles/{clientUid}",
  tags: ["macrocycles"],
  summary: "Makrozyklen eines Klienten auflisten",
  params: z.object({ clientUid: z.string() }),
}), (c) => proxyToPython(c, `/fitness/coach/macrocycles/${c.req.param("clientUid")}`));
app.openapi(defineJsonRoute({
  method: "post",
  path: "/fitness/coach/macrocycles/{clientUid}",
  tags: ["macrocycles"],
  summary: "Makrozyklus anlegen",
  params: z.object({ clientUid: z.string() }),
  jsonBody: looseObjectSchema,
}), (c) => proxyToPython(c, `/fitness/coach/macrocycles/${c.req.param("clientUid")}`));
app.openapi(defineJsonRoute({
  method: "get",
  path: "/fitness/coach/macrocycles/{clientUid}/{cycleId}",
  tags: ["macrocycles"],
  summary: "Makrozyklus-Detail (inkl. Completions, nextRoutineIndex, Rest-Status)",
  params: z.object({ clientUid: z.string(), cycleId: z.string() }),
}), (c) => proxyToPython(c, `/fitness/coach/macrocycles/${c.req.param("clientUid")}/${c.req.param("cycleId")}`));
app.openapi(defineJsonRoute({
  method: "delete",
  path: "/fitness/coach/macrocycles/{clientUid}/{cycleId}",
  tags: ["macrocycles"],
  summary: "Makrozyklus löschen",
  params: z.object({ clientUid: z.string(), cycleId: z.string() }),
}), (c) => proxyToPython(c, `/fitness/coach/macrocycles/${c.req.param("clientUid")}/${c.req.param("cycleId")}`));
app.openapi(defineJsonRoute({
  method: "post",
  path: "/fitness/coach/macrocycles/{clientUid}/{cycleId}/routines",
  tags: ["macrocycles"],
  summary: "Routine (Push/Pull/Legs/...) zu Makrozyklus hinzufügen",
  params: z.object({ clientUid: z.string(), cycleId: z.string() }),
  jsonBody: looseObjectSchema,
}), (c) => proxyToPython(c, `/fitness/coach/macrocycles/${c.req.param("clientUid")}/${c.req.param("cycleId")}/routines`));
app.openapi(defineJsonRoute({
  method: "put",
  path: "/fitness/coach/macrocycles/{clientUid}/{cycleId}/routines/{routineId}",
  tags: ["macrocycles"],
  summary: "Routine aktualisieren",
  params: z.object({ clientUid: z.string(), cycleId: z.string(), routineId: z.string() }),
  jsonBody: looseObjectSchema,
}), (c) => proxyToPython(c, `/fitness/coach/macrocycles/${c.req.param("clientUid")}/${c.req.param("cycleId")}/routines/${c.req.param("routineId")}`));
app.openapi(defineJsonRoute({
  method: "delete",
  path: "/fitness/coach/macrocycles/{clientUid}/{cycleId}/routines/{routineId}",
  tags: ["macrocycles"],
  summary: "Routine löschen",
  params: z.object({ clientUid: z.string(), cycleId: z.string(), routineId: z.string() }),
}), (c) => proxyToPython(c, `/fitness/coach/macrocycles/${c.req.param("clientUid")}/${c.req.param("cycleId")}/routines/${c.req.param("routineId")}`));
app.openapi(defineJsonRoute({
  method: "post",
  path: "/fitness/coach/macrocycles/{clientUid}/{cycleId}/complete",
  tags: ["macrocycles"],
  summary: "Routine als erledigt abhaken (Completion mit tatsächlicher Leistung)",
  params: z.object({ clientUid: z.string(), cycleId: z.string() }),
  jsonBody: looseObjectSchema,
}), (c) => proxyToPython(c, `/fitness/coach/macrocycles/${c.req.param("clientUid")}/${c.req.param("cycleId")}/complete`));
app.openapi(defineJsonRoute({
  method: "get",
  path: "/fitness/coach/macrocycles/{clientUid}/{cycleId}/routines/{routineId}/last",
  tags: ["macrocycles"],
  summary: "Letzte Completion einer Routine (Progressions-Referenz)",
  params: z.object({ clientUid: z.string(), cycleId: z.string(), routineId: z.string() }),
}), (c) => proxyToPython(c, `/fitness/coach/macrocycles/${c.req.param("clientUid")}/${c.req.param("cycleId")}/routines/${c.req.param("routineId")}/last`));

// ── KI-Insights (Trainingslücken-Check + Drafts) — Logik lebt in Python
// (fitness/log/console/{gap_check,drafts}.py, portiert nach coaching.py),
// Node ist hier reiner Proxy wie bei macrocycles oben.
app.openapi(defineJsonRoute({
  method: "get",
  path: "/fitness/coach/gaps",
  tags: ["coach"],
  summary: "Einmal-Check: Trainingslücken aktiver Klienten (optional ?uid=)",
  query: z.object({ uid: z.string().optional() }),
}), (c) => proxyToPython(c, "/fitness/coach/gaps"));
app.openapi(defineJsonRoute({
  method: "get",
  path: "/fitness/coach/drafts",
  tags: ["coach"],
  summary: "Persistierte KI-Drafts (Gap-Erklärungen/Feedback), optional ?uid=&status=",
  query: z.object({ uid: z.string().optional(), status: z.string().optional() }),
}), (c) => proxyToPython(c, "/fitness/coach/drafts"));
app.openapi(defineJsonRoute({
  method: "post",
  path: "/fitness/coach/drafts/{draftId}/review",
  tags: ["coach"],
  summary: "Draft freigeben/verwerfen (status: approved|dismissed)",
  params: z.object({ draftId: z.string() }),
  jsonBody: looseObjectSchema,
}), (c) => proxyToPython(c, `/fitness/coach/drafts/${c.req.param("draftId")}/review`));

// Einzelnen Finisher aus activityAddons löschen — Node selbst kennt kein
// Addon-Merging (siehe /session oben, reiner 1:1-Dateischreiber), die
// Löschlogik lebt nur in Python (fitness/api/routers/sessions.py).
app.openapi(defineJsonRoute({
  method: "delete",
  path: "/session/activity",
  tags: ["session"],
  summary: "Activity-Finisher aus Session löschen",
  query: z.object({
    date: z.string().optional(),
    id: z.string().optional(),
    activityId: z.string().optional(),
    uid: z.string().optional(),
  }).loose(),
}), (c) => proxyToPython(c, "/session/activity"));

// ── Session ───────────────────────────────────────────────────────────────────
// Multi-Session Schema:
//   Filename: YYYY-MM-DD.json (legacy / Default-Session des Tages)
//             YYYY-MM-DD__<sessionId>.json (zusätzliche Sessions am gleichen Tag)
//   Query  ?id=<sessionId> wählt eine spezifische Session, sonst Default.
function sessionFileName(date, id) {
  return id ? `${date}__${id}.json` : `${date}.json`;
}
function parseSessionFile(fname) {
  const base = fname.replace(/\.json$/, "");
  const [date, id] = base.split("__");
  return { date, id: id || null };
}

app.openapi(defineJsonRoute({
  method: "get",
  path: "/session",
  tags: ["session"],
  summary: "Eine Session für Datum plus optional ID laden",
  query: z.object({
    uid: z.string().optional(),
    date: z.string().optional(),
    id: z.string().optional(),
  }),
}), (c) => {
  const { uid: uidQ, date: dateQ, id: idQ } = c.req.valid("query");
  const uid  = uidQ || c.req.header("X-User-UID") || FITNESS_UID;
  const date = dateQ || localToday();
  const id   = idQ || null;
  const file = path.join(os.homedir(), ".aos", "fitness", "users", uid, "sessions", sessionFileName(date, id));
  const data = readJson(file);
  return c.json({ ok: true, data: data || null });
});

app.openapi(defineJsonRoute({
  method: "get",
  path: "/sessions",
  tags: ["session"],
  summary: "Alle Sessions eines Tages laden",
  query: z.object({
    uid: z.string().optional(),
    date: z.string().optional(),
  }),
}), (c) => {
  const { uid: uidQ, date: dateQ } = c.req.valid("query");
  const uid  = uidQ || c.req.header("X-User-UID") || FITNESS_UID;
  const date = dateQ || localToday();
  const dir  = path.join(os.homedir(), ".aos", "fitness", "users", uid, "sessions");
  if (!fs.existsSync(dir)) return c.json({ ok: true, sessions: [] });
  const sessions = fs.readdirSync(dir)
    .filter(f => f.endsWith(".json") && f.startsWith(date))
    .map(f => {
      const meta = parseSessionFile(f);
      const data = readJson(path.join(dir, f)) || {};
      // Volle Session zurückgeben — Contract wie firestore/sessions.js listSessionsForDate.
      // useSession lädt daraus den Editor-State; meta-only führte dazu, dass gespeicherte
      // Sessions leer geladen und beim nächsten Save leer überschrieben wurden.
      return {
        ...data,
        id: meta.id,
        date: meta.date,
        block: data.block || null,
        saved_at: data.saved_at || null,
        exercises: Array.isArray(data.exercises) ? data.exercises : [],
      };
    })
    .sort((a, b) => String(a.saved_at).localeCompare(String(b.saved_at)));
  return c.json({ ok: true, sessions });
});

// Bewusst permissiv (.loose() + fast alles optional): das echte
// Session-JSON-Format (siehe src/CLAUDE.md) hat gewachsene Zusatzfelder
// (slots[], rev, snapshot_version, ...), Ziel dieses Schemas ist Doku +
// Grundschutz (kaputtes/Nicht-Objekt-Payload abfangen), keine strenge Gate-
// Validierung, die reale Klient-Payloads zurückweisen könnte.
const sessionExerciseSchema = z.object({
  exercise_id: z.string().optional(),
  id: z.string().optional(),
  name: z.string().optional(),
  sets: z.union([z.string(), z.number()]).optional(),
  reps: z.union([z.string(), z.number()]).optional(),
  weight: z.union([z.string(), z.number()]).optional(),
  note: z.string().optional(),
  primaryMuscles: z.array(z.string()).optional(),
  secondaryMuscles: z.array(z.string()).optional(),
  isHIT: z.boolean().optional(),
  done: z.boolean().optional(),
  slotId: z.string().nullable().optional(),
}).loose();
const sessionBodySchema = z.object({
  date: z.string().optional(),
  block: z.string().optional(),
  exercises: z.array(sessionExerciseSchema).optional(),
  slots: z.array(z.record(z.string(), z.any())).optional(),
  effort: z.union([z.string(), z.number()]).optional(),
  mood: z.string().optional(),
  notes: z.string().optional(),
}).loose().openapi("SessionBody");

const sessionSaveRoute = createRoute({
  method: "post",
  path: "/session",
  tags: ["session"],
  summary: "Session speichern (JSON = SOT, danach SQLite-Sync via Python)",
  request: {
    query: z.object({ date: z.string().optional(), id: z.string().optional() }),
    body: { content: { "application/json": { schema: sessionBodySchema } } },
  },
  responses: {
    200: {
      description: "Gespeichert",
      content: { "application/json": { schema: z.object({ ok: z.boolean(), id: z.string().nullable(), sqliteSync: z.boolean() }) } },
    },
  },
});
app.openapi(sessionSaveRoute, async (c) => {
  const uid     = c.req.header("X-User-UID") || FITNESS_UID;
  const { date: dateQ, id: idQ } = c.req.valid("query");
  const date    = dateQ || localToday();
  const id      = idQ || null;
  const userDir = path.join(os.homedir(), ".aos", "fitness", "users", uid, "sessions");
  fs.mkdirSync(userDir, { recursive: true });
  const file    = path.join(userDir, sessionFileName(date, id));
  const data    = c.req.valid("json");
  const session = freezeSnapshot({ ...data, date, session_id: id, saved_at: new Date().toISOString() });
  writeJson(file, session); // JSON ist SOT — bleibt in jedem Fall geschrieben
  let sqliteSync = true;
  try {
    await notifyPythonSync(date, session, uid, id); // SQLAlchemy-Upsert via Python, jetzt awaited
  } catch (e) {
    sqliteSync = false;
    log.warn(`[session-sync] SQLite-Sync fehlgeschlagen (${date}${id ? `__${id}` : ""}): ${e.message}`);
  }
  mirrorSession(date, session, uid); // Remote, bleibt fire-and-forget (siehe firestore-mirror.mjs Retry-Markierung)
  return c.json({ ok: true, id, sqliteSync });
});

/**
 * Snapshot-Härtung: stellt sicher dass jede Session self-contained ist.
 * Inline-Felder (name, primaryMuscles, secondaryMuscles, exercise_id_at_log) sind
 * der "frozen" Ground Truth — Analyse-Code soll diese bevorzugen und KB nur
 * als Fallback nutzen. Diese Funktion markiert die Session explizit als
 * snapshot_version 1 und warnt wenn Exercise-Slots fehlen.
 */
function freezeSnapshot(session) {
  const exercises = (session.exercises || []).map(ex => ({
    ...ex,
    name: ex.name || ex.exercise_id || ex.id || "Unknown",
    exercise_id_at_log: ex.exercise_id || ex.id || null,
    primaryMuscles: Array.isArray(ex.primaryMuscles) ? ex.primaryMuscles : [],
    secondaryMuscles: Array.isArray(ex.secondaryMuscles) ? ex.secondaryMuscles : [],
  }));
  for (const ex of exercises) {
    if (!ex.primaryMuscles.length && !ex.secondaryMuscles.length) {
      log.warn(`[snapshot] ${session.date} ${ex.name}: keine Muskel-Daten — Coverage wird fehlen`);
    }
  }
  // rev = monoton hochzählende Revision, serverseitig verwaltet (Client kann
  // sie nicht manipulieren). Ersetzt saved_at-String-Vergleich als Basis für
  // Firestore-Konfliktauflösung (siehe mirror.py::on_session) — Uhr-Drift
  // zwischen Geräten kann rev nicht verfälschen, nur der lokale Save-Zähler.
  const rev = (Number(session.rev) || 0) + 1;
  return { ...session, exercises, snapshot_version: 1, rev };
}

app.openapi(defineJsonRoute({
  method: "delete",
  path: "/session",
  tags: ["session"],
  summary: "Session löschen",
  query: z.object({
    date: z.string().optional(),
    id: z.string().optional(),
  }),
}), (c) => {
  const uid  = c.req.header("X-User-UID") || FITNESS_UID;
  const { date: dateQ, id: idQ } = c.req.valid("query");
  const date = dateQ || localToday();
  const id   = idQ || null;
  const file = path.join(os.homedir(), ".aos", "fitness", "users", uid, "sessions", sessionFileName(date, id));
  if (fs.existsSync(file)) fs.unlinkSync(file);
  deleteSessionFromDb(date, id);
  mirrorSessionDelete(date, uid, id);
  return c.json({ ok: true });
});

app.openapi(defineJsonRoute({
  method: "get",
  path: "/session/history",
  tags: ["session"],
  summary: "Session-Historie laden",
  query: z.object({
    uid: z.string().optional(),
    limit: z.coerce.number().int().positive().max(365).optional().default(10),
  }),
}), (c) => {
  const { uid: uidQ, limit } = c.req.valid("query");
  const uid     = uidQ || c.req.header("X-User-UID") || FITNESS_UID;
  const dir     = path.join(os.homedir(), ".aos", "fitness", "users", uid, "sessions");
  if (!fs.existsSync(dir)) return c.json({ ok: true, sessions: [] });
  const files   = fs.readdirSync(dir).filter(f => f.endsWith(".json")).sort().reverse().slice(0, limit);
  const sessions = files.map(f => {
    const meta = parseSessionFile(f);
    return { date: meta.date, id: meta.id, ...readJson(path.join(dir, f)) };
  });
  return c.json({ ok: true, sessions });
});

app.openapi(defineJsonRoute({
  method: "get",
  path: "/session/latest",
  tags: ["session"],
  summary: "Neueste Session laden",
  query: z.object({ uid: z.string().optional() }),
}), (c) => {
  const { uid: uidQ } = c.req.valid("query");
  const uid   = uidQ || c.req.header("X-User-UID") || FITNESS_UID;
  const dir   = path.join(os.homedir(), ".aos", "fitness", "users", uid, "sessions");
  if (!fs.existsSync(dir)) return c.json({ ok: false }, 404);
  const files = fs.readdirSync(dir).filter(f => f.endsWith(".json")).sort().reverse();
  if (!files.length) return c.json({ ok: false }, 404);
  const data  = readJson(path.join(dir, files[0]));
  return c.json({ ok: true, session: { date: files[0].replace(".json", ""), data } });
});

// ── Journal ───────────────────────────────────────────────────────────────────
app.openapi(defineJsonRoute({
  method: "get",
  path: "/journal",
  tags: ["journal"],
  summary: "Journal-Eintrag lesen",
  query: z.object({ date: z.string().optional() }),
}), async (c) => {
  const { date: dateQ } = c.req.valid("query");
  const uid  = c.req.header("X-User-UID") || FITNESS_UID;
  const date = dateQ || localToday();
  // Firestore-first
  const fsContent = await readJournalFull(uid, date);
  if (fsContent) return c.json({ ok: true, content: fsContent, mtime: date, source: "firestore" });
  // Offline-Fallback: lokale .md Dateien
  const localDirs = [
    { file: path.join(os.homedir(), ".aos", "fitness", "users", uid, "journal", `${date}.md`), label: null },
    { file: path.join(DATA_DIR, "journal", `${date}.md`), label: null },
    { file: path.join(os.homedir(), ".aos", "fuel", "users", uid, "nutrition_journal", `${date}.md`), label: "Fuel" },
  ].filter(({ file }) => fs.existsSync(file));
  if (!localDirs.length) return c.json({ ok: false }, 404);
  const content = localDirs.map(({ file, label }) => {
    // Fitness-Journale: JSONL ist SOT → nur den Freitext-Eintrag in die
    // editierbare Textarea (die gerenderte .md enthält zusätzlich die
    // Habit-/Firestore-Blöcke). Fuel bleibt Rohtext.
    const jsonl = journalEntriesPath(file);
    const text = (label !== "Fuel" && fs.existsSync(jsonl))
      ? journalFreetextBody(file, `freetext-${date}`)
      : fs.readFileSync(file, "utf8");
    return label ? `## ${label} – ${date}\n\n${text}` : text;
  }).join("\n\n---\n\n");
  const mtime = localDirs.map(({ file }) => fs.statSync(file).mtime).reduce((a, b) => a > b ? a : b).toISOString().slice(0, 10);
  return c.json({ ok: true, content, mtime, source: "local" });
});

app.openapi(defineJsonRoute({
  method: "post",
  path: "/journal",
  tags: ["journal"],
  summary: "Journal-Eintrag speichern",
  query: z.object({ date: z.string().optional() }),
  jsonBody: z.object({ content: z.string().optional() }).loose(),
}), async (c) => {
  const { date: dateQ } = c.req.valid("query");
  const { content } = c.req.valid("json");
  const uid           = c.req.header("X-User-UID") || FITNESS_UID;
  const date          = dateQ || localToday();
  // Pro-uid-Ordner (wie GET oben schon macht) statt fix an den beim Server-
  // Start aufgelösten DATA_DIR (= FITNESS_UID) — sonst landet der Eintrag
  // eines anderen Klienten (X-User-UID-Header) immer im falschen Journal.
  const dir           = path.join(os.homedir(), ".aos", "fitness", "users", uid, "journal");
  fs.mkdirSync(dir, { recursive: true });
  const file          = path.join(dir, `${date}.md`);
  // Freitext-Tagesblock als EIN Eintrag (stabile id `freetext-<date>`) in die
  // JSONL-SOT upserten statt die Datei zu overwriten — Daemon-Events und
  // Freitext räumen sich so nicht mehr gegenseitig weg.
  journalUpsertEntry(file, { id: `freetext-${date}`, source: "freetext", ts: "", body: content || "" });
  mirrorJournal(date, { text: content || "" }, uid);
  return c.json({ ok: true });
});

app.openapi(defineJsonRoute({
  method: "get",
  path: "/journal/list",
  tags: ["journal"],
  summary: "Journal-Liste laden",
  query: z.object({ limit: z.coerce.number().int().positive().max(500).optional().default(50) }),
}), async (c) => {
  const { limit: limitCount } = c.req.valid("query");
  const uid = c.req.header("X-User-UID") || FITNESS_UID;
  // Firestore-first
  const fsEntries = await listJournals(uid, limitCount);
  if (fsEntries) return c.json({ ok: true, entries: fsEntries, source: "firestore" });
  // Offline-Fallback
  const dirs = [
    path.join(os.homedir(), ".aos", "fitness", "users", uid, "journal"),
    path.join(DATA_DIR, "journal"),
    path.join(os.homedir(), ".aos", "fuel", "users", uid, "nutrition_journal"),
  ];
  const seen = new Map();
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter(f => f.endsWith(".md"))) {
      const date = f.replace(".md", "");
      const mtime = fs.statSync(path.join(dir, f)).mtime.toISOString();
      if (!seen.has(date) || mtime > seen.get(date)) seen.set(date, mtime);
    }
  }
  const entries = [...seen.entries()]
    .sort((a, b) => b[0].localeCompare(a[0])).slice(0, limitCount)
    .map(([date, mtime]) => ({ date, mtime }));
  return c.json({ ok: true, entries, source: "local" });
});

// ── Coverage ──────────────────────────────────────────────────────────────────
app.openapi(defineJsonRoute({
  method: "get",
  path: "/coverage/anatomy",
  tags: ["coverage"],
  summary: "Anatomy-Coverage berechnen",
  query: z.object({ days: z.coerce.number().int().positive().max(365).optional().default(7) }),
}), (c) => {
  const { days } = c.req.valid("query");
  const muscles = computeCoverageAnatomy(days);
  return c.json({ ok: true, days, muscles });
});

app.openapi(defineJsonRoute({
  method: "get",
  path: "/coverage/gaps",
  tags: ["coverage"],
  summary: "Coverage-Gaps berechnen",
  query: z.object({ days: z.coerce.number().int().positive().max(365).optional().default(7) }),
}), (c) => {
  const { days } = c.req.valid("query");
  const hits = computeCoverage(days);
  const all  = ["chest","back","shoulders","arms","core","glutes","quads","hamstrings","calves"];
  const gaps = all.filter(g => (hits[g] || 0) < 1).map(g => ({ name: g, hits: hits[g] || 0, exercises: [] }));
  return c.json({ ok: true, gaps });
});

// ── Export CSV ────────────────────────────────────────────────────────────────
app.openapi(defineJsonRoute({
  method: "get",
  path: "/export/csv",
  tags: ["export"],
  summary: "CSV-Export aus Sessions",
  query: z.object({
    uid: z.string().optional(),
    days: z.coerce.number().int().positive().max(365).optional().default(14),
    mode: z.enum(["simple", "detailed"]).optional().default("simple"),
  }),
}), (c) => {
  const { uid: uidQ, days, mode } = c.req.valid("query");
  const uid     = uidQ || c.req.header("X-User-UID") || FITNESS_UID;
  const sessDir = path.join(os.homedir(), ".aos", "fitness", "users", uid, "sessions");
  const dates   = lastDates(days).reverse();

  const isDetailed = mode === "detailed";

  const header = isDetailed
    ? ["date","block","location","duration_min","exercise","sets_summary","weight_max_kg","note","effort"]
    : ["date","block","exercise","note","effort"];

  const rows = [header];

  for (const date of dates) {
    const sess     = readJson(path.join(sessDir, `${date}.json`));
    const block    = sess?.block    || "";
    const effort   = sess?.effort   ?? "";
    const location = sess?.location || "";
    const duration = sess?.duration || "";

    for (const ex of (sess?.exercises || [])) {
      const sets = ex.setsArray || [];
      const setsSummary = sets.length
        ? sets.map(s => [s.reps, s.weight ? `${s.weight}kg` : ''].filter(Boolean).join('@')).join(' / ')
        : (ex.sets ? `${ex.sets}×${ex.reps ?? ''}` : '');
      const weightMax = sets.length
        ? Math.max(0, ...sets.map(s => parseFloat(s.weight) || 0)) || ""
        : (ex.weight ?? "");

      rows.push(isDetailed
        ? [date, escapeCsvValue(block), escapeCsvValue(location), String(duration),
           escapeCsvValue(ex.name || ""), escapeCsvValue(setsSummary), String(weightMax),
           escapeCsvValue(ex.note || ""), String(effort)]
        : [date, escapeCsvValue(block), escapeCsvValue(ex.name || ""),
           escapeCsvValue(ex.note || ""), String(effort)]
      );
    }
  }

  const csv      = rows.map(r => r.map(v => `"${v}"`).join(",")).join("\n") + "\n";
  const filename = `fitness-${days}d-${mode}-${localToday()}.csv`;
  return c.json({ ok: true, filename, csv });
});

app.openapi(defineJsonRoute({
  method: "get",
  path: "/export/pflichtaufgabe",
  tags: ["export"],
  summary: "Pflichtaufgabe-Trainingsprotokoll exportieren",
  query: z.object({ uid: z.string().optional() }),
}), (c) => {
  const { uid: uidQ } = c.req.valid("query");
  const uid = uidQ || c.req.header("X-User-UID") || FITNESS_UID;
  const dir = path.join(os.homedir(), ".aos", "fitness", "users", uid, "sessions");
  const files = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter(f => f.endsWith(".json")).sort()
    : [];
  const rows = [["Nr","Datum","Trainingsart","Ort","Dauer (min)"]];
  let nr = 1;
  for (const file of files) {
    const sess = readJson(path.join(dir, file));
    if (!sess) continue;
    const date = file.replace(".json", "");
    const [y, m, d] = date.split("-");
    rows.push([
      String(nr++),
      `${d}.${m}.${y}`,
      escapeCsvValue(sess.trainingsart || sess.block || ""),
      escapeCsvValue(sess.location || ""),
      String(sess.duration || ""),
    ]);
  }
  const csv      = rows.map(r => r.map(v => `"${v}"`).join(",")).join("\n") + "\n";
  const filename = `trainingsprotokoll-pflichtaufgabe-${localToday()}.csv`;
  return c.json({ ok: true, filename, csv, count: nr - 1 });
});

// ── Body metrics ──────────────────────────────────────────────────────────────
// Pro-uid-Ordner (BODY_DIR bleibt Legacy-Fallback für Einträge von vor diesem
// Fix) — vorher war BODY_DIR ein einziger Topf für alle Klienten, Gewicht/
// Schlaf/HF hätten sich pro Datum zwischen Klienten überschrieben.
function bodyDirFor(uid) {
  return path.join(os.homedir(), ".aos", "fitness", "users", uid, "body");
}

app.openapi(defineJsonRoute({
  method: "get",
  path: "/fitness/body",
  tags: ["fitness"],
  summary: "Body-Metriken lesen",
  query: z.object({
    uid: z.string().optional(),
    days: z.coerce.number().int().positive().max(365).optional().default(30),
  }),
}), (c) => {
  const { uid: uidQ, days } = c.req.valid("query");
  const uid  = uidQ || c.req.header("X-User-UID") || FITNESS_UID;
  const ownDir = bodyDirFor(uid);
  fs.mkdirSync(ownDir, { recursive: true });
  const byDate = new Map();
  for (const dir of [BODY_DIR, ownDir]) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter(f => f.match(/^\d{4}-\d{2}-\d{2}\.json$/))) {
      const entry = readJson(path.join(dir, f));
      if (entry) byDate.set(f.replace(".json", ""), entry); // ownDir überschreibt Legacy-Global (spätere Iteration gewinnt)
    }
  }
  const entries = [...byDate.keys()].sort().reverse().slice(0, days).map(d => byDate.get(d));
  return c.json({ ok: true, entries });
});

app.openapi(defineJsonRoute({
  method: "post",
  path: "/fitness/body",
  tags: ["fitness"],
  summary: "Body-Metriken speichern",
  query: z.object({ uid: z.string().optional() }),
  jsonBody: z.object({
    date: z.string().optional(),
    weight_kg: z.union([z.string(), z.number()]).optional(),
  }).loose(),
}), async (c) => {
  const { uid: uidQ } = c.req.valid("query");
  const uid  = uidQ || c.req.header("X-User-UID") || FITNESS_UID;
  const dir  = bodyDirFor(uid);
  fs.mkdirSync(dir, { recursive: true });
  const payload  = c.req.valid("json");
  const day      = payload.date || localToday();
  const file     = path.join(dir, `${day}.json`);
  const existing = readJson(file, { date: day });
  writeJson(file, { ...existing, ...payload, updated_at: new Date().toISOString() });
  if (payload.weight_kg != null) {
    postWger("/weightentry/", { date: day, weight: String(payload.weight_kg) });
  }
  return c.json({ ok: true, day });
});

// ── Theme ─────────────────────────────────────────────────────────────────────
const themeFile = path.join(DATA_DIR, "theme.json");
app.openapi(defineJsonRoute({
  method: "get",
  path: "/theme",
  tags: ["system"],
  summary: "Theme-Konfiguration lesen",
}),  (c) => c.json(readJson(themeFile, { theme: "mocha" })));
app.openapi(defineJsonRoute({
  method: "post",
  path: "/theme",
  tags: ["system"],
  summary: "Theme-Konfiguration speichern",
  jsonBody: looseObjectSchema,
}), async (c) => { writeJson(themeFile, c.req.valid("json")); return c.json({ ok: true }); });

// ── Firestore ─────────────────────────────────────────────────────────────────
app.openapi(defineJsonRoute({
  method: "get",
  path: "/firestore/status",
  tags: ["firestore"],
  summary: "Firestore-Verbindungsstatus",
}), async (c) => c.json(await getFirestoreStatus()));

app.openapi(defineJsonRoute({
  method: "post",
  path: "/firestore/pull",
  tags: ["firestore"],
  summary: "Sessions und Journal aus Firestore ziehen",
  query: z.object({ uid: z.string().optional() }),
}), async (c) => {
  const { uid: uidQ } = c.req.valid("query");
  const uid = uidQ || c.req.header("X-User-UID");
  if (!uid || uid === "default") {
    return c.json({
      ok: false,
      error: "uid Pflicht (kein default). Übergib via ?uid=... oder X-User-UID Header. Verfügbare uids siehe ~/.aos/fitness/users/",
    }, 400);
  }
  const status = await getFirestoreStatus();
  if (!status.ok) return c.json({ ok: false, error: "Firestore nicht verbunden" }, 503);

  const [docs, journalTree] = await Promise.all([
    pullAllSessions(uid),
    pullJournalTree(uid),
  ]);
  if (!docs || !journalTree) return c.json({ ok: false, error: "Pull fehlgeschlagen" }, 500);

  const sessDir = path.join(os.homedir(), ".aos", "fitness", "users", uid, "sessions");
  const journalDir = path.join(os.homedir(), ".aos", "fitness", "users", uid, "journal");
  fs.mkdirSync(sessDir, { recursive: true });
  fs.mkdirSync(journalDir, { recursive: true });

  let pulled = 0, skipped = 0, conflicts = 0;
  const conflictDates = [];
  let journalPulled = 0, habitJournalPulled = 0, habitRecordPulled = 0;

  const formatTs = (value) => {
    if (!value) return "";
    if (typeof value === "string") return value.slice(0, 16);
    if (value instanceof Date) return value.toISOString().slice(0, 16);
    if (typeof value.toDate === "function") return value.toDate().toISOString().slice(0, 16);
    return "";
  };

  // Upsert in die Tages-JSONL-SOT (journal-store.mjs) + Neu-Render der .md.
  // `id` = Firestore-doc-id, identisch zum Python-Daemon-Pfad (mirror.py).
  const appendJournalBlock = (date, source, id, block, ts = "") =>
    journalUpsertEntry(path.join(journalDir, `${date}.md`),
      { id, source, ts, body: block });

  for (const { date, data } of docs) {
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) { skipped++; continue; }
    const localPath = path.join(sessDir, `${date}.json`);
    const local = readJson(localPath);
    const cloudTs = data.saved_at || "";
    const localTs = local?.saved_at || "";

    // Strategie: kein Lokal → schreiben. Sonst nur wenn cloud strikt neuer ist.
    if (local && localTs && cloudTs && localTs >= cloudTs) { skipped++; continue; }
    if (local && (!cloudTs || !localTs)) {
      // Mehrdeutig — überspringen + melden statt blind überschreiben
      conflicts++; conflictDates.push(date); continue;
    }

    writeJson(localPath, data);
    try { syncSessionToDb(date, data); } catch (e) {
      log.warn(`[pull] SQLite-Sync fehler für ${date}: ${e.message}`);
    }
    pulled++;
  }

  for (const { id, data } of journalTree.journal) {
    const date = data?.date || "";
    const text = String(data?.text || "").trim();
    if (!date || !text) continue;
    const time = formatTs(data?.time);
    if (appendJournalBlock(date, "journal", id, `**${time}** ${text}`, time)) {
      journalPulled++;
    }
  }

  for (const { id, data } of journalTree.habitJournals) {
    const date = data?.date || "";
    if (!date) continue;
    const text = String(data?.text || "").trim();
    const coachFeedback = String(data?.coachFeedback || "").trim();
    const habitId = data?.habitId || "";
    const habitName = journalTree.habitNames?.[habitId] || `Habit:${habitId}`;
    const time = formatTs(data?.recorded_at || data?.updated_at);
    let block = `**Habit: ${habitName}**`;
    if (time) block += ` _${time}_`;
    if (text) block += `\n${text}`;
    if (coachFeedback) block += `\n> **Coach Feedback:** ${coachFeedback}`;
    if (appendJournalBlock(date, "habit_journals", id, block, formatTs(data?.recorded_at || data?.updated_at))) {
      habitJournalPulled++;
    }
  }

  for (const { id, data } of journalTree.habitRecords) {
    const date = data?.date || "";
    if (!date) continue;
    const habitId = data?.habitId || "";
    const habitName = journalTree.habitNames?.[habitId] || `Habit:${habitId}`;
    const completion = data?.completion || "DONE";
    const time = formatTs(data?.recorded_at);
    let block = `**${habitName}** ${completion}`;
    if (time) block += ` _${time}_`;
    if (appendJournalBlock(date, "habit_records", id, block, time)) {
      habitRecordPulled++;
    }
  }

  return c.json({
    ok: true,
    pulled,
    skipped,
    conflicts,
    conflict_dates: conflictDates,
    journal_pulled: journalPulled,
    habit_journal_pulled: habitJournalPulled,
    habit_record_pulled: habitRecordPulled,
  });
});

app.openapi(defineJsonRoute({
  method: "post",
  path: "/firestore/sync",
  tags: ["firestore"],
  summary: "Lokale Sessions nach Firestore spiegeln",
}), async (c) => {
  const uid = c.req.header("X-User-UID") || FITNESS_UID;
  const status = await getFirestoreStatus();
  if (!status.ok) return c.json({ ok: false, error: "Firestore nicht verbunden" }, 503);
  const sessDir = path.join(DATA_DIR, "sessions");
  let synced = 0;
  if (fs.existsSync(sessDir)) {
    const files = fs.readdirSync(sessDir)
      .filter(f => f.endsWith(".json") && !f.includes("history"))
      .slice(-30);
    for (const f of files) {
      const date = f.replace(".json", "");
      const data = readJson(path.join(sessDir, f));
      if (data) { mirrorSession(date, data, uid); synced++; }
    }
  }
  // Konsumiert die Retry-Markierung aus firestore-mirror.mjs::fire() — Saves,
  // deren Firestore-Push zuvor fehlgeschlagen ist (z.B. Netzwerk kurz weg),
  // landen hier nicht mehr unsichtbar im Nirwana, sondern werden bei
  // nächster Gelegenheit erneut versucht. Best-effort: Datei wird vor dem
  // erneuten Versuch geleert, ein erneuter Fehlschlag hängt sich über
  // dieselbe fire()-Logik wieder an.
  let retried = 0;
  const retryFile = path.join(path.dirname(sessDir), ".pending-firestore-retries.json");
  if (fs.existsSync(retryFile)) {
    const pending = readJson(retryFile, []);
    fs.unlinkSync(retryFile);
    for (const entry of pending) {
      if (entry.kind !== "session") continue;
      const fname = entry.sessionId ? `${entry.date}__${entry.sessionId}.json` : `${entry.date}.json`;
      const data = readJson(path.join(sessDir, fname));
      if (data) { mirrorSession(entry.date, data, entry.uid || uid); retried++; }
    }
  }
  return c.json({ ok: true, synced, retried });
});

app.openapi(defineJsonRoute({
  method: "get",
  path: "/v1",
  tags: ["system"],
  summary: "Legacy v1 HTML ausliefern",
  responses: {
    200: {
      description: "HTML",
      content: {
        "text/html": { schema: z.string() },
      },
    },
  },
}), (c) => {
  const abs = path.join(STATIC_DIR, "v1.html");
  if (fs.existsSync(abs)) {
    return new Response(fs.createReadStream(abs), {
      headers: { "Content-Type": "text/html;charset=utf-8" },
    });
  }
  return c.text("Not Found", 404);
});

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
serve({ fetch: app.fetch, port: PORT, hostname: HOST }, () =>
  log.info(`💪 fitness-dev on http://${HOST}:${PORT}`)
);

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
