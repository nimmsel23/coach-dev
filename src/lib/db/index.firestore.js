// Firestore build barrel — re-exports all modular firestore/* + shared/* symbols.
// Vite alias: '@db' → this file when building with --mode firebase.

export * from "./firestore/core.js";
export * from "./firestore/sessions.js";
export * from "./firestore/journal.js";
export * from "./firestore/kb.js";
export * from "./firestore/inbox.js";
export * from "./firestore/coach.js";
export * from "./firestore/assignedPlans.js";
export * from "./firestore/macrocycles.js";
export {
  listRoutines,
  createRoutine,
  getRoutine,
  updateRoutine as updateWorkoutRoutine,
  deleteRoutine as deleteWorkoutRoutine,
  addRoutineExercise,
  updateRoutineExercise,
  deleteRoutineExercise,
  reorderRoutineExercises,
} from "./firestore/routines.js";
export * from "./firestore/analysis.js";
export * from "./firestore/user.js";
export * from "./firestore/slotTemplates.js";
export * from "./firestore/utils.js";

// Shared utilities always available in both modes
export * from "./shared/utils.js";
export * from "./shared/muscle.js";
export * from "./shared/exercise.js";
export * from "./shared/parse.js";
export * from "./shared/favourites.js";

// Kein Fuel-Proxy: Fitness importiert Fuel bewusst nicht direkt. Alte
// Nutrition-History-Namen bleiben in index.firestore.app.js als leere Stubs,
// damit historische Import-Verträge keinen Cross-App-Build erzwingen.
