import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export class RoutineError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const requiredId = (value, label = "id") => {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(value)) {
    throw new RoutineError(400, `invalid_${label}`);
  }
  return value;
};
const object = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new RoutineError(400, "object_required");
  return value;
};
const asArray = (value) => Array.isArray(value) ? value : [];
const trackingType = (value) => {
  const raw = String(value || "").trim().toLowerCase();
  if (["bodyweight_reps", "bodyweight", "bodyweight&reps"].includes(raw)) return "bodyweight_reps";
  if (["distance_time", "distance", "distance&time", "cardio"].includes(raw)) return "distance_time";
  if (["duration", "time", "timer"].includes(raw)) return "duration";
  return "weight_reps";
};
function normalizeSet(set, index) {
  const value = object(set);
  return {
    ...value,
    id: value.id || randomUUID(),
    setIndex: value.setIndex ?? index + 1,
    setType: value.setType || "normal",
    targetReps: value.targetReps ?? "8-12",
    targetWeight: value.targetWeight ?? null,
    targetDistance: value.targetDistance ?? null,
    targetDuration: value.targetDuration ?? null,
    progressionStage: value.progressionStage ?? null,
  };
}
export function normalizeRoutineExercise(input, order = 0) {
  const exercise = object(input);
  const count = Math.max(1, Math.min(30, Number(exercise.target_sets) || 3));
  const fallbackType = exercise.drop_set ? "drop" : ["to_failure", "absolute_failure"].includes(exercise.effort) ? "failure" : "normal";
  const rawSets = asArray(exercise.templateSets);
  const templateSets = (rawSets.length ? rawSets : Array.from({ length: count }, () => ({
    targetReps: exercise.target_reps ?? "8-12",
    targetWeight: exercise.target_weight ?? null,
    setType: fallbackType,
  }))).map(normalizeSet);
  return {
    ...exercise,
    id: exercise.id || randomUUID(),
    name: exercise.name || exercise.exercise_id || "Übung",
    trackingType: trackingType(exercise.trackingType || exercise.weight_type),
    primaryMuscles: asArray(exercise.primaryMuscles),
    secondaryMuscles: asArray(exercise.secondaryMuscles),
    yuhonas_id: exercise.yuhonas_id ?? null,
    rest_seconds: exercise.rest_seconds || 90,
    rir: exercise.rir ?? null,
    tempo: exercise.tempo ?? null,
    notes: exercise.notes ?? null,
    order: Number.isInteger(exercise.order) ? exercise.order : order,
    templateSets,
    target_sets: templateSets.length,
    target_reps: templateSets[0].targetReps,
    target_weight: templateSets[0].targetWeight,
    drop_set: templateSets.some((set) => set.setType === "drop"),
    effort: templateSets.some((set) => set.setType === "failure") ? "to_failure" : exercise.effort || "normal",
    weight_type: exercise.weight_type || "kg",
  };
}

