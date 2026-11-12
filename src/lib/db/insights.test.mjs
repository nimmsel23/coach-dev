import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import process from 'node:process';
import { Buffer } from 'node:buffer';

// Bundle the real adapters with inert dependencies; no credentials or live data.
async function adapter(kind) {
  const file = resolve(`src/lib/db/${kind}/coach.js`);
  const source = await readFile(file, 'utf8');
  const names = [...new Set([...source.matchAll(/import\s*\{([^}]+)\}\s*from/g)]
    .flatMap((m) => m[1].split(',').map((s) => s.trim()).filter(Boolean)))];
  const stub = names.map((name) => `export const ${name} = ${name === 'api' ? 'globalThis.insightsApi' : name === 'LOCAL_FITNESS_API_BASE' ? 'globalThis.insightsBase' : 'null'};`).join('\n');
  const result = await build({
    stdin: { contents: `export { checkClientGaps, getCoachDrafts, reviewCoachDraft } from ${JSON.stringify(file)}`, resolveDir: process.cwd() },
    bundle: true, write: false, format: 'esm', platform: 'node',
    plugins: [{ name: 'isolated-dependencies', setup(b) {
      b.onResolve({ filter: /.*/ }, (args) => args.importer === file ? { path: args.path, namespace: 'stub' } : undefined);
      b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: stub }));
    } }],
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}#${kind}-${globalThis.insightsBase}`);
}

test('Insights adapters preserve failures and require confirmed results', async (t) => {
  const originalFetch = globalThis.fetch;
  let response;
  let failure;
  const request = async () => { if (failure) throw failure; return response; };
  globalThis.insightsApi = { get: request, post: request };
  globalThis.insightsBase = 'https://fixture.invalid';
  globalThis.fetch = async () => { const data = await request(); return { ok: true, json: async () => data }; };
  try {
    for (const kind of ['local', 'firestore']) {
      const api = await adapter(kind);
      await t.test(`${kind}: genuine empty results are valid`, async () => {
        response = { gaps: [], drafts: [], ok: true };
        assert.deepEqual(await api.checkClientGaps('client-a'), []);
        assert.deepEqual(await api.getCoachDrafts({ uid: 'client-a' }), []);
        assert.deepEqual(await api.reviewCoachDraft('draft-a', 'client-a', 'approved'), { gaps: [], drafts: [], ok: true });
      });
      await t.test(`${kind}: connection failures reject instead of reporting no gaps or drafts`, async () => {
        failure = new Error('connection unavailable');
        await assert.rejects(api.checkClientGaps('client-a'), /connection unavailable/);
        await assert.rejects(api.getCoachDrafts({ uid: 'client-a' }), /connection unavailable/);
        await assert.rejects(api.reviewCoachDraft('draft-a', 'client-a', 'approved'), /connection unavailable/);
        failure = null;
      });
      await t.test(`${kind}: malformed results and rejected reviews cannot become success`, async () => {
        for (response of [{}, { ok: false }, { ok: false, gaps: [], drafts: [] }, { ok: true, gaps: {}, drafts: {} }]) {
          await assert.rejects(api.checkClientGaps('client-a'));
          await assert.rejects(api.getCoachDrafts({ uid: 'client-a' }));
          await assert.rejects(api.reviewCoachDraft('draft-a', 'client-a', 'approved'));
        }
      });
    }
    await t.test('firestore: HTTP errors remain failures', async () => {
      globalThis.fetch = async () => ({ ok: false, status: 403 });
      const api = await adapter('firestore');
      await assert.rejects(api.checkClientGaps('a'));
      await assert.rejects(api.getCoachDrafts());
      await assert.rejects(api.reviewCoachDraft('d', 'a', 'approved'));
    });
    await t.test('hosted Coach: missing local service is explicitly unavailable', async () => {
      globalThis.insightsBase = '';
      globalThis.fetch = async () => assert.fail('No request without a configured service');
      const api = await adapter('firestore');
      await assert.rejects(api.checkClientGaps('a'), /nicht verfügbar/);
      await assert.rejects(api.getCoachDrafts(), /nicht verfügbar/);
      await assert.rejects(api.reviewCoachDraft('d', 'a', 'approved'), /nicht verfügbar/);
    });
  } finally {
    globalThis.fetch = originalFetch;
    delete globalThis.insightsApi;
    delete globalThis.insightsBase;
  }
});
