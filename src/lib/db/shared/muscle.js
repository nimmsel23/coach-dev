/**
 * shared/muscle.js — Muscle-group constants & mapping helpers.
 * Source of Truth: Evaluates top-level KB region files (quadriceps.yml, hamstrings.yml, etc.)
 * and maps muscle IDs via their declared `muscles: [...]` lists.
 */

import { ACTIVITY_MUSCLE_GROUPS } from "../../../constants/ActivityConstants.js";

/** Impact factor per activity type when computing coverage scores. */
const ACTIVITY_IMPACT = { hiking: 1.0, running: 1.0, cycling: 0.8, swimming: 0.7 };

export const ACTIVITY_MUSCLE_MAPPING = Object.fromEntries(
  Object.entries(ACTIVITY_MUSCLE_GROUPS).map(([k, muscles]) => [
    k,
    { muscles, impact: ACTIVITY_IMPACT[k] ?? 1.0 },
  ])
);

// In-Memory Speicher für KB-Regionen und die direkte Muskel-zu-Regionen Map
let _kbRegions = new Map(); // regionId -> label
let _muscleToRegionMap = new Map(); // muscleId -> regionId

// Freitext-Fallback: Sessions/Suchresultate speichern primaryMuscles/
// secondaryMuscles teils als lesbare Gruppennamen ("Quads", "Shoulders")
// statt kanonischer KB-IDs. Ohne diese Normalisierung landet so ein Eintrag
// unverändert als "Region" (siehe muscleToRegion()-Fallback unten) — ein Key,
// den keine Coverage-Abfrage kennt — und die Muskelgruppe erscheint
// fälschlich als "nicht trainiert", obwohl Sessions dafür existieren.
const FREE_TEXT_MUSCLE_ALIASES = {
  chest: "chest", pec: "chest", pectoralis: "chest",
  // Original-Vokabular der yuhonas/free-exercise-db (17 Namen, mit Leerzeichen:
  // "lower back"/"middle back", dazu "abdominals", "lats", "traps", "neck") —
  // auf die spezifischen KB-Regionen aufgelöst, nicht auf die Sammelregion "back"
  // (die gewinnt keinen Muskel und taucht in Coverage/Recovery nie auf).
  back: "middle_back", lat: "middle_back", lats: "middle_back", latissimus: "middle_back",
  middle_back: "middle_back", lower_back: "lower_back",
  trap: "upper_back", traps: "upper_back", trapezius: "upper_back", neck: "upper_back",
  rhomboid: "rhomboids", rhomboids: "rhomboids",
  abdominals: "core", abdominal: "core",
  hip_flexors: "iliopsoas", hip_flexor: "iliopsoas",
  shoulders: "shoulders", shoulder: "shoulders", delt: "shoulders", delts: "shoulders", deltoid: "shoulders",
  arms: "arms", arm: "arms", bicep: "arms", biceps: "arms", tricep: "arms", triceps: "arms", forearm: "arms",
  core: "core", abs: "core", ab: "core", obliques: "core",
  glutes: "glutes", glute: "glutes", gluteal: "glutes", gluteus: "glutes",
  quadriceps: "quadriceps", quad: "quadriceps", quads: "quadriceps", legs: "quadriceps", leg: "quadriceps",
  hamstrings: "hamstrings", hamstring: "hamstrings",
  calves: "calves", calf: "calves", gastrocnemius: "calves",
};

// Regions deren KB-Dateiname von der App-weiten Sammelgruppen-Konvention
// abweicht (siehe MuscleBody.jsx::toGroup(), ACTIVITY_MUSCLE_GROUPS): die
// KB-Region-Datei heißt "abs" (500_abs.yml), aber "core" ist überall sonst
// die Sammelgruppe für Bauch/Rumpf (analog zu "back"/"legs" als Sammelgruppen
// für ihre jeweiligen Sub-Regionen). Ohne diese Umbenennung landen HIIT-
// Core-Finisher (ACTIVITY_MUSCLE_GROUPS.hiit enthält "core") in einem
// separaten, nie mit der KB-Region verschmolzenen Bucket.
const REGION_ID_ALIASES = { abs: "core" };

