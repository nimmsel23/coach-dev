import { Hono } from "hono";
import { createRoutineStore, RoutineError } from "../domain/routines.mjs";

export function jsRoutineRoutes({ dataRoot }) {
  const app = new Hono();
  const store = createRoutineStore(dataRoot);
  const uid = (c) => c.req.query("uid") || c.req.header("X-User-UID");
  const wrap = (handler) => async (c) => {
    try {
      return c.json(await handler(c, uid(c)));
    } catch (error) {
      if (error instanceof RoutineError) return c.json({ error: error.message }, error.status);
      throw error;
    }
  };
  const body = async (c) => {
    try { return await c.req.json(); }
    catch { throw new RoutineError(400, "invalid_json"); }
  };
  app.get("/", wrap(async (_c, user) => ({ routines: await store.list(user) })));
  app.post("/", wrap(async (c, user) => ({ id: await store.create(user, await body(c)) })));
  app.get("/:id", wrap(async (c, user) => ({ routine: await store.get(user, c.req.param("id")) })));
  app.patch("/:id", wrap(async (c, user) => { await store.patch(user, c.req.param("id"), await body(c)); return { ok: true }; }));
  app.delete("/:id", wrap(async (c, user) => { await store.remove(user, c.req.param("id")); return { ok: true }; }));
  app.post("/:id/exercises", wrap(async (c, user) => ({ id: await store.addExercise(user, c.req.param("id"), await body(c)) })));
  app.patch("/:id/exercises/:eid", wrap(async (c, user) => { await store.patchExercise(user, c.req.param("id"), c.req.param("eid"), await body(c)); return { ok: true }; }));
  app.delete("/:id/exercises/:eid", wrap(async (c, user) => { await store.removeExercise(user, c.req.param("id"), c.req.param("eid")); return { ok: true }; }));
  app.put("/:id/exercises/order", wrap(async (c, user) => { await store.reorder(user, c.req.param("id"), await body(c)); return { ok: true }; }));
  return app;
}
