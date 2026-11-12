import test from 'node:test';
import assert from 'node:assert/strict';
import { cachedQuery, snapDelete, snapDeletePrefix } from './clientDataIdb.js';

const deferred = () => {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
};

test('invalidated in-flight reads return fresh data and never publish the stale result', async (t) => {
  const oldWindow = globalThis.window;
  globalThis.window = new EventTarget();
  const events = [];
  globalThis.window.addEventListener('vos-coach-cache', (event) => events.push(event.detail));
  try {
    for (const mode of ['key', 'prefix']) {
      await t.test(mode, async () => {
        const key = `feed:client:race-${mode}:100`;
        const started = deferred();
        const oldRead = deferred();
        let reads = 0;
        const pending = cachedQuery(key, async () => {
          reads++;
          if (reads === 1) { started.resolve(); return oldRead.promise; }
          return { status: 'client' };
        });
        await started.promise;
        if (mode === 'key') await snapDelete(key);
        else await snapDeletePrefix(`feed:client:race-${mode}:`);
        oldRead.resolve({ status: 'friend' });
        assert.deepEqual(await pending, { status: 'client' });
        assert.equal(reads, 2);
        assert.deepEqual(events.filter((event) => event.key === key).map((event) => event.data), [{ status: 'client' }]);
      });
    }
    await t.test('other keys are unaffected', async () => {
      let reads = 0;
      await snapDeletePrefix('other:');
      assert.deepEqual(await cachedQuery('profiles:unrelated', async () => { reads++; return { name: 'A' }; }), { name: 'A' });
      assert.equal(reads, 1);
    });
    await t.test('fresh retry failures remain errors instead of resurrecting stale data', async () => {
      const started = deferred();
      const oldRead = deferred();
      let reads = 0;
      const pending = cachedQuery('profiles:failed-retry', async () => {
        if (++reads === 1) { started.resolve(); return oldRead.promise; }
        throw new Error('retry unavailable');
      });
      await started.promise;
      await snapDelete('profiles:failed-retry');
      oldRead.resolve({ stale: true });
      await assert.rejects(pending, /retry unavailable/);
      assert.equal(events.some((event) => event.key === 'profiles:failed-retry'), false);
    });
  } finally {
    if (oldWindow === undefined) delete globalThis.window;
    else globalThis.window = oldWindow;
  }
});
