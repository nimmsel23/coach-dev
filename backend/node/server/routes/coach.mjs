import { loadKlientenRegistry } from "../lib/klienten.mjs";
import { z } from "@hono/zod-openapi";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { defineJsonRoute, looseObjectSchema } from "../lib/routes.mjs";

export function registerCoach(app, ctx) {
  const { FITNESS_UID, readJson, writeJson, localToday } = ctx;
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

app.openapi(defineJsonRoute({
  method: "get",
  path: "/fitness/coach/profiles",
  tags: ["coach"],
  summary: "Coach-Profile für bekannte UIDs",
}), (c) => {
  const usersDir = path.join(os.homedir(), ".aos", "fitness", "users");
  const klienten = loadKlientenRegistry(readJson);
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

}
