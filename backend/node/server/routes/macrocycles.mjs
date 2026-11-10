import { z } from "@hono/zod-openapi";
import { defineJsonRoute, looseObjectSchema } from "../lib/routes.mjs";

export function registerMacrocycles(app, ctx) {
  const { proxyToPython } = ctx;
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

}
