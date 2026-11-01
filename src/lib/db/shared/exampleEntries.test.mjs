import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import * as yaml from "js-yaml";
import { buildKbMap, findKbExercise } from "./kbLookup.js";

// Echte Entwurfs-Einträge aus dem Katalog (kb/inbox), keine Test-Attrappen.
const here = dirname(fileURLToPath(import.meta.url));
const IDS = ["back_squat", "machine_chest_press", "incline_chest_press_machine", "samurai_extension"];
const kb = IDS.map((id) =>
  yaml.load(readFileSync(join(here, `../../../../fitness/catalog/kb/inbox/inbox_${id}.yml`), "utf8")).exercises[0],
);
const map = buildKbMap(kb);

test("die vier Session-Namen lösen auf ihren Katalogeintrag auf", () => {
  const cases = [
    ["Back Squat", "back_squat"],
    ["Brustmaschine", "machine_chest_press"],
    ["Schrägbrustpresse (Maschine)", "incline_chest_press_machine"],
    ["Samurai Extension", "samurai_extension"],
  ];
  for (const [name, id] of cases) {
    const hit = findKbExercise(map, { name });
    assert.equal(hit?.exercise_id, id, name);
    assert.ok(hit.primary_muscles.length > 0, `${name}: Muskeln für die Coverage`);
  }
});

test("Schreibvarianten und alte Session-IDs lösen ebenfalls auf", () => {
  assert.equal(findKbExercise(map, { name: "schrägbrustpresse maschine" })?.exercise_id, "incline_chest_press_machine");
  assert.equal(findKbExercise(map, { name: "x", id: "inbox_back_squat" })?.exercise_id, "back_squat");
  assert.equal(findKbExercise(map, { name: "x", exercise_id: "manual_samurai_extension" })?.exercise_id, "samurai_extension");
});

test("ID 'inbox_brustmaschine' aus Sessions greift bewusst nicht (Name entscheidet)", () => {
  const hit = findKbExercise(map, { name: "Schrägbrustpresse (Maschine)", id: "inbox_brustmaschine" });
  assert.equal(hit?.exercise_id, "incline_chest_press_machine");
});

test("Entwürfe sind ehrlich als Entwurf markiert, nicht expert", () => {
  for (const ex of kb) {
    assert.equal(ex.review_state.status, "draft");
    assert.ok(!(ex.tags || []).includes("expert"));
  }
});
