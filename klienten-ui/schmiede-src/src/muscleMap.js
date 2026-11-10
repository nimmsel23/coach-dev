/** Slim RBH-Slug-Map für Schmiede (ohne KB-YAML-Stack). */

const BY_NUMERIC = {
  100: "chest", 101: "chest", 102: "chest", 103: "chest", 104: "chest", 105: "chest",
  201: "upper-back", 205: "upper-back", 207: "upper-back",
  202: "trapezius", 203: "trapezius", 204: "trapezius",
  206: "lower-back",
  301: "front-deltoids", 302: "front-deltoids", 303: "back-deltoids",
  401: "triceps",
  402: "biceps", 403: "biceps",
  404: "forearm", 405: "forearm", 406: "forearm", 407: "forearm",
  501: "abs", 504: "abs", 506: "abs", 507: "abs", 508: "abs",
  502: "obliques", 503: "obliques",
  601: "quadriceps",
  602: "adductor",
  603: "gluteal", 608: "gluteal", 609: "gluteal",
  604: "hamstring", 605: "hamstring", 606: "hamstring",
  701: "calves", 702: "calves",
};

const BY_WORD = {
  chest: "chest",
  pectorals: "chest",
  pecs: "chest",
  calves: "calves",
  quadriceps: "quadriceps",
  quads: "quadriceps",
  glutes: "gluteal",
  gluteal: "gluteal",
  gluteus: "gluteal",
  hamstrings: "hamstring",
  hamstring: "hamstring",
  forearms: "forearm",
  forearm: "forearm",
  abs: "abs",
  abdominals: "abs",
  core: "abs",
  obliques: "obliques",
  biceps: "biceps",
  triceps: "triceps",
  trapezius: "trapezius",
  traps: "trapezius",
  upper_back: "upper-back",
  "upper-back": "upper-back",
  upperback: "upper-back",
  middle_back: "upper-back",
  "middle-back": "upper-back",
  lats: "upper-back",
  latissimus: "upper-back",
  latissimus_dorsi: "upper-back",
  lower_back: "lower-back",
  "lower-back": "lower-back",
  lowerback: "lower-back",
  shoulders: "front-deltoids",
  deltoids: "front-deltoids",
  delts: "front-deltoids",
  front_deltoids: "front-deltoids",
  rear_deltoids: "back-deltoids",
  back_deltoids: "back-deltoids",
  abductors: "abductors",
  adductors: "adductor",
  adductor: "adductor",
};

export function muscleToRbhSlug(raw) {
  if (!raw) return null;
  const text = String(raw).trim().toLowerCase();
  if (!text) return null;
  const num = text.match(/^(\d+)/);
  if (num && BY_NUMERIC[Number(num[1])]) return BY_NUMERIC[Number(num[1])];
  const word = text
    .replace(/^\d+_/, "")
    .replace(/[\s-]+/g, "_")
    .replace(/__+/g, "_");
  return BY_WORD[word] || BY_WORD[word.replace(/_/g, "")] || null;
}

export function exercisesToModelData(exercises) {
  const scores = {};
  for (const ex of Array.isArray(exercises) ? exercises : []) {
    const primary = ex?.primaryMuscles || ex?.primary_muscles || ex?.muscles || [];
    const secondary = ex?.secondaryMuscles || ex?.secondary_muscles || [];
    for (const m of primary) {
      const slug = muscleToRbhSlug(m);
      if (slug) scores[slug] = (scores[slug] || 0) + 2;
    }
    for (const m of secondary) {
      const slug = muscleToRbhSlug(m);
      if (slug) scores[slug] = (scores[slug] || 0) + 1;
    }
  }
  return Object.entries(scores).map(([muscle, score]) => ({
    name: muscle,
    muscles: [muscle],
    frequency: Math.ceil(score),
  }));
}
