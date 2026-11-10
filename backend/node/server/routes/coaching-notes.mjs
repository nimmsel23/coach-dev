import { z } from "@hono/zod-openapi";
import { defineJsonRoute } from "../lib/routes.mjs";

export function registerCoachingNotes(app, ctx) {
  const { proxyToPython } = ctx;
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

}