function normalizeRegionId(raw) {
  const id = String(raw || "").trim();
  return REGION_ID_ALIASES[id] || id;
}

function regionIdFromDoc(doc) {
  const id = String(doc.region || doc.doc_id || doc.id || doc.muscle_id || "").trim();
  const stripped = id.includes("_") && /^\d/.test(id) ? id.split("_").slice(1).join("_") : id;
  return normalizeRegionId(stripped);
}

function bucketRank(doc) {
  const catalogId = String(doc.catalog_id || doc.id || "").trim();
  return /^\d00_/.test(catalogId) ? 1 : 0;
}

/**
 * Registriert alle aus der KB geladenen Muskel-Dokumente.
 * Liest die `muscles: [...]` Listen aus den Regionen-Dateien (quadriceps.yml, chest.yml, etc.)
 * und verknüpft jeden Unter-Muskel direkt mit seiner Region.
 */
export function setKBMuscles(musclesList) {
  _kbRegions.clear();
  _muscleToRegionMap.clear();

  const docs = Array.isArray(musclesList) ? musclesList : [];
  const regionDocs = docs
    .filter((doc) => Array.isArray(doc?.muscles) && (doc.kb_level === "region" || !doc.region || doc.region === doc.doc_id))
    .sort((a, b) => bucketRank(a) - bucketRank(b) || (a.muscles?.length || 0) - (b.muscles?.length || 0));

  for (const doc of regionDocs) {
    const regionId = regionIdFromDoc(doc);
    if (!regionId) continue;
    const label = doc.label_de || doc.display_name || regionId;
    _kbRegions.set(regionId, label);
    for (const subMuscleId of doc.muscles) {
      const muscleId = String(subMuscleId);
      if (!_muscleToRegionMap.has(muscleId)) {
        _muscleToRegionMap.set(muscleId, regionId);
      }
    }
  }

  // Detail-Dateien liefern nur Fallback über ihren Ordner, falls eine neue
  // Detail-ID noch nicht in einer Top-Level-Region eingetragen wurde.
  for (const doc of docs) {
    const id = String(doc.id || doc.muscle_id || "").trim();
    const region = normalizeRegionId(doc.region);
    if (id && region && doc.kb_level === "muscle" && !_muscleToRegionMap.has(id)) {
      _muscleToRegionMap.set(id, region);
    }
  }
}

/**
 * Gibt nur die Regionen zurück, die tatsächlich mindestens einen Muskel
 * "gewinnen" (siehe muscleToRegion()-Sortierung: kleine, spezifische Buckets
 * zuerst, große x00-Sammel-Dateien als Fallback zuletzt — first-come-wins in
 * _muscleToRegionMap). Sonst würden Sammel-Dateien wie back.yml/legs.yml
 * IMMER als eigene Coverage-Region neben ihren spezifischeren Sub-Buckets
 * auftauchen, obwohl sie laut HIGHLIGHTERS.md nur Fallback sein sollen.
 */
export function getMuscleGroups() {
  const winningIds = new Set(_muscleToRegionMap.values());
  return Array.from(_kbRegions.entries())
    .filter(([id]) => winningIds.has(id))
    .map(([id, label]) => ({ id, label }));
}

// Regionen, die in der Coverage-Gaps-Anzeige (Weekly Review, Dashboard)
// bewusst nicht als "fehlend" auftauchen sollen — werden im Alltag kaum
// isoliert trainiert und sind kein sinnvolles Coverage-Ziel.
const GAP_EXCLUDED_REGIONS = new Set(["iliopsoas", "forearms"]);

export function getMuscleGroupsForGaps() {
  return getMuscleGroups().filter((g) => !GAP_EXCLUDED_REGIONS.has(g.id));
}

/**
 * Liest die Region einer Muskel-ID direkt aus dem KB-Mapping (aus muscles: [...] in *.yml).
 */
