import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReportRecoveryIndex, reportRecoveryHours } from './reportRecovery.js';
import { buildKbMap, findKbExercise } from './kbLookup.js';

test('recovery uses resolved historical exercise muscles and the nearest earlier day', () => {
  const kb = buildKbMap([{ exercise_id: 'row', display_name: 'Rudern', primary_muscles: ['back'] }]);
  const history = [
    { date: '2026-10-30', exercises: [{ exercise_id: 'row', name: 'Alter Name' }] },
    { date: '2026-10-31', exercises: [{ exercise_id: 'row' }] },
    { date: '2026-11-02', exercises: [{ exercise_id: 'row' }] },
    { date: '2026-11-03', exercises: [{ exercise_id: 'row' }] },
  ];
  const index = buildReportRecoveryIndex(history, (session) => session.exercises.flatMap((exercise) =>
    (findKbExercise(kb, exercise)?.primary_muscles || []).map((muscle) => [muscle, exercise.name, 1])),
  (muscle) => [muscle]);
  assert.deepEqual(reportRecoveryHours('2026-11-03', ['back', 'chest'], index), { back: 24 });
  assert.deepEqual(reportRecoveryHours('2026-10-31', ['back'], index), { back: 24 });
});
