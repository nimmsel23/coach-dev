import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalFitnessFetch } from '../src/lib/db/firestore/localBackend.js';

test('product build rejects local calls without invoking fetch', async () => {
  let calls = 0;
  const request = createLocalFitnessFetch({ product: true, fetchImpl: () => { calls++; } });
  await assert.rejects(request('http://127.0.0.1:6100/fitness/inbox'), /local_fitness_backend_unavailable/);
  assert.equal(calls, 0);
});

test('private build forwards request and response unchanged', async () => {
  const response = { ok: true };
  let args;
  const request = createLocalFitnessFetch({ product: false, fetchImpl: (...received) => { args = received; return response; } });
  assert.equal(await request('/inbox', { method: 'POST' }), response);
  assert.deepEqual(args, ['/inbox', { method: 'POST' }]);
});
