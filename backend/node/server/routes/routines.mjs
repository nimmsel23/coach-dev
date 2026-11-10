import { z } from "@hono/zod-openapi";
import { defineJsonRoute, looseObjectSchema } from "../lib/routes.mjs";

export function registerRoutines(app, ctx) {
  const { proxyToPython } = ctx;
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

}
