import test from 'node:test'
import assert from 'node:assert/strict'
import { buildCoachHash, parseCoachHash } from './coachRoute.js'

const UID = 'WM4bgRvDGxXD7SJHo8yWqaKFRQo2'

test('leerer Hash landet auf den Übungsanfragen', () => {
  assert.deepEqual(parseCoachHash(''), { sub: 'exercises', client: '', detail: 'workouts', date: '' })
  assert.deepEqual(parseCoachHash('#/unbekannt'), parseCoachHash(''))
})

test('Sub-Tabs', () => {
  assert.equal(parseCoachHash('#/catalog').sub, 'catalog')
  assert.equal(parseCoachHash('#/clients').sub, 'clients')
  assert.equal(parseCoachHash('#/clients').client, '')
})

test('Klient mit Detail-Tab und Datum', () => {
  assert.deepEqual(parseCoachHash(`#/clients/${UID}/insights?date=2026-10-15`), {
    sub: 'clients', client: UID, detail: 'insights', date: '2026-10-15',
  })
  assert.equal(parseCoachHash(`#/clients/${UID}`).detail, 'workouts')
  assert.equal(parseCoachHash(`#/clients/${UID}/quatsch`).detail, 'workouts')
  assert.equal(parseCoachHash(`#/clients/${UID}?date=kein-datum`).date, '')
})

test('älterer Push-Link #/coach?client=… wird übersetzt', () => {
  assert.deepEqual(parseCoachHash(`#/coach?client=${UID}&date=2026-10-15`), {
    sub: 'clients', client: UID, detail: 'workouts', date: '2026-10-15',
  })
})

test('build und parse sind zueinander invers', () => {
  const routes = [
    { sub: 'exercises', client: '', detail: 'workouts', date: '' },
    { sub: 'catalog', client: '', detail: 'workouts', date: '' },
    { sub: 'clients', client: '', detail: 'workouts', date: '' },
    { sub: 'clients', client: UID, detail: 'workouts', date: '' },
    { sub: 'clients', client: UID, detail: 'habits', date: '2026-10-15' },
    { sub: 'clients', client: 'uid mit/Sonderzeichen', detail: 'plan', date: '' },
  ]
  for (const route of routes) assert.deepEqual(parseCoachHash(buildCoachHash(route)), route)
})

test('Standard-Detail und Nicht-Klienten-Tabs bleiben kurz', () => {
  assert.equal(buildCoachHash({ sub: 'clients', client: UID }), `#/clients/${UID}`)
  assert.equal(buildCoachHash({ sub: 'catalog', client: UID, date: '2026-10-15' }), '#/catalog')
  assert.equal(buildCoachHash({ sub: 'nix' }), '#/exercises')
})
