import { ACTIVITY_TYPES } from './activities';

// Strength split colors (kept as-is, not activity-type dependent)
const STRENGTH_SPLIT_COLORS = {
  push:       "#f472b6",
  pull:       "#34d399",
  legs:       "#fb923c",
  upper:      "#38bdf8",
  lower:      "#a78bfa",
  full:       "#fbbf24",
};

// Build activity-type colors from ACTIVITY_TYPES
const ACTIVITY_TYPE_COLORS = Object.fromEntries(
  ACTIVITY_TYPES.map(activity => [activity.value, activity.color])
);

// Cardio / Endurance — all use orange family to be visually distinct from strength
export const BLOCK_COLORS = {
  ...STRENGTH_SPLIT_COLORS,
  ...ACTIVITY_TYPE_COLORS,
};

// Activity labels
export const ACTIVITY_LABELS = Object.fromEntries(
  ACTIVITY_TYPES.map(activity => [activity.value, activity.label])
);

// Activity emojis
export const ACTIVITY_EMOJI = Object.fromEntries(
  ACTIVITY_TYPES.map(activity => [activity.value, activity.emoji])
);

// Activity lucide-react icons
export const ACTIVITY_ICONS = Object.fromEntries(
  ACTIVITY_TYPES.map(activity => [activity.value, activity.icon])
);

// Default muscle target per activity type — used in ActivityAddon + server coverage
export const ACTIVITY_MUSCLE_DEFAULTS = Object.fromEntries(
  ACTIVITY_TYPES.map(activity => [activity.value, activity.muscleDefault])
);

// Muscle groups per target key — mirrors server.mjs muscleToGroupId keys
export const MUSCLE_TARGET_GROUPS = {
  core:  ['core'],
  legs:  ['quadriceps', 'hamstrings', 'glutes', 'calves'],
  full:  ['chest', 'upper_back', 'middle_back', 'shoulders', 'biceps', 'triceps', 'abs', 'quadriceps', 'hamstrings', 'glutes'],
};

// Single source of truth: welche Muskelgruppen jede Cardio-/Activity-Art trifft.
// Wird von MuscleBody (Dashboard), Muscles-View und analysis.js (Coverage) genutzt.
// Swimming = Brustschwimmen (Pec-Zug + Froschkick) — nicht Kraul.
//
// Nutzt die 16 spezifischen KB-Regionen (kb/muscles/*.yml, ohne die
// Sammel-Dateien arms/back/core/legs/shoulders — die verlieren beim
// muscleToRegion()-Lookup ohnehin gegen die spezifischeren Dateien, siehe
// "first-come-wins, kleine Dateien zuerst" in shared/muscle.js), nicht mehr
// die groben Sammelbegriffe. "shoulders" → upper_back (deckt Trapezius +
// hintere Schulter/Rotatorenmanschette ab, siehe upper_back.yml-Mitglieder),
// "back" → middle_back (Lat-dominante Zugbewegungen) bzw. lower_back
// (Mobility/Flexibility-lastige Aktivitäten), "core" → abs, "arms" → je nach
// Bewegungsmuster biceps (Zug) oder triceps (Druck), ggf. + forearms bei
// grifflastigen Aktivitäten (Klettern).
export const ACTIVITY_MUSCLE_GROUPS = {
  ...Object.fromEntries(
    ACTIVITY_TYPES.map(activity => [activity.value, activity.muscleGroups])
  ),
  // Additional entry (not part of ACTIVITY_TYPES, but used in muscle analysis)
  boxing: ["upper_back", "triceps", "abs", "quadriceps"],
};

// Schwimmstil-Varianten — überschreiben das swimming-Default je nach Stil.
export const SWIM_STYLE_MUSCLES = {
  breast: ["chest", "upper_back", "biceps", "triceps", "abs", "quadriceps", "hamstrings", "adductors", "abductors"], // Brustschwimmen (Grätschbeinschlag)
  back:   ["middle_back", "upper_back", "biceps", "abs", "quadriceps", "adductors", "abductors"],                    // Rückenschwimmen (Flatterkick mit Hüftrotation)
};

// Primary-Mover-Teilmenge von SWIM_STYLE_MUSCLES/ACTIVITY_MUSCLE_GROUPS — der
// Rest bleibt secondary-gewichtet. Brustschwimmen: Pec-Zug ist die
// Hauptantriebsphase (nicht nur "irgendein beteiligter Muskel" wie bislang
// pauschal angenommen), Rückenschwimmen analog der Latzug-Phase.
export const SWIM_STYLE_PRIMARY_MUSCLES = {
  breast: ["chest"],
  back:   ["middle_back"],
};

/**
 * Single source of truth for deriving a session's primary type + label.
 * A session with exercises (strength) stays primary even when an activity
 * finisher (e.g. HIIT/cardio) is attached — the finisher is reported
 * separately via hasFinisher, never as a label override.
 * Used by SessionHistory (Session tab) (ReviewHistory ist im Logbuch aufgegangen).
 */
export function classifySession(session) {
  // Index-Zeilen (workoutIndex) tragen nur exerciseCount statt der exercises-Liste.
  const hasExercises = (Array.isArray(session?.exercises) && session.exercises.length > 0) || Number(session?.exerciseCount) > 0;
  const isActivity = !hasExercises && (session?.sessionMode === 'cardio' || !!session?.activity);
  const hasFinisher = hasExercises && !!session?.activity;
  const actType = session?.activity?.type;
  const label = isActivity ? (ACTIVITY_LABELS[actType] || 'Ausdauer') : session?.block;
  return { hasExercises, isActivity, hasFinisher, actType, label };
}

/**
 * Returns a CSS color string for a given session.
 * - If sessionMode === 'cardio', uses orange as a general cardio color
 *   (or the specific activity-type color if available).
 * - Falls back to block-name lookup for strength sessions.
 */
export function getBlockColor(block, activity, sessionMode) {
  // Prefer specific activity-type color
  if (activity?.type && BLOCK_COLORS[activity.type]) return BLOCK_COLORS[activity.type];
  // General cardio fallback (orange)
  if (sessionMode === 'cardio') return "#f97316";
  if (!block) return "var(--accent)";
  for (const [key, color] of Object.entries(BLOCK_COLORS)) {
    if (block.toLowerCase().includes(key)) return color;
  }
  return "var(--accent)";
}
