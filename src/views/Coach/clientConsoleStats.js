/**
 * Klientenkonsole — reine Auswertung der bereits gelesenen Logs.
 *
 * Ruhephase: Tage zwischen zwei Kraft-Einheiten desselben Blocks
 * (dieselbe Rechnung wie `fitness-log clients`, „Nd rest“). Cardio und
 * Einheiten ohne Block zählen nicht mit. Satzpausen aus Planvorlagen
 * (rest_seconds) sind keine gemessene Ruhephase.
 *
 * Makros: Tageswerte aus den mitgegebenen Einträgen. Ein Nutrition-Tag
 * überschreibt denselben Kalendertag, damit Mahlzeiten nicht doppelt zählen.
 */

const MACRO_KEYS = ['kcal', 'protein', 'carbs', 'fat']

function numberOrNull(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.replace(',', '.'))
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

export function isoDate(value) {
  const text = String(value?.date || value || '')
  const match = text.match(/^(\d{4}-\d{2}-\d{2})/)
  return match ? match[1] : ''
}

function daysBetween(fromIso, toIso) {
  const ms = Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)
  return Math.round(ms / 86400000)
}

function hasLoggedWork(log) {
  return (Array.isArray(log?.exercises) ? log.exercises : []).some((exercise) => {
    if (!exercise || typeof exercise !== 'object') return false
    if (Array.isArray(exercise.setsArray) && exercise.setsArray.length) return true
    if (Array.isArray(exercise.sets) && exercise.sets.length) return true
    return Number(exercise.sets) > 0 || Number(exercise.reps) > 0 || Number(exercise.weight) > 0
  })
}

export function isWorkoutLog(entry) {
  if (!entry || typeof entry !== 'object') return false
  if (entry.type && entry.type !== 'workout' && entry.type !== 'session') return false
  if (entry.sessionMode === 'cardio') return false
  if (entry.activity && !hasLoggedWork(entry) && !String(entry.block || '').trim()) return false
  return Boolean(isoDate(entry) || entry.id)
}

function restKey(log) {
  const block = String(log.block || '').trim().toLowerCase()
  if (block) return block
  const kind = String(log.trainingsart || '').trim().toLowerCase()
  return kind || ''
}

function macroSource(source) {
  if (!source || typeof source !== 'object') return null
  const meals = Array.isArray(source.meals)
    ? source.meals
    : Array.isArray(source.mahlzeiten)
      ? source.mahlzeiten
      : null
  if (meals?.length) return meals
  if (source.macros && typeof source.macros === 'object') return [normalizeMacroNames(source.macros)]
  if (source.makros && typeof source.makros === 'object') return [normalizeMacroNames(source.makros)]
  return [source]
}

function normalizeMacroNames(source) {
  return {
    kcal: source.kcal ?? source.kalorien ?? source.calories,
    protein: source.protein ?? source.eiweiss ?? source.eiweiß,
    carbs: source.carbs ?? source.kohlenhydrate ?? source.kh,
    fat: source.fat ?? source.fett,
  }
}

function dayTotals(source) {
  const parts = macroSource(source)
  if (!parts) return null
  const totals = { kcal: 0, protein: 0, carbs: 0, fat: 0 }
  let any = false
  for (const part of parts) {
    const named = normalizeMacroNames(part || {})
    for (const key of MACRO_KEYS) {
      const value = numberOrNull(named[key])
      if (value == null) continue
      totals[key] += value
      if (value !== 0) any = true
    }
  }
  return any ? totals : null
}

function averageMacros(entries, nutritionDays) {
  const byDate = new Map()
  for (const day of nutritionDays || []) {
    const date = isoDate(day)
    const totals = dayTotals(day)
    if (date && totals) byDate.set(date, totals)
  }
  for (const entry of entries || []) {
    const date = isoDate(entry)
    if (!date || byDate.has(date)) continue
    const totals = dayTotals(entry)
    if (totals) byDate.set(date, totals)
  }
  if (!byDate.size) return null

  const macros = {}
  for (const key of MACRO_KEYS) {
    const samples = [...byDate.values()].map((totals) => totals[key]).filter((value) => value > 0)
    if (!samples.length) continue
    const average = samples.reduce((sum, value) => sum + value, 0) / samples.length
    macros[key] = { average, samples: samples.length }
  }
  return Object.keys(macros).length ? { ...macros, days: byDate.size } : null
}

export function buildClientConsole(entries = [], nutritionDays = []) {
  const workouts = (Array.isArray(entries) ? entries : [])
    .filter(isWorkoutLog)
    .map((entry) => ({ ...entry, date: isoDate(entry) || entry.date || '' }))

  const datesByBlock = new Map()
  const chronological = workouts
    .filter((log) => isoDate(log) && restKey(log))
    .slice()
    .sort((a, b) => isoDate(a).localeCompare(isoDate(b)) || String(a.id).localeCompare(String(b.id)))

  for (const log of chronological) {
    const key = restKey(log)
    const date = isoDate(log)
    const dates = datesByBlock.get(key) || []
    if (dates[dates.length - 1] !== date) dates.push(date)
    datesByBlock.set(key, dates)
  }

  const gapByBlockDate = new Map()
  const gaps = []
  for (const [block, dates] of datesByBlock) {
    for (let index = 1; index < dates.length; index += 1) {
      const days = daysBetween(dates[index - 1], dates[index])
      if (days < 1) continue
      gaps.push(days)
      gapByBlockDate.set(`${block}|${dates[index]}`, days)
    }
  }

  const withRest = workouts
    .map((log) => {
      const key = restKey(log)
      const date = isoDate(log)
      const restDays = key && date ? gapByBlockDate.get(`${key}|${date}`) ?? null : null
      return { ...log, restDays }
    })
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.id).localeCompare(String(a.id)))

  const averageRestDays = gaps.length
    ? gaps.reduce((sum, days) => sum + days, 0) / gaps.length
    : null

  return {
    workouts: withRest,
    workoutCount: withRest.length,
    averageRestDays,
    restPhases: gaps.length,
    macros: averageMacros(entries, nutritionDays),
  }
}

export function formatRestDays(days) {
  if (days == null || !Number.isFinite(days)) return ''
  const rounded = Math.round(days * 10) / 10
  const text = new Intl.NumberFormat('de-AT', { maximumFractionDigits: 1 }).format(rounded)
  return `${text} ${rounded === 1 ? 'Tag' : 'Tage'}`
}

export function formatMacroValue(key, value) {
  if (!Number.isFinite(value)) return ''
  if (key === 'kcal') return `${new Intl.NumberFormat('de-AT', { maximumFractionDigits: 0 }).format(Math.round(value))} kcal`
  const labels = { protein: 'Protein', carbs: 'KH', fat: 'Fett' }
  const amount = new Intl.NumberFormat('de-AT', { maximumFractionDigits: 0 }).format(Math.round(value))
  return `${amount} g ${labels[key] || key}`
}

export function macroLines(macros) {
  if (!macros) return []
  return MACRO_KEYS
    .filter((key) => macros[key]?.samples)
    .map((key) => formatMacroValue(key, macros[key].average))
}
