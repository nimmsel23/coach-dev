import { createRoute, z } from "@hono/zod-openapi";
import fs from "node:fs";
import path from "node:path";
import { defineJsonRoute, looseObjectSchema } from "../lib/routes.mjs";

export function registerFitnessMisc(app, ctx) {
  const { DATA_DIR, PYTHON_BASE, readJson, localToday, defaultBlocks, buildPlan, exportSessionMarkdown, exportWithPython, fitnessData, getWeeklySummary, obsidianTargetPath, searchExercises } = ctx;
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
  } catch {
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
  } catch {
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

}
