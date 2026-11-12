import { registerHooks } from 'node:module'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const fakeUrl = new URL('../../../scripts/tests/firestore-double.mjs', import.meta.url).href
const macrosUrl = new URL('../../lib/db/firestore/macrocycles.js', import.meta.url).href
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('@plan/'))
      return { url: pathToFileURL(resolve('modules/plan/src', specifier.slice(6))).href, shortCircuit: true }
    if (specifier === 'firebase/firestore' || specifier.endsWith('/offline.js'))
      return { url: fakeUrl, shortCircuit: true }
    if (specifier === '@cloud/firebase.js' || specifier.endsWith('/firebase.js'))
      return { url: 'data:text/javascript,export const db = {};', shortCircuit: true }
    return next(specifier, context)
  },
})

const macros = await import(macrosUrl)
const planRoot = resolve('modules/plan')
const exercise = {
  exercise_id: 'bench',
  name: 'Bench',
  instructions: ['Control'],
  rest_seconds: 90,
  notes: 'Cue',
  templateSets: [{ targetReps: '8-12', targetWeight: 60, targetDuration: null }],
}

test('legacy Rotation tab routes through the pinned Plan TrainingPlans editor', () => {
  const source = readFileSync(new URL('./AssignPlan.jsx', import.meta.url), 'utf8')
  assert.match(source, /@plan\/views\/Plan\/TrainingPlans\.jsx/)
  assert.doesNotMatch(source, /ExerciseSearch/)
  assert.doesNotMatch(source, /\bupdateRoutine\b/)
  assert.doesNotMatch(source, /\baddRoutine\b/)
})

test('pinned Plan reader sees coach-created rotation exercises, versions and completions', async () => {
  const created = await macros.createMacrocycle('client', {
    name: 'Push Pull Legs',
    coachUid: 'coach',
    totalWeeks: 6,
    status: 'draft',
  })
  assert.ok(created?.id)
  const withDay = await macros.addRoutine('client', created.id, {
    label: 'Push',
    restHoursAfter: 24,
    exercises: [exercise],
  })
  const dayId = withDay.routines[0].id
  const published = await macros.publishMacrocycle('client', created.id, { message: 'Erste Version', author: 'coach' })
  assert.equal(published.headVersion, 1)
  await macros.completeRoutine('client', created.id, dayId, [{ exercise_id: 'bench', sets: [] }])

  const planMacros = await import(pathToFileURL(resolve(planRoot, 'src/lib/db/firestore/macrocycles.js')))
  const full = await planMacros.getMacrocycle('client', created.id)
  assert.equal(full.macrocycle.name, 'Push Pull Legs')
  assert.equal(full.macrocycle.routines[0].exercises[0].notes, 'Cue')
  assert.equal(full.macrocycle.published.routines[0].exercises[0].rest_seconds, 90)
  assert.equal(full.completions.length, 1)
  const versions = await planMacros.listPlanVersions('client', created.id)
  assert.equal(versions.length, 1)
  assert.equal(versions[0].number, 1)
})
