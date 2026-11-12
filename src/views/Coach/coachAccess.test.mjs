import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { setImmediate } from 'node:timers';

const source = (await readFile(new URL('../../hooks/useCoachAccess.js', import.meta.url), 'utf8'))
  .replace(/^import .*;\n/gm, '')
  .replace('export function useCoachAccess', 'return function useCoachAccess');
const createHook = new Function('useState', 'useEffect', 'doc', 'getDoc', 'db', 'isLocalMode', source);
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return {promise, resolve, reject};
};
const settle = () => new Promise((resolve) => setImmediate(resolve));
const user = (uid, coach = true) => ({uid, getIdTokenResult: async () => ({claims:{coach}})});
const role = (value) => ({exists: () => Boolean(value), data: () => ({role:value})});

// Execute the production hook while controlling the React render/effect boundary.
// In particular, render() does not run passive effects or their cleanup.
function harness({local = false, getDoc = async () => role(null)} = {}) {
  const state = [];
  const effects = [];
  let stateIndex, effectIndex;
  const hook = createHook(
    (initial) => {
      const index = stateIndex++;
      if (!(index in state)) state[index] = initial;
      return [state[index], (next) => { state[index] = typeof next === 'function' ? next(state[index]) : next; }];
    },
    (run, dependencies) => {
      const index = effectIndex++;
      const previous = effects[index];
      if (!previous || dependencies.some((value, i) => value !== previous.dependencies[i])) {
        effects[index] = {run, dependencies, cleanup:previous?.cleanup, pending:true};
      }
    },
    (_db, ...path) => path, getDoc, {}, () => local,
  );
  return {
    render(actor) { stateIndex = 0; effectIndex = 0; return hook(actor); },
    flushEffects() {
      for (const effect of effects) if (effect.pending) {
        effect.cleanup?.();
        effect.pending = false;
        effect.cleanup = effect.run();
      }
    },
    unmount() { for (const effect of effects) effect.cleanup?.(); },
  };
}

test('switching from approved A to unverified B closes access before the new effect runs', async () => {
  const h = harness();
  const a = user('coach-a');
  const pendingB = deferred();
  const b = {uid:'user-b', getIdTokenResult: () => pendingB.promise};
  assert.equal(h.render(a), false);
  h.flushEffects(); await settle();
  assert.equal(h.render(a), true);
  assert.equal(h.render(b), false, 'the first B render must not inherit A approval');
  h.flushEffects();
  assert.equal(h.render(b), false);
  pendingB.resolve({claims:{coach:false}}); await settle();
  assert.equal(h.render(b), false);
  h.unmount();
});

test('logout closes access before effect cleanup; a fresh object with the same UID also needs checking', async () => {
  const h = harness();
  const a = user('coach-a');
  h.render(a); h.flushEffects(); await settle();
  assert.equal(h.render(a), true);
  assert.equal(h.render({...a}), false);
  assert.equal(h.render(null), false);
  h.flushEffects(); await settle();
  assert.equal(h.render(null), false);
  h.unmount();
});

test('late token and role approvals cannot authorize a different actor or a logged-out session', async (t) => {
  for (const phase of ['token', 'role']) for (const target of ['switch', 'logout']) await t.test(`${phase} after ${target}`, async () => {
    const pending = deferred();
    const h = harness({getDoc: () => pending.promise});
    const a = phase === 'token' ? {uid:'a', getIdTokenResult: () => pending.promise} : user('a', false);
    const b = {uid:'b', getIdTokenResult: () => new Promise(() => {})};
    h.render(a); h.flushEffects(); await settle();
    const current = target === 'switch' ? b : null;
    assert.equal(h.render(current), false);
    h.flushEffects();
    pending.resolve(phase === 'token' ? {claims:{coach:true}} : role('coach'));
    await settle();
    assert.equal(h.render(current), false);
    assert.equal(h.render(null), false);
    h.flushEffects();
    h.unmount();
  });
});

test('local and fixed-owner access retain their existing shortcuts without token or role reads', async (t) => {
  for (const [label, local, uid] of [['local',true,'local-coach'], ['owner',false,'59ole36uNpNwml5H6VDYCXyCME92']]) await t.test(label, async () => {
    const h = harness({local, getDoc: () => { throw new Error('Unexpected role read'); }});
    const actor = {uid, getIdTokenResult: () => { throw new Error('Unexpected token read'); }};
    assert.equal(h.render(actor), false);
    h.flushEffects(); await settle();
    assert.equal(h.render(actor), true);
    assert.equal(h.render(null), false);
    h.flushEffects();
    assert.equal(h.render(null), false);
    h.unmount();
  });
});

test('coach token and coach role allow access; absent roles and rejected checks remain denied', async (t) => {
  for (const mode of ['token', 'role', 'absent', 'token-error', 'role-error']) await t.test(mode, async () => {
    const reads = [];
    const h = harness({getDoc: async (path) => {
      reads.push(path);
      if (mode === 'role-error') throw new Error('permission-denied');
      return role(mode === 'role' ? 'coach' : null);
    }});
    const actor = {uid:'candidate', getIdTokenResult: async () => {
      if (mode === 'token-error') throw new Error('token-expired');
      return {claims:{coach: mode === 'token'}};
    }};
    assert.equal(h.render(actor), false);
    h.flushEffects(); await settle();
    assert.equal(h.render(actor), ['token','role'].includes(mode));
    assert.deepEqual(reads, ['token','token-error'].includes(mode) ? [] : [['roles','candidate']]);
    h.unmount();
  });
});
