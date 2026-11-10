import assert from 'node:assert/strict'
import { Hono } from 'hono'
import { stravaRoutes } from '../server/routes/strava.mjs'
const calls = []
const api = {
  stravaStatus: (dataDir) => ({ dataDir }),
  buildAuthorizeUrl: () => 'https://www.strava.com/oauth/authorize?client_id=test',
  exchangeCodeForTokens: async (input) => {
    calls.push(input)
  },
  fetchStravaTours: async (input) => [input.dataDir],
  disconnectStrava: (dataDir) => calls.push(dataDir),
}
const app = new Hono()
app.route('/tours/strava', stravaRoutes({ usersRoot: '/tmp/test-strava-users', log: { error() {} }, api }))
const request = (path) => app.request(`/tours/strava/${path}`)
assert.equal((await request('status')).status, 400)
assert.equal((await request('status?uid=../escape')).status, 400)
for (const uid of ['alice', 'bob']) {
  const result = await (await request(`status?uid=${uid}`)).json()
  assert.equal(result.dataDir, `/tmp/test-strava-users/${uid}/fitness`)
  const activities = await (await request(`activities?uid=${uid}`)).json()
  assert.deepEqual(activities.tours, [`/tmp/test-strava-users/${uid}/fitness`])
}
const alice = await request('authorize?uid=alice')
const bob = await request('authorize?uid=bob')
const state = new URL(alice.headers.get('location')).searchParams.get('state')
const cookie = alice.headers.get('set-cookie').split(';')[0]
const callback = `/tours/strava/callback?code=test&state=${state}&uid=bob`
assert.equal((await app.request(callback)).status, 400)
assert.equal(
  (await app.request(callback, { headers: { cookie: bob.headers.get('set-cookie').split(';')[0] } })).status,
  400,
)
assert.equal(calls.length, 0)
assert.equal((await app.request(callback, { headers: { cookie } })).status, 302)
assert.equal(
  calls[0].dataDir,
  '/tmp/test-strava-users/alice/fitness',
  'callback UID comes from validated state, not query',
)
assert.equal((await app.request(callback, { headers: { cookie } })).status, 400, 'state is single use')
await app.request('/tours/strava/disconnect?uid=bob', { method: 'POST' })
assert.equal(calls[1], '/tmp/test-strava-users/bob/fitness')
console.log(
  'Strava routes: UID isolation, required UID, OAuth cookie/state binding, callback routing and replay rejection passed.',
)
