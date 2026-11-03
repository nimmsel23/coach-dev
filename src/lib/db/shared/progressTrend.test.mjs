import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateProgressTrend, matchesTrendExercise } from './progressTrend.js';

test('matches concrete IDs across renames without merging same-name variants', () => {
  const target = { id: 'bench-a', name: 'Bankdrücken' };
  assert.equal(matchesTrendExercise({ id: 'bench-a', name: 'Old name' }, target), true);
  assert.equal(matchesTrendExercise({ id: 'bench-b', name: 'Bankdrücken' }, target), false);
  assert.equal(matchesTrendExercise({ name: 'Bankdrücken' }, target), true);
});

test('trend averages only the requested number of prior measurements', () => {
  const history = [100, 100, 100, 100, 60, 60].map((weight, index) => ({
    date: `2026-11-${String(20 - index).padStart(2, '0')}`,
    exercises: [{ id: 'bench-a', name: 'Bankdrücken', setsArray: [{ weight }] }],
  }));
  assert.deepEqual(calculateProgressTrend(history, { id: 'bench-a', name: 'Bankdrücken' }, 4), { status: 'neutral', change: '0.0' });
});

test('uses recorded set weights and ignores other concrete variants', () => {
  const history = [
    { date: '2026-11-03', exercises: [{ id: 'row', name: 'Rudern neu', sets: [{ weight: '55,5' }] }] },
    { date: '2026-11-02', exercises: [{ id: 'other', name: 'Rudern', weight: 100 }] },
    { date: '2026-11-01', exercises: [{ id: 'row', name: 'Rudern alt', weight: 50 }] },
  ];
  assert.deepEqual(calculateProgressTrend(history, { id: 'row', name: 'Rudern' }), { status: 'up', change: '11.0' });
});
