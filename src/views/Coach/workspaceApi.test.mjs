import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchWorkspaceSummary, workspaceForUid } from './workspaceApi.js';

const workspace = { id: 'client', name: 'Klient', uids: ['uid'], plans: [], taskwarriorConfigured: false };
const user = { getIdToken: async () => 'test-token' };
function response(body, status = 200, type = 'application/json') {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': type } });
}
test('signed request uses explicit API origin, no cache and abort signal', async () => {
  const signal = new AbortController().signal;
  const result = await fetchWorkspaceSummary({ user, origin: 'https://coach.test:8443', signal, fetcher: async (url, options) => {
    assert.equal(url, 'https://coach.test:8443/api/clients/workspaces');
    assert.equal(options.headers.Authorization, 'Bearer test-token');
    assert.equal(options.cache, 'no-store');
    assert.equal(options.signal, signal);
    return response({ workspaces: [workspace] });
  } });
  assert.deepEqual(result.workspaces, [workspace]);
});
test('missing auth, unavailable API and malformed replies never become empty successes', async () => {
  await assert.rejects(fetchWorkspaceSummary({ user: null }), /anmelden/);
  for (const result of [response({}, 403), response('offline', 503), response('<html>hosting fallback</html>', 200, 'text/html'), response({}), response({ workspaces: [{ ...workspace, plans: null }] })]) {
    await assert.rejects(fetchWorkspaceSummary({ user, origin: '', fetcher: async () => result }));
  }
});
test('UID matching fails closed on missing or ambiguous workspace assignments', () => {
  assert.equal(workspaceForUid([workspace], 'uid').workspace.id, 'client');
  assert.equal(workspaceForUid([workspace], 'other').status, 'missing');
  assert.deepEqual(workspaceForUid([workspace, { ...workspace, id: 'second' }], 'uid'), { status: 'ambiguous', workspace: null });
});
