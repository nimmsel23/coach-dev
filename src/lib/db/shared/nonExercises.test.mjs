import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import * as yaml from "js-yaml";
import { isNonExercise, withoutNonExercises } from "./nonExercises.js";

const here = dirname(fileURLToPath(import.meta.url));
const registry = yaml.load(
  readFileSync(join(here, "../../../../fitness/catalog/kb/registry/non_exercises.yml"), "utf8"),
);
const block = {
  ids: registry.entries.map((e) => String(e.exercise_id)),
  wger: registry.entries.map((e) => String(e.wger_id)),
  yuhonas: [],
};

test("HIIT (wger_529) steht auf der Sperrliste, per ID oder wger_id", () => {
  assert.ok(isNonExercise({ exercise_id: "wger_529" }, block));
  assert.ok(isNonExercise({ id: "wger_529" }, block));
  assert.ok(isNonExercise({ wger_id: 529 }, block));
});

test("Matching nie über Namen, echte Übungen bleiben", () => {
  assert.equal(isNonExercise({ exercise_id: "061", display_name: "HIIT" }, block), false);
  const list = [{ exercise_id: "wger_529" }, { exercise_id: "061" }, { id: "041" }];
  assert.deepEqual(withoutNonExercises(list, block).map((e) => e.exercise_id || e.id), ["061", "041"]);
});

test("ohne Sperrliste bleibt alles unverändert", () => {
  assert.equal(isNonExercise({ exercise_id: "wger_529" }, null), false);
});
