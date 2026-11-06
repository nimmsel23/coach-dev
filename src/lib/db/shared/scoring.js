/**
 * shared/scoring.js — Gewichtung der Session-Treffer für Muskel-Coverage und PPL-Balance.
 * Gilt identisch in local/analysis.js, firestore/analysis.js, server.mjs und coaching.py.
 *
 * - Kraft: Treffer × RPE/10 (RPE 10 zählt voll, RPE 5 halb; ohne Angabe 1,0).
 * - Cardio/Activity zählt weniger als Kraft (ACTIVITY_WEIGHT auf den Rollen-Treffer).
 * - Nur Split-Chip, keine Übungen getrackt: der ganze Muskelkomplex des Splits
 *   wird pauschal als primary gescored (Legs → Quadrizeps, Beinbeuger, Gesäß, Waden).
 */

export const ACTIVITY_WEIGHT = 0.5;
/** Unter diesem Score gilt eine Region als Lücke (RPE-skalierte Treffer liegen unter 1). */
export const GAP_THRESHOLD = 0.5;

const PUSH = ["chest", "shoulders", "triceps"];
const PULL = ["upper_back", "middle_back", "biceps"];
const LEGS = ["quadriceps", "hamstrings", "glutes", "calves"];

export const BLOCK_MUSCLES = {
  push: PUSH,
  pull: PULL,
  legs: LEGS,
  upper: [...PUSH, ...PULL],
  lower: LEGS,
  full: [...PUSH, ...PULL, ...LEGS, "abs"],
};

export function effortFactor(sess) {
  const rpe = Number(sess?.effort);
  if (!Number.isFinite(rpe) || rpe <= 0) return 1;
  return Math.min(rpe, 10) / 10;
}

export function blockComplexMuscles(block) {
  const b = String(block || "").trim().toLowerCase();
  return BLOCK_MUSCLES[b === "full body" ? "full" : b] || [];
}
