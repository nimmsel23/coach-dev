import { loadKlientenRegistry } from "../lib/klienten.mjs";
import { createRoute, z } from "@hono/zod-openapi";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { defineJsonRoute, looseObjectSchema } from "../lib/routes.mjs";

export function registerExercises(app, ctx) {
  const { PYTHON_BASE, readJson, fetchWger, fitnessData, searchExercises } = ctx;
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
  } catch {
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
  const klienten = loadKlientenRegistry(readJson);
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
  } catch {
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
  } catch {
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
  } catch {
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
  } catch {
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
  } catch {
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
  } catch {
    return c.json({ ok: false, error: "python_unreachable" }, 502);
  }
});

app.openapi(defineJsonRoute({
  method: "get",
  path: "/fitness/inbox/{id}/duplicates",
  tags: ["inbox"],
  summary: "Duplicate-Gruppe fuer Inbox-Entwurf pruefen",
  params: z.object({ id: z.string() }),
  query: z.object({ uid: z.string().optional() }),
}), async (c) => {
  const id = c.req.param("id");
  const uid = c.req.query("uid");
  const suffix = uid ? `?uid=${encodeURIComponent(uid)}` : "";
  try {
    const res = await fetch(`${PYTHON_BASE}/fitness/inbox/${id}/duplicates${suffix}`);
    const data = await res.json();
    return c.json(data, res.status);
  } catch {
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
  } catch {
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
  } catch {
    return c.json({ ok: false, error: "python_unreachable" }, 502);
  }
});

}
