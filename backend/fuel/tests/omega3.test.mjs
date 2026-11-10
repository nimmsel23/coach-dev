import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { OMEGA3_KEYS, OMEGA3_RULES, normalizeOmega3, omega3Coverage } from '../src/shared/config/omega3.mjs';
import { DACH, MICRO_KEYS, getStatus } from '../src/shared/config/dach.mjs';
import { scanToMeal, scaleMeal } from '../../../fuel-dev/src/client/lib/mealDetails.js';

test('omega recognition keeps unknown separate from zero and never converts ALA to EPA', () => {
  assert.deepEqual(normalizeOmega3({ omega3_ala_mg: 2500 }), { omega3_ala_mg: 2500 });
  assert.deepEqual(normalizeOmega3({ omega3_epa_mg: null, omega3_dha_mg: -1, omega3_dpa_mg: Infinity }), {});
  const profile = normalizeOmega3({ omega3_mg: 1000, omega3_epa_mg: 180, omega3_dha_mg: 120, omega3_epa_dha_mg: 999 });
  assert.equal(profile.omega3_epa_dha_mg, 300);
  assert.equal(profile.omega3_mg, 1000);
  assert.equal(normalizeOmega3({ omega3_ala_mg: 0, omega3_epa_mg: 180, omega3_dha_mg: 120, omega3_dpa_mg: 5 }).omega3_mg, 305);
  assert.equal(DACH.omega3_mg.value, null);
  assert.equal(DACH.omega3_epa_dha_mg.value, 250);
  assert.equal(getStatus(1000, null), 'unknown');
  assert.ok(OMEGA3_KEYS.every(key => MICRO_KEYS.includes(key)));
  assert.equal(OMEGA3_RULES, readFileSync(new URL('../fuel/constants/omega3-rules.txt', import.meta.url), 'utf8'));
});

test('scan and portion scaling retain species without counting total twice', () => {
  const meal = scanToMeal({ macros: { kcal: 10 }, micros: { omega3_mg: 1000, omega3_epa_mg: 180, omega3_dha_mg: 120 } });
  const scaled = scaleMeal(meal, 2);
  assert.equal(scaled.micros.omega3_epa_dha_mg, 600);
  assert.equal(scaled.micros.omega3_mg, 2000);
  assert.equal(scaled.micros.omega3_ala_mg, undefined);
  assert.equal(scaleMeal({ micros: { omega3_epa_mg: null } }, 2).micros.omega3_epa_mg, null);
});

test('coverage suppresses scores for unknown or partial profiles, including old total-only logs', () => {
  const status = { omega3_epa_dha_mg: { avg_daily: 300, total_week: 2100, percent_of_dach: 120, status: 'ok' } };
  const complete = omega3Coverage({ day: [{ micros: { omega3_epa_mg: 180, omega3_dha_mg: 120 } }] }, status);
  assert.equal(complete.omega3_epa_dha_mg.percent_of_dach, 120);
  const partial = omega3Coverage({ day: [{ micros: { omega3_epa_mg: 180, omega3_dha_mg: 120 } }, { micros: { omega3_mg: 2000 } }] }, status);
  assert.equal(partial.omega3_epa_dha_mg.coverage, 'partial');
  assert.equal(partial.omega3_epa_dha_mg.percent_of_dach, null);
  const unknown = omega3Coverage({ day: [{ micros: { omega3_mg: 2000 } }] }, status);
  assert.equal(unknown.omega3_epa_dha_mg.avg_daily, null);
});

test('SQLite cache migrates new species as unknown and retains separate EPA/DHA', async () => {
  const { upsertMealMicros, getMealMicros } = await import('../src/server/services/nutrition-db.mjs');
  const options = { nutritionDbPath: path.join(mkdtempSync(path.join(tmpdir(), 'fuel-omega-')), 'nutrition.db') };
  upsertMealMicros('Old meal', 100, { omega3_mg: 800 }, 'test', options);
  assert.equal(getMealMicros('Old meal', options).omega3_epa_mg, null);
  upsertMealMicros('Fish oil', 10, { omega3_epa_mg: 180, omega3_dha_mg: 120 }, 'label', options);
  assert.equal(getMealMicros('Fish oil', options).omega3_epa_mg, 180);
});
