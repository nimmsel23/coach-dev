// Spiegel des 6Pack-Programms (~/6pack-dev/SixPackApp.jsx): 8 Wochen à 7 Tage,
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
