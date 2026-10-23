import test from 'node:test'
import assert from 'node:assert/strict'
import { dayStatus, isRestDay, pickSixpackSessions, sessionMinutes, summarizeProgram, weekOf } from './sixpackProgress.js'

test('Wochen- und Ruhetag-Rechnung', () => {
  assert.equal(weekOf(1), 1)
  assert.equal(weekOf(8), 2)
  assert.equal(weekOf(56), 8)
  assert.deepEqual([1, 3, 7, 10, 14].map(isRestDay), [false, true, true, true, true])
})

test('Zusammenfassung ohne Programm', () => {
  const s = summarizeProgram(null)
  assert.equal(s.started, false)
  assert.equal(s.trainingDone, 0)
  assert.equal(s.trainingTotal, 40)
})

test('Zusammenfassung zählt nur Trainingstage', () => {
  const s = summarizeProgram({ currentDay: 5, completedDays: [1, 2, 3, 4] })
  assert.equal(s.trainingDone, 3)
  assert.equal(s.currentWeek, 1)
  assert.equal(s.currentDayInWeek, 5)
  assert.equal(s.percent, 8)
})

test('Tag-Status', () => {
  const p = { currentDay: 2, completedDays: [1], completedOn: { 1: '2026-10-20' } }
  assert.deepEqual(dayStatus(p, 1), { rest: false, done: true, current: false, doneOn: '2026-10-20' })
  assert.equal(dayStatus(p, 2).current, true)
  assert.equal(dayStatus(p, 3).rest, true)
})

test('nur 6Pack-Sessions, neueste zuerst', () => {
  const list = pickSixpackSessions([
    { id: 'a', date: '2026-10-01', source: { app: 'fitness' } },
    { id: 'b', date: '2026-10-02', source: { app: 'sixpack' } },
    { id: 'c', date: '2026-10-03', program: { id: 'sixpack' } },
  ])
  assert.deepEqual(list.map((s) => s.id), ['c', 'b'])
})

test('Dauer aus sessionGate', () => {
  assert.equal(sessionMinutes({ sessionGate: { startedAt: '2026-10-01T10:00:00Z', endedAt: '2026-10-01T10:12:20Z' } }), 12)
  assert.equal(sessionMinutes({}), null)
})

import { computeStreaks } from './sixpackProgress.js'

test('Streaks: aktuelle und längste, heute offen hält, gestern leer reißt', () => {
  const program = { completedOn: { 1: '2026-10-01', 2: '2026-10-02', 3: '2026-10-03', 4: '2026-10-04', 5: '2026-10-21' } }
  const sessions = [{ date: '2026-10-22' }]
  assert.deepEqual(computeStreaks(program, sessions, '2026-10-22'), { current: 2, longest: 4, activeDays: 6, daysSinceActive: 0 })
  assert.equal(computeStreaks(program, sessions, '2026-10-23').current, 2)
  assert.equal(computeStreaks(program, sessions, '2026-10-24').current, 0)
  assert.equal(computeStreaks(null, [], '2026-10-24').daysSinceActive, null)
})
