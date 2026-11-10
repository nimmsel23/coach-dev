import { z } from "@hono/zod-openapi";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { defineJsonRoute, looseObjectSchema } from "../lib/routes.mjs";

export function registerFitnessData(app, ctx) {
  const { FITNESS_UID, DATA_DIR, BODY_DIR, readJson, writeJson, localToday, lastDates, escapeCsvValue, postWger, computeCoverage, computeCoverageAnatomy } = ctx;
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

}
