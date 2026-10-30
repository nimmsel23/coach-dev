import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
const fakeUrl = new URL('./firestore-double.mjs', import.meta.url).href;
const macrosUrl = new URL('../../src/lib/db/firestore/macrocycles.js', import.meta.url).href;
const routinesUrl = new URL('../../src/lib/db/firestore/routines.js', import.meta.url).href;
const barrel = `export * from ${JSON.stringify(macrosUrl)}; export {createRoutine, getRoutine, listRoutines, updateRoutine as updateWorkoutRoutine, deleteRoutine as deleteWorkoutRoutine} from ${JSON.stringify(routinesUrl)};`;
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'firebase/firestore' || specifier.endsWith('/offline.js')) return { url: fakeUrl, shortCircuit: true };
  if (specifier.endsWith('/firebase.js')) return { url: 'data:text/javascript,export const db = {};', shortCircuit: true };
  if (specifier === '@db') return { url: `data:text/javascript,${encodeURIComponent(barrel)}`, shortCircuit: true };
  if (specifier === './core.js') return { url: 'data:text/javascript,export const getUid = () => "coach";', shortCircuit: true };
  return next(specifier, context);
} });
const macros = await import(macrosUrl);
const routines = await import(routinesUrl);
const store = await import('../../src/views/Coach/trainingProgramStore.js');
const fake = await import(fakeUrl);
const ex = { exercise_id: 'bench', name: 'Bench', instructions: ['Control'], rest_seconds: 0, notes: 'Cue', templateSets: [{ targetReps: '8-12', targetWeight: 60, targetDuration: null }] };

test('Coach assignment creates client exercises as documents and keeps published snapshots independent', async () => {
  const template = await routines.createRoutine({ name: 'Push' }, 'coach');
  await routines.addRoutineExercise(template.id, ex, 'coach');
  const program = await store.saveCoachProgram('coach', { name: 'Strength', durationWeeks: 8, workouts: [{ templateId: template.id, label: 'Push', weekdays: [0] }] });
  const version = await store.publishCoachProgram('coach', program);
  const id = await store.assignCoachProgram({ coachUid: 'coach', clientUid: 'client', program: { ...program, headVersion: version.number } });
  const plan = (await macros.getMacrocycle('client', id)).macrocycle;
  const assigned = (await routines.getRoutine(plan.routines[0].sourceTemplateId, 'client')).routine;
  assert.equal(assigned.exercises.length, 1, 'Client template must be usable independently of plan snapshot');
  assert.equal(assigned.exercises[0].rest_seconds, 0);
  assert.deepEqual(assigned.exercises[0].templateSets, ex.templateSets);
  assert.equal(plan.published.routines[0].exercises[0].notes, 'Cue');
  assert.equal((await macros.listMacrocycles('coach')).length, 0);
  await macros.updateMacrocycle('client', id, { name: 'Private edit' });
  assert.equal((await macros.getMacrocycle('client', id)).macrocycle.published.name, 'Strength');
  const before = [...fake.records.keys()];
  fake.failCommit();
  await assert.rejects(store.assignCoachProgram({ coachUid: 'coach', clientUid: 'other', program: { ...program, headVersion: version.number } }), /denied/);
  assert.deepEqual([...fake.records.keys()], before, 'Failed assignment must clean up its client data');
});

// Optional real-consumer check: no production dependency or Plan checkout required for Coach's own build.
const planRoot = process.env.PLAN_SOURCE;
test('Actual Plan reader/logger consumes Coach publications; Coach reads Plan composer output', { skip: !planRoot }, async () => {
  const planMacros = await import(pathToFileURL(resolve(planRoot, 'src/lib/db/firestore/macrocycles.js')));
  const logger = await import(pathToFileURL(resolve(planRoot, 'src/lib/db/firestore/workouts.js')));
  const { clientView } = await import(pathToFileURL(resolve(planRoot, 'src/views/Plan/lib/planVersions.js')));
  const [summary] = await planMacros.listMacrocycles('client');
  const plan = (await planMacros.getMacrocycle('client', summary.id)).macrocycle;
  const live = clientView(plan);
  assert.equal(live.name, 'Strength');
  const day = live.routines[0];
  const created = await logger.createWorkout({ name: day.label, routine_id: day.sourceTemplateId, sourcePlanId: plan.id, sourcePlanRoutineId: day.id, sourcePlanVersion: live.headVersion, routine_snapshot: { name: day.label, exercises: day.exercises } }, 'client');
  const { workout } = await logger.getWorkout(created.id, 'client');
  assert.equal(workout.exercises[0].notes, 'Cue');
  assert.equal(workout.exercises[0].rest_seconds, 0);
  assert.equal(workout.exercises[0].sets[0].completed, false);
  const made = await planMacros.createMacrocycle('client', { name: 'Mobile composer', coachUid: 'coach', routines: [day] });
  await planMacros.publishMacrocycle('client', made.id);
  assert.equal((await macros.getMacrocycle('client', made.id)).macrocycle.published.name, 'Mobile composer');
});
