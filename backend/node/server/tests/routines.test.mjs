import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { jsRoutineRoutes } from "../routes/js-routines.mjs";

async function fixture(run) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "fitness-js-routines-"));
  try { await run(root); }
  finally { await fs.rm(root, { recursive: true, force: true }); }
}
const request = (app, method, url, payload) => app.request(url, {
  method,
  headers: { "Content-Type": "application/json" },
  body: payload === undefined ? undefined : JSON.stringify(payload),
});

test("API and CLI share an isolated routine store", async () => fixture(async (root) => {
  const app = jsRoutineRoutes({ dataRoot: root });
  const q = "?uid=client_1";
  const created = await request(app, "POST", `/${q}`, { name: "Push", goal: "strength" });
  assert.equal(created.status, 200);
  const { id } = await created.json();
  const first = await request(app, "POST", `/${id}/exercises${q}`, { exercise_id: "bench", target_sets: 2, customField: "preserved" });
  const firstId = (await first.json()).id;
  const second = await request(app, "POST", `/${id}/exercises${q}`, { exercise_id: "press", templateSets: [{ targetReps: "5" }] });
  const secondId = (await second.json()).id;
  assert.equal((await request(app, "PUT", `/${id}/exercises/order${q}`, { order: [{ id: firstId, order: 1 }, { id: secondId, order: 0 }] })).status, 200);
  const detail = (await (await request(app, "GET", `/${id}${q}`)).json()).routine;
  assert.deepEqual(detail.exercises.map((exercise) => exercise.exercise_id), ["press", "bench"]);
  assert.equal(detail.exercises[1].templateSets.length, 2);
  assert.equal(detail.exercises[1].customField, "preserved");
  assert.equal((await (await request(app, "GET", `/${q}`)).json()).routines[0].exerciseCount, 2);
  assert.equal((await request(app, "PATCH", `/${id}${q}`, { id: "overwrite" })).status, 400);
  assert.equal((await request(app, "PATCH", `/${id}${q}`, { name: "" })).status, 400);
  assert.equal((await request(app, "PUT", `/${id}/exercises/order${q}`, { order: [{ id: firstId, order: 0 }] })).status, 400);
  assert.equal((await request(app, "GET", `/${id}?uid=../escape`)).status, 400);
  assert.equal((await request(app, "DELETE", `/${id}/exercises/${firstId}${q}`)).status, 200);
  assert.equal((await request(app, "DELETE", `/${id}${q}`)).status, 200);
  assert.equal((await request(app, "GET", `/${id}${q}`)).status, 404);
}));

test("parallel creates keep both records and malformed existing data is not overwritten", async () => fixture(async (root) => {
  const app = jsRoutineRoutes({ dataRoot: root });
  const responses = await Promise.all(Array.from({ length: 12 }, (_, i) => request(app, "POST", "/?uid=client_1", { name: `Routine ${i}` })));
  assert(responses.every((response) => response.status === 200));
  assert.equal((await (await request(app, "GET", "/?uid=client_1")).json()).routines.length, 12);
  const file = path.join(root, "users", "client_1", "routines.json");
  await fs.writeFile(file, "broken JSON");
  const response = await request(app, "POST", "/?uid=client_1", { name: "Should fail" });
  assert.equal(response.status, 500);
  assert.equal(await fs.readFile(file, "utf8"), "broken JSON");
}));
