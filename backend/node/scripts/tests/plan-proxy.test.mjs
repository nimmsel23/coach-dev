import test from 'node:test'
import assert from 'node:assert/strict'
import { Hono } from 'hono'
import { registerPythonApi } from '../../server/lib/python-proxy.mjs'

test('generic API proxy forwards method, complete path, client query and body to Python', async () => {
  const app = new Hono()
  registerPythonApi(app, 'http://isolated-python.test')
  const original = globalThis.fetch
  let observed
  globalThis.fetch = async (url, options) => {
    observed = { url, ...options }
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  try {
    const response = await app.request('/api/fitness/coach/macrocycles/client/plan?uid=client', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'X-User-UID': 'client' },
      body: JSON.stringify({ status: 'published' }),
    })
    assert.equal(response.status, 200)
    assert.equal(observed.url, 'http://isolated-python.test/api/fitness/coach/macrocycles/client/plan?uid=client')
    assert.equal(observed.method, 'PATCH')
    assert.equal(observed.headers.get('X-User-UID'), 'client')
    assert.equal(JSON.parse(await new Response(observed.body).text()).status, 'published')
  } finally {
    globalThis.fetch = original
  }
})
