import assert from 'node:assert/strict';
import test from 'node:test';
import { isCuratedExercise, mergeExercisePool, supersededSourceRefs, isSupersededSource, sourceIds } from '../../src/lib/db/shared/catalogSources.js';

test('approval under a raw import ID replaces stale bulk data in search', () => {
  const raw = { exercise_id: 'yuhonas_bench_dips', display_name: 'Bench Dips', source: 'yuhonas' };
  const approved = { ...raw, display_name: 'Dips', source: 'approved' };
  assert.equal(isCuratedExercise(approved), true);
  assert.deepEqual(mergeExercisePool([raw], [approved]), [approved]);
});

test('names and aliases do not hide a distinct variant', () => {
  const approved = { source: 'expert', wger_id: 194, search_aliases: ['Bench Dips'], external_ids: { wger: [194] } };
  const refs = supersededSourceRefs([approved]);
  assert.equal(isSupersededSource({ display_name: 'Bench Dips', yuhonas_id: 'Bench_Dips' }, refs), false);
  assert.equal(isSupersededSource({ wger_id: 194 }, refs), true);
});

test('explicit unlink wins over stale source references', () => {
  const approved = { source: 'approved', source_selection: { yuhonas: null }, yuhonas_id: 'Bench_Dips', external_ids: { yuhonas: ['Bench_Dips'] } };
  assert.equal(isSupersededSource({ yuhonas_id: 'Bench_Dips' }, supersededSourceRefs([approved])), false);
});

test('an old import ID never resurrects a deliberately disconnected source badge', () => {
  assert.deepEqual(sourceIds({ exercise_id: 'yuhonas_bench_dips', source_selection: { yuhonas: null } }, 'yuhonas', true), []);
  assert.deepEqual(sourceIds({ exercise_id: 'yuhonas_bench_dips' }, 'yuhonas', true), ['bench_dips']);
});