export function muscleToRegion(muscle) {
  const id = normalizeRegionId(muscle);
  if (!id) return null;

  // 1. Ist selbst eine Region
  if (_kbRegions.has(id)) return id;

  // 2. Aus dem KB-Mapping lesen (abgeleitet aus `muscles: [...]` in den *.yml Dateien)
  if (_muscleToRegionMap.has(id)) {
    return _muscleToRegionMap.get(id);
  }

  // 3. Freitext-Fallback (nur wenn die aufgelöste Region tatsächlich aus der
  // KB registriert ist — sonst wie bisher unverändert zurückgeben).
  // Leerzeichen -> Unterstrich: "lower back" -> "lower_back" (Yuhonas-Schreibweise).
  const key = id.toLowerCase().replace(/\s+/g, "_");
  if (_kbRegions.has(key)) return key;
  const alias = FREE_TEXT_MUSCLE_ALIASES[key];
  if (alias && _kbRegions.has(alias)) return alias;

  return id;
}

export function muscleToGroupIds(muscle) {
  const region = muscleToRegion(muscle);
  return region ? [region] : [];
}

// Agonist/Antagonist-Paare, bei denen ein starkes Ungleichgewicht im
// Trainingsvolumen auf einseitiges Training hindeutet — z.B. vordere Schulter
// (Front-/Bankdrücken-lastig) vs. hintere Schulter (Rear Delt/Face Pull),
// eine häufige Ursache für Rundschulter-Haltung.
const MUSCLE_BALANCE_PAIRS = [
  {
    a: "301_anterior_deltoid", b: "303_posterior_deltoid",
    labelA: "vordere Schulter", labelB: "hintere Schulter",
    // Fallback für Übungen, die im KB nur generisch als "shoulders"/"304_rotator_cuff"
    // getaggt sind (nicht mit der spezifischen Delt-Kopf-ID) — ohne diesen
    // Namens-Abgleich fallen z.B. "Vorgebeugte Kabel Rear Delt Flys" (primary:
    // ["shoulders"]) komplett aus der Zählung, was ein falsches Ungleichgewicht
    // vortäuscht (siehe importer.py::DELTOID_REASSIGNMENT, gleiche Heuristik).
    nameFallbackA: /front raise|frontheben|shoulder press|overhead press|schulterdr(ü|ue)cken/i,
    nameFallbackB: /rear|reverse|posterior|face.?pull|vorgebeugt|rückwärt|hintere schulter/i,
  },
];

/**
 * Vergleicht Agonist/Antagonist-Paare über alle Übungen einer Periode und
 * meldet ein deutliches Ungleichgewicht (>= 1.5x und mindestens 1 Punkt
 * Differenz, um Rauschen bei kleinen Zahlen zu vermeiden).
 * @param {Array<{name?: string, primaryMuscles?: string[]}>} exercises
 */
export function buildMuscleBalanceInsights(exercises) {
  const insights = [];
  const list = Array.isArray(exercises) ? exercises : [];

  for (const { a, b, labelA, labelB, nameFallbackA, nameFallbackB } of MUSCLE_BALANCE_PAIRS) {
    let scoreA = 0, scoreB = 0;
    for (const ex of list) {
      const primary = ex?.primaryMuscles || [];
      const name = ex?.name || ex?.exercise_id || "";
      if (primary.includes(a)) { scoreA += 1; continue; }
      if (primary.includes(b)) { scoreB += 1; continue; }
      // Generisch getaggte Übung (z.B. "shoulders") — über den Namen zuordnen.
      if (nameFallbackB?.test(name)) scoreB += 1;
      else if (nameFallbackA?.test(name)) scoreA += 1;
    }
    if (scoreA === 0 && scoreB === 0) continue;
    if (scoreA >= scoreB * 1.5 && scoreA - scoreB >= 1) {
      insights.push(`${labelA} wird deutlich mehr trainiert als ${labelB} (${scoreA.toFixed(1)} vs. ${scoreB.toFixed(1)}) — Rear Delt/Face Pull ergänzen.`);
    } else if (scoreB >= scoreA * 1.5 && scoreB - scoreA >= 1) {
      insights.push(`${labelB} wird deutlich mehr trainiert als ${labelA} (${scoreB.toFixed(1)} vs. ${scoreA.toFixed(1)}).`);
    }
  }
  return insights;
}
