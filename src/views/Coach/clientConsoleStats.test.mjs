import test from 'node:test'
import assert from 'node:assert/strict'
import { buildClientConsole, formatMacroValue, formatRestDays, macroLines } from './clientConsoleStats.js'

test('Ruhephasen sind der Mittelwert der Abstände im selben Block', () => {
  const model = buildClientConsole([
    { id: 'a', type: 'workout', date: '2026-11-08', block: 'Push', exercises: [{ name: 'Bankdrücken', sets: 3, reps: 8 }] },
    { id: 'b', type: 'workout', date: '2026-11-01', block: 'push', exercises: [{ name: 'Bankdrücken', sets: 3, reps: 8 }] },
    { id: 'c', type: 'workout', date: '2026-11-04', block: 'Push', exercises: [{ name: 'Schrägbank', sets: 3, reps: 10 }] },
    { id: 'd', type: 'workout', date: '2026-11-03', block: 'Pull', exercises: [{ name: 'Rudern', sets: 3, reps: 8 }] },
  ])

  assert.equal(model.workoutCount, 4)
  assert.equal(model.restPhases, 2)
  assert.equal(model.averageRestDays, 3.5)
  assert.equal(model.workouts[0].restDays, 4)
  assert.equal(model.workouts.find((log) => log.id === 'c').restDays, 3)
  assert.equal(model.workouts.find((log) => log.id === 'd').restDays, null)
  assert.equal(formatRestDays(model.averageRestDays), '3,5 Tage')
})

test('eine einzelne Einheit und leere Logs haben keine Ruhephase', () => {
  const single = buildClientConsole([
    { id: 'only', type: 'workout', date: '2026-11-02', block: 'Legs', exercises: [{ name: 'Kniebeuge', reps: 5 }] },
  ])
  assert.equal(single.averageRestDays, null)
  assert.equal(single.restPhases, 0)
  assert.equal(single.workouts[0].restDays, null)

  const empty = buildClientConsole([])
  assert.equal(empty.workoutCount, 0)
  assert.equal(empty.averageRestDays, null)
  assert.equal(empty.macros, null)
})

test('Cardio und Journal zählen nicht als Kraft-Log', () => {
  const model = buildClientConsole([
    { id: 'run', type: 'workout', date: '2026-11-02', sessionMode: 'cardio', block: 'Cardio', activity: { type: 'run' } },
    { id: 'note', type: 'journal', date: '2026-11-03', notes: 'müde' },
    { id: 'push', type: 'workout', date: '2026-11-04', block: 'Push', exercises: [{ name: 'Dips', setsArray: [{ reps: 8 }] }] },
  ])
  assert.deepEqual(model.workouts.map((log) => log.id), ['push'])
  assert.equal(model.averageRestDays, null)
})

test('Makros werden gemittelt, wenn sie vorhanden sind, und sonst weggelassen', () => {
  const model = buildClientConsole(
    [
      { id: 'w1', type: 'workout', date: '2026-11-01', block: 'Push', exercises: [{ name: 'Drücken', sets: 1 }] },
    ],
    [
      { date: '2026-11-01', meals: [{ kcal: 700, protein: 40, carbs: 60, fat: 20 }, { kcal: 500, protein: 30, carbs: 40, fat: 15 }] },
      { date: '2026-11-02', macros: { kcal: 1800, protein: 130, carbs: 160, fat: 55 } },
      { date: '2026-11-03', meals: [{ kcal: 0, protein: 0, carbs: 0, fat: 0 }] },
    ],
  )
  assert.equal(model.macros.days, 2)
  assert.equal(model.macros.kcal.average, 1500)
  assert.equal(model.macros.protein.average, 100)
  assert.equal(model.macros.carbs.average, 130)
  assert.equal(model.macros.fat.average, 45)
  assert.deepEqual(macroLines(model.macros), [
    formatMacroValue('kcal', 1500),
    formatMacroValue('protein', 100),
    formatMacroValue('carbs', 130),
    formatMacroValue('fat', 45),
  ])
  assert.equal(formatMacroValue('kcal', 1500).replace(/\D/g, ''), '1500')
})

test('ein Nutrition-Tag verdrängt Makros derselben Session, eingebettete Makros bleiben sonst sichtbar', () => {
  const replaced = buildClientConsole(
    [{ id: 'w', type: 'workout', date: '2026-11-04', block: 'Pull', kcal: 900, protein: 40, exercises: [{ name: 'Zug', reps: 8 }] }],
    [{ date: '2026-11-04', makros: { kalorien: 2100, protein: 150, kohlenhydrate: 200, fett: 70 } }],
  )
  assert.equal(replaced.macros.kcal.average, 2100)
  assert.equal(replaced.macros.protein.samples, 1)

  const embedded = buildClientConsole([
    { id: 'w', type: 'journal', date: '2026-11-05', makros: { kalorien: 1900, protein: 140, kohlenhydrate: 180, fett: 60 } },
  ])
  assert.equal(embedded.workoutCount, 0)
  assert.equal(embedded.macros.kcal.average, 1900)
  assert.equal(embedded.macros.days, 1)
})
