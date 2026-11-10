import assert from 'node:assert/strict'
import { Hono } from 'hono'
import { registerPythonApi } from '../server/lib/python-proxy.mjs'

const app = new Hono()
registerPythonApi(app, 'http://python.invalid')
const originalFetch = globalThis.fetch
const bytes = new Uint8Array([0, 128, 255, 13, 10])
const requests = []
try {
  globalThis.fetch = async (url, init) => {
    requests.push({ url, init })
    if (init.body) assert.deepEqual(new Uint8Array(await new Response(init.body).arrayBuffer()), bytes)
    assert.equal(init.headers.get('authorization'), 'Bearer test-token')
    return new Response(bytes, { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'private, no-store' } })
  }
  const response = await app.request('/api/sixpack-photos/alice/test.png?a=1&a=2', {
    headers: { Authorization: 'Bearer test-token' },
  })
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes)
  assert.equal(requests[0].url, 'http://python.invalid/api/sixpack-photos/alice/test.png?a=1&a=2')
  assert.equal(response.headers.get('cache-control'), 'private, no-store')
  assert.equal(response.headers.get('content-type'), 'image/png')
  const saved = await app.request('/api/sixpack/photos', {
    method: 'POST',
    headers: { Authorization: 'Bearer test-token', 'Content-Type': 'image/png' },
    body: bytes,
  })
  assert.equal(saved.status, 200)
  assert.equal(requests[1].init.headers.get('content-type'), 'image/png')
  assert.equal((await app.request('/sixpack/photos')).status, 404, 'no Node photo-specific route')
  globalThis.fetch = async () => {
    throw Error('offline')
  }
  assert.equal((await app.request('/api/sixpack/photos')).status, 502)
  console.log('Blind API proxy: unchanged path/query, token, binary request/response, no-store and failure passed.')
} finally {
  globalThis.fetch = originalFetch
}
