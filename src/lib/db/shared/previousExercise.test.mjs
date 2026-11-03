import test from 'node:test';
import assert from 'node:assert/strict';
import { previousExerciseEntries, previousExerciseFor } from './previousExercise.js';

test('previous workout is earlier than the open date and respects exercise identity', () => {
  const history = [
    { date: '2026-11-04', exercises: [{ id: 'row', name: 'Rudern', weight: 100 }] },
    { date: '2026-11-02', exercises: [{ id: 'different', name: 'Rudern', weight: 90 }] },
    { date: '2026-10-30', exercises: [{ id: 'row', name: 'Alter Name', weight: 50 }] },
    { date: '2026-11-03', exercises: [{ id: 'row', name: 'Rudern', weight: 80 }] },
  ];
  const entries = previousExerciseEntries(history, '2026-11-03');
  assert.equal(previousExerciseFor(entries, { id: 'row', name: 'Rudern' }).weight, 50);
  assert.equal(previousExerciseFor(entries, { id: 'different', name: 'Rudern' }).weight, 90);
});

test('exact name matches older records without an ID but never a different ID', () => {
  const entries = previousExerciseEntries([
    { date: '2026-11-01', exercises: [{ name: 'Rudern', weight: 40 }] },
    { date: '2026-11-02', exercises: [{ id: 'another', name: 'Rudern', weight: 70 }] },
  ], '2026-11-03');
  assert.equal(previousExerciseFor(entries, { id: 'row', name: 'Rudern' }).weight, 40);
});
