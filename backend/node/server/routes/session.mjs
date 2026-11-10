import { createRoute, z } from "@hono/zod-openapi";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { defineJsonRoute } from "../lib/routes.mjs";

export function registerSession(app, ctx) {
  const { FITNESS_UID, readJson, writeJson, localToday, notifyPythonSync, proxyToPython, mirrorSession, mirrorSessionDelete, log } = ctx;
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

}