export function createRoutineStore(dataRoot) {
  if (!dataRoot || !path.isAbsolute(dataRoot)) throw new Error("absolute_data_root_required");
  const root = path.resolve(dataRoot);
  const queues = new Map();
  const fileFor = (uid) => path.join(root, "users", requiredId(uid, "uid"), "routines.json");
  async function read(uid) {
    try {
      const data = JSON.parse(await fs.readFile(fileFor(uid), "utf8"));
      if (!Array.isArray(data)) throw new RoutineError(500, "invalid_routines_file");
      return data;
    } catch (error) {
      if (error.code === "ENOENT") return [];
      throw error;
    }
  }
  async function write(uid, routines) {
    const file = fileFor(uid);
    await fs.mkdir(path.dirname(file), { recursive: true });
    const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await fs.writeFile(temporary, JSON.stringify(routines, null, 2) + "\n", { flag: "wx" });
      await fs.rename(temporary, file);
    } finally {
      await fs.rm(temporary, { force: true });
    }
  }
  function mutate(uid, action) {
    requiredId(uid, "uid");
    const previous = queues.get(uid) || Promise.resolve();
    const next = previous.catch(() => {}).then(async () => {
      const routines = await read(uid);
      const result = await action(routines);
      await write(uid, routines);
      return result;
    });
    queues.set(uid, next);
    void next.finally(() => { if (queues.get(uid) === next) queues.delete(uid); }).catch(() => {});
    return next;
  }
  function find(routines, id) {
    const routine = routines.find((item) => item.id === requiredId(id));
    if (!routine) throw new RoutineError(404, "not_found");
    return routine;
  }
  function findExercise(routine, id) {
    const exercise = asArray(routine.exercises).find((item) => item.id === requiredId(id));
    if (!exercise) throw new RoutineError(404, "not_found");
    return exercise;
  }
  return {
    async list(uid) {
      return (await read(uid)).slice().sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))
        .map(({ exercises, ...routine }) => ({ ...routine, exerciseCount: asArray(exercises).length }));
    },
    async get(uid, id) {
      const routine = find(await read(uid), id);
      return { ...routine, exercises: asArray(routine.exercises).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map(normalizeRoutineExercise) };
    },
    create(uid, body) {
      const value = object(body);
      if (typeof value.name !== "string" || !value.name.trim()) throw new RoutineError(400, "name_required");
      return mutate(uid, (routines) => {
        const routine = { id: randomUUID(), name: value.name.trim(), goal: value.goal ?? null, category: value.category ?? null, created_at: new Date().toISOString(), exercises: [] };
        routines.push(routine);
        return routine.id;
      });
    },
    patch(uid, id, body) {
      const value = object(body);
      if (["id", "exercises", "created_at"].some((key) => Object.hasOwn(value, key))) throw new RoutineError(400, "protected_field");
      if (Object.hasOwn(value, "name") && (typeof value.name !== "string" || !value.name.trim())) throw new RoutineError(400, "name_required");
      return mutate(uid, (routines) => { Object.assign(find(routines, id), value); });
    },
    remove(uid, id) {
      return mutate(uid, (routines) => { const routine = find(routines, id); routines.splice(routines.indexOf(routine), 1); });
    },
    addExercise(uid, id, body) {
      const value = object(body);
      return mutate(uid, (routines) => {
        const routine = find(routines, id);
        const exercise = normalizeRoutineExercise({ ...value, id: randomUUID(), order: asArray(routine.exercises).length }, asArray(routine.exercises).length);
        routine.exercises ??= [];
        routine.exercises.push(exercise);
        return exercise.id;
      });
    },
    patchExercise(uid, id, exerciseId, body) {
      const value = object(body);
      if (Object.hasOwn(value, "id")) throw new RoutineError(400, "protected_field");
      return mutate(uid, (routines) => {
        const routine = find(routines, id);
        Object.assign(findExercise(routine, exerciseId), value);
        routine.exercises = asArray(routine.exercises).map(normalizeRoutineExercise);
      });
    },
    removeExercise(uid, id, exerciseId) {
      return mutate(uid, (routines) => {
        const routine = find(routines, id);
        const exercise = findExercise(routine, exerciseId);
        routine.exercises.splice(routine.exercises.indexOf(exercise), 1);
      });
    },
    reorder(uid, id, body) {
      const order = object(body).order;
      if (!Array.isArray(order) || !order.every((item) => item && typeof item.order === "number" && Number.isInteger(item.order) && typeof item.id === "string")) throw new RoutineError(400, "invalid_order");
      return mutate(uid, (routines) => {
        const routine = find(routines, id);
        const ids = new Set(asArray(routine.exercises).map((item) => item.id));
        if (order.length !== ids.size || new Set(order.map((item) => item.id)).size !== ids.size || order.some((item) => !ids.has(item.id))) throw new RoutineError(400, "order_must_cover_all_exercises");
        const byId = new Map(order.map((item) => [item.id, item.order]));
        for (const exercise of routine.exercises) exercise.order = byId.get(exercise.id);
      });
    },
  };
}
