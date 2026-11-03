// Bundle with esbuild for Node: the app's activity modules use Vite-style imports.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildKbMap } from './db/shared/kbLookup.js';
import { computeMuscleScores } from './superkompensation.js';
import { toISODate } from './db/shared/dates.js';

test('recovery resolves a renamed exercise by ID and retains logged muscle snapshots', () => {
  const kb = buildKbMap([{
    exercise_id: 'press', display_name: 'New name',
    primary_muscles: ['chest'], secondary_muscles: ['triceps'],
  }]);
  const result = computeMuscleScores([{
    date: toISODate(), exercises: [
      { exercise_id: 'press', name: 'Old name', secondaryMuscles: ['shoulders'] },
    ],
  }], kb, (muscle) => muscle);
  assert.equal(result.lastSeen.chest?.type, 'strength');
  assert.equal(result.lastSeen.shoulders?.type, 'strength');
  assert.equal(result.lastSeen.triceps, undefined);
});

test('recovery resolves aliases when a session has no catalog ID', () => {
  const kb = buildKbMap([{ exercise_id: 'row', display_name: 'Rudern', aliases: ['Row'], primary_muscles: ['middle_back'] }]);
  const result = computeMuscleScores([{ date: toISODate(), exercises: [{ name: 'Row' }] }], kb, (muscle) => muscle);
  assert.equal(result.lastSeen.middle_back?.type, 'strength');
});
