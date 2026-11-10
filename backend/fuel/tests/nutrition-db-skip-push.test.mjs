import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let pushes = 0;
mock.module('../src/server/lib/firestore-admin.mjs', { namedExports: { pushNutritionLog: async () => { pushes++; } } });
const { upsertMeal, upsertWater, getMealsForDate } = await import('../src/server/services/nutrition-db.mjs');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fuel-skip-push-'));
const options = { nutritionDir: dir, nutritionDbPath: path.join(dir, 'nutrition.db'), uid: 'alice' };
const meal = (id) => ({ id, date: '2026-07-31', description: `Meal ${id}`, kcal: 100 });

test('skipPush schreibt lokal, ohne den Tag zurück nach Firestore zu pushen', () => {
  pushes = 0;
  for (const id of ['a', 'b', 'c']) upsertMeal(meal(id), { ...options, skipPush: true });
  upsertWater('2026-07-31', 500, { ...options, skipPush: true });
  assert.equal(pushes, 0);
  assert.equal(getMealsForDate('2026-07-31', options).length, 3);
});

test('ohne skipPush pusht jede Schreiboperation weiterhin', () => {
  pushes = 0;
  upsertMeal(meal('d'), options);
  upsertWater('2026-07-31', 600, options);
  assert.equal(pushes, 2);
});
