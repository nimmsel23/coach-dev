import { test } from "node:test";
import assert from "node:assert/strict";
import { foldName, buildKbMap, findKbExercise, unresolvedExerciseNames, augmentKbMapWithMirror } from "./kbLookup.js";

const KB = [
  { exercise_id: "bench", id: "bench", display_name: "Bankdrücken", english: "Bench Press", primary_muscles: ["101_pectoralis_major"], aliases: ["Flachbankdrücken"] },
  { exercise_id: "pushdown", display_name: "Trizeps-Pushdown", primary_muscles: ["401_triceps_brachii"], search_aliases: ["Cable Pushdown"] },
  { exercise_id: "press", display_name: "Schulterpresse", primary_muscles: ["301_anterior_deltoid"] },
  { exercise_id: "alias_thief", display_name: "Anderes", primary_muscles: ["x"], aliases: ["Bankdrücken"] },
  { exercise_id: "no_muscles", display_name: "Leer", primary_muscles: [] },
];
const map = buildKbMap(KB);

test("foldName: Umlaute, Bindestriche, Satzzeichen, Groß/Klein", () => {
  assert.equal(foldName("Trizeps-Pushdown (Stange)"), "trizeps pushdown stange");
  assert.equal(foldName("  Schrägbank_Drücken "), "schraegbank druecken");
  assert.equal(foldName("90/90 Crunch"), "90 90 crunch");
});

test("bisheriges Verhalten bleibt: kleingeschriebener display_name trifft", () => {
  assert.equal(map.get("bankdrücken").exercise_id, "bench");
  assert.equal(findKbExercise(map, { name: "Bankdrücken" }).exercise_id, "bench");
});

test("Primärname gewinnt gegen fremden Alias", () => {
  assert.equal(findKbExercise(map, { name: "Bankdrücken" }).exercise_id, "bench");
});

test("Treffer über exercise_id/id, auch bei abweichendem Namen", () => {
  assert.equal(findKbExercise(map, { name: "Irgendwas", exercise_id: "pushdown" }).exercise_id, "pushdown");
  assert.equal(findKbExercise(map, { name: "Irgendwas", id: "bench" }).exercise_id, "bench");
});

test("Treffer über englischen Zweitnamen und Aliasse", () => {
  assert.equal(findKbExercise(map, { name: "Bench Press" }).exercise_id, "bench");
  assert.equal(findKbExercise(map, { name: "flachbankdrücken" }).exercise_id, "bench");
  assert.equal(findKbExercise(map, { name: "Cable Pushdown" }).exercise_id, "pushdown");
});

test("gefaltete Schreibweise: Bindestrich/Leerzeichen/Umlaut-Umschrift", () => {
  assert.equal(findKbExercise(map, { name: "Trizeps Pushdown" }).exercise_id, "pushdown");
  assert.equal(findKbExercise(map, { name: "Bankdruecken" }).exercise_id, "bench");
});

test("Klammerzusatz wird als letzter Versuch ignoriert", () => {
  assert.equal(findKbExercise(map, { name: "Schulterpresse (Maschine)" }).exercise_id, "press");
  assert.equal(findKbExercise(map, { name: "Trizeps Pushdown (Stange)" }).exercise_id, "pushdown");
});

test("kein Treffer → null (keine Fuzzy-Raterei)", () => {
  assert.equal(findKbExercise(map, { name: "Back Squat" }), null);
  assert.equal(findKbExercise(map, { name: "Samurai Extension" }), null);
  assert.equal(findKbExercise(map, {}), null);
  assert.equal(findKbExercise(null, { name: "x" }), null);
});

test("unresolvedExerciseNames: nur Übungen ohne eigene UND ohne KB-Muskeln", () => {
  const sessions = [{ exercises: [
    { name: "Bankdrücken" },                                  // KB hat Muskeln
    { name: "Back Squat" },                                   // unbekannt
    { name: "Leer" },                                         // KB-Eintrag ohne Muskeln
    { name: "Eigene", primaryMuscles: ["chest"] },            // Session hat Muskeln
  ] }, { exercises: [{ name: "Back Squat" }] }];
  assert.deepEqual(unresolvedExerciseNames(sessions, map).sort(), ["Back Squat", "Leer"]);
});

test("Mirror-Fallback: ergänzt nur Ungeklärtes, überschreibt nie Katalog-Schlüssel", async () => {
  const local = buildKbMap(KB);
  const mirror = new Map([
    ["back squat", { exercise_id: "yuhonas_back_squat", primary_muscles: ["quadriceps"] }],
    ["bankdrücken", { exercise_id: "SOLL_NICHT_GEWINNEN", primary_muscles: ["x"] }],
  ]);
  let loads = 0;
  const loader = async () => { loads++; return mirror; };
  const sessions = [{ exercises: [{ name: "Back Squat" }, { name: "Bankdrücken" }, { name: "Samurai Extension" }] }];
  const r = await augmentKbMapWithMirror(local, sessions, loader);
  assert.equal(loads, 1);
  assert.equal(r.resolved, 1);
  assert.deepEqual(r.unresolved, ["Samurai Extension"]);
  assert.equal(findKbExercise(local, { name: "Back Squat" }).exercise_id, "yuhonas_back_squat");
  assert.equal(findKbExercise(local, { name: "Bankdrücken" }).exercise_id, "bench");
});

test("Mirror wird nicht geladen, wenn alles geklärt ist; Ladefehler sind harmlos", async () => {
  let loads = 0;
  const ok = await augmentKbMapWithMirror(buildKbMap(KB), [{ exercises: [{ name: "Bankdrücken" }] }], async () => { loads++; return new Map(); });
  assert.equal(loads, 0);
  assert.equal(ok.resolved, 0);
  const failing = await augmentKbMapWithMirror(buildKbMap(KB), [{ exercises: [{ name: "Back Squat" }] }], async () => { throw new Error("idb weg"); });
  assert.deepEqual(failing.unresolved, ["Back Squat"]);
});
