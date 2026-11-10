import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
const noPush = async () => {};
mock.module('../src/server/lib/firestore-admin.mjs', { namedExports: { pushNutritionLog: noPush } });
mock.module('../src/server/lib/v4-bridge.mjs', { namedExports: { callV4: async () => { throw new Error('Isolated v3 test'); } } });
mock.module('../src/server/services/nutrition-catalog.mjs', { namedExports: { loadCatalog: () => ({ items: [] }), addOrUpdateItem: () => {}, upsertLoggedMeal: () => ({}) } });
mock.module('../src/server/services/nutrition-micros.mjs', { namedExports: { getMicrosForMeal: () => null, saveMicrosForMeal: () => {} } });
mock.module('../src/server/services/nutrition-estimate-micros.mjs', { namedExports: { estimateMicros: async () => ({}) } });
mock.module('../src/server/services/nutrition-weekly.mjs', { namedExports: { invalidateWeekMicroCache: () => {} } });
mock.module('../src/server/services/nutrition-enrichment.mjs', { namedExports: { enrichNutritionLog: async meals => ({ meals, changed: false }) } });
const { default: logRoute } = await import('../src/server/routes/nutrition/log.mjs');

test('scan profile survives HTTP post, SQLite read and portion edit', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'fuel-scan-'));
  const app = Fastify();
  app.addHook('onRequest', async req => {
    req.paths = { nutrition: dir, nutritionDb: path.join(dir, 'nutrition.db') }; req.uid = 'test';
  });
  await app.register(logRoute);
  try {
    const meal = { id: 'scan', description: 'Rice', kcal: 200, grams: 150, micros: { calcium_mg: 20 }, micros_meta: { source: 'gemini', reference_grams: 150 }, components: [{ name: 'Rice', amount_g: 150 }], source: 'gemini', barcode: '4006381333931' };
    const added = await app.inject({ method: 'POST', url: '/nutrition/log', payload: { date: '2026-10-16', meal } });
    assert.equal(added.statusCode, 200, added.body);
    const read = await app.inject('/nutrition/log?date=2026-10-16');
    const saved = read.json().data.meals[0];
    for (const key of ['grams', 'micros', 'micros_meta', 'components', 'source', 'barcode']) assert.deepEqual(saved[key], meal[key]);
    const edit = await app.inject({ method: 'PATCH', url: '/nutrition/log', payload: { date: '2026-10-16', meal_id: 'scan', meal: { kcal: 100, grams: 75, micros: { calcium_mg: 10 }, micros_meta: { source: 'gemini', scaling_factor: 0.5 } } } });
    assert.equal(edit.statusCode, 200, edit.body);
    const reread = (await app.inject('/nutrition/log?date=2026-10-16')).json().data.meals[0];
    assert.equal(reread.grams, 75); assert.equal(reread.micros.calcium_mg, 10); assert.equal(reread.micros_meta.scaling_factor, 0.5);
  } finally { await app.close(); await rm(dir, { recursive: true, force: true }); }
});
