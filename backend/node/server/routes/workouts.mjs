import { z } from "@hono/zod-openapi";
import { defineJsonRoute, looseObjectSchema } from "../lib/routes.mjs";

export function registerWorkouts(app, ctx) {
  const { proxyToPython } = ctx;
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

}
