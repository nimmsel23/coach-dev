import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateNutritionTargets, EMPTY_NUTRITION_INPUT, nutritionAiContext, normalizeNutritionIdeas, nutritionDraftKey } from '../../lib/nutrition/targets.js';
const profile = { ...EMPTY_NUTRITION_INPUT, age: '35', weight: '80', height: '180', sex: 'm', activity: '1.6', scope: 'general' };
test('Mifflin energy, goal adjustment and macro energy reconcile without double-counting exercise', () => {
  const value = calculateNutritionTargets(profile);
  assert.equal(value.restingKcal, 1755);
  assert.equal(value.maintenanceKcal, 2810);
  assert.equal(value.targetKcal, 2810);
  assert.equal(value.proteinG, 128);
  const cut = calculateNutritionTargets({ ...profile, goal: 'lose', adjustment: '10' });
  assert.equal(cut.targetKcal, 2530);
  assert.ok(Math.abs(cut.macroKcal - cut.targetKcal) <= 2);
  assert.equal(calculateNutritionTargets({ ...profile, goal: 'gain' }).targetKcal, 3090);
  const female = calculateNutritionTargets({ ...profile, sex: 'f' });
  assert.equal(female.restingKcal, 1589);
  assert.ok(value.fuelGoals.carb_ratio >= 0 && value.fuelGoals.carb_ratio <= 100);
});
test('meal allocations conserve every rounded daily total, for every supported count', () => {
  for (let count = 2; count <= 6; count++) {
    const value = calculateNutritionTargets({ ...profile, meals: String(count) });
    for (const [field, target] of [['kcal', 'targetKcal'], ['protein', 'proteinG'], ['fat', 'fatG'], ['carbs', 'carbsG']]) {
      assert.equal(value.mealTargets.reduce((sum, meal) => sum + meal[field], 0), value[target]);
    }
  }
});
test('missing data, exceptional conditions and infeasible macro budgets do not produce targets', () => {
  for (const patch of [{ age: '17' }, { weight: '' }, { sex: '' }, { scope: '' }, { scope: 'clinical' }, { age: 'Infinity' }, { activity: '0' }, { adjustment: '-5', goal: 'lose' }, { weight: '50', height: '190', goal: 'lose' }, { method: 'manual', maintenance: '1500', goal: 'lose' }, { method: 'manual', maintenance: '1500', referenceWeight: '250', proteinPerKg: '2.4' }]) {
    assert.throws(() => calculateNutritionTargets({ ...profile, ...patch }));
  }
  const manual = calculateNutritionTargets({ ...profile, method: 'manual', maintenance: '2400', height: '', sex: '' });
  assert.equal(manual.targetKcal, 2400);
  assert.equal(manual.restingKcal, null);
});
test('AI receives targets and food constraints, never client identity or body profile', () => {
  const input = { ...profile, clientUid: 'private-uid', name: 'Private Name', foods: 'Hafer', exclusions: 'Milch', logistics: '20 Minuten' };
  const context = nutritionAiContext(input, calculateNutritionTargets(input));
  assert.equal(context.exclusions, 'Milch');
  const json = JSON.stringify(context);
  for (const field of ['private-uid', 'Private Name', '"weight"', '"height"', '"age"', '"sex"']) assert.equal(json.includes(field), false);
});
test('AI recipes are bounded, structurally checked and cannot overwrite numeric targets', () => {
  const recipe = { name: 'Haferbrei', ingredients: ['Hafer 70 g trocken'], steps: ['Kochen.'], kcal: 999 };
  const result = normalizeNutritionIdeas({ rationale: 'Einfach', review: ['Mengen prüfen'], recipes: [recipe, recipe], targetKcal: 999 }, 2);
  assert.equal(result.targetKcal, undefined);
  assert.equal(result.recipes[0].kcal, undefined);
  assert.throws(() => normalizeNutritionIdeas({ recipes: [recipe] }, 2));
  assert.notEqual(nutritionDraftKey('coach-a', 'client-a'), nutritionDraftKey('coach-b', 'client-a'));
  assert.notEqual(nutritionDraftKey('coach-a', 'client-a'), nutritionDraftKey('coach-a', 'client-b'));
  assert.throws(() => nutritionDraftKey('', 'client-a'));
});
