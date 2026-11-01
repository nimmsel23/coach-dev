// Spiegel des 6Pack-Programms (~/dev/6pack-dev/SixPackApp.jsx): 8 Wochen à 7 Tage,
// Tag 3 und 7 jeder Woche sind Ruhetage. Reine Funktionen ohne React/Firebase,
// damit sie mit `node --test` prüfbar sind.

export const DAYS_PER_WEEK = 7
export const PROGRAM_WEEKS = 8
export const REST_DAYS_IN_WEEK = [3, 7]

export const dayInWeek = (day) => ((day - 1) % DAYS_PER_WEEK) + 1
export const weekOf = (day) => Math.floor((day - 1) / DAYS_PER_WEEK) + 1
export const isRestDay = (day) => REST_DAYS_IN_WEEK.includes(dayInWeek(day))

// program = Doc users/{uid}/meta/sixpack (oder null, wenn der Klient noch nicht gestartet hat).
export function summarizeProgram(program) {
  const completed = Array.isArray(program?.completedDays) ? program.completedDays.filter(Number.isFinite) : []
  const total = DAYS_PER_WEEK * PROGRAM_WEEKS
  const trainingDays = Array.from({ length: total }, (_, i) => i + 1).filter((d) => !isRestDay(d))
  const trainingDone = trainingDays.filter((d) => completed.includes(d)).length
  const currentDay = Number(program?.currentDay) || 1
  return {
    started: !!program,
    currentDay,
    currentWeek: weekOf(currentDay),
    currentDayInWeek: dayInWeek(currentDay),
    trainingDone,
    trainingTotal: trainingDays.length,
    percent: Math.round((trainingDone / trainingDays.length) * 100),
    lastCompletedOn: program?.lastCompletedOn || null,
    restDate: program?.restDate || null,
    finished: currentDay > total,
  }
}

// Status eines Programm-Tags für die Track-Darstellung.
export function dayStatus(program, day) {
  const done = !!program?.completedDays?.includes(day)
  return {
    rest: isRestDay(day),
    done,
    current: day === (Number(program?.currentDay) || 1),
    doneOn: program?.completedOn?.[day] || null,
  }
}

// Nur Einheiten, die von der 6Pack-App geschrieben wurden (neueste zuerst).
export function pickSixpackSessions(sessions) {
  return sessions
    .filter((s) => (typeof s.source === 'string' ? s.source : s.source?.app) === 'sixpack' || s.program?.id === 'sixpack')
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.id).localeCompare(String(a.id)))
}

export function sessionMinutes(session) {
  const start = Date.parse(session.sessionGate?.startedAt)
  const end = Date.parse(session.sessionGate?.endedAt)
  if (Number.isFinite(start) && Number.isFinite(end) && end > start) return Math.max(1, Math.round((end - start) / 60000))
  return null
}

const dayMs = 86400000
const asDay = (iso) => Date.parse(`${String(iso).slice(0, 10)}T00:00:00Z`)

// Streak = lückenlose Folge von Kalendertagen mit Aktivität (abgehakter Programm-Tag
// inkl. automatisch abgehakter Ruhetage, oder geloggte Einheit). Dieselbe Regel wie
// coach_sixpack.py::compute_streaks: heute noch offen hält die Streak, gestern leer reißt sie.
export function computeStreaks(program, sessions, today = new Date().toISOString().slice(0, 10)) {
  const days = new Set()
  for (const iso of Object.values(program?.completedOn || {})) if (Number.isFinite(asDay(iso))) days.add(asDay(iso))
  for (const s of sessions) if (Number.isFinite(asDay(s.date))) days.add(asDay(s.date))
  const sorted = [...days].sort((a, b) => a - b)
  let longest = 0, run = 0, prev = null
  for (const d of sorted) {
    run = prev !== null && d - prev === dayMs ? run + 1 : 1
    longest = Math.max(longest, run)
    prev = d
  }
  const t = asDay(today)
  let cursor = days.has(t) ? t : t - dayMs
  let current = 0
  while (days.has(cursor)) { current += 1; cursor -= dayMs }
  const last = sorted.length ? sorted[sorted.length - 1] : null
  return { current, longest, activeDays: sorted.length, daysSinceActive: last === null ? null : Math.round((t - last) / dayMs) }
}
