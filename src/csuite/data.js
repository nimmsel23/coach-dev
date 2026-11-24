/** Read Klienten / Heute from Coach API (:9150 via Vite proxy). */

async function getJson(path) {
  const res = await fetch(path, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`${path} → ${res.status}`)
  return res.json()
}

export async function fetchClients() {
  const data = await getJson('/api/clients')
  const list = Array.isArray(data?.clients) ? data.clients : Array.isArray(data) ? data : []
  return list.map((c) => ({
    id: c.id,
    name: c.name || c.id,
    status: c.status || '',
    role: c.role || '',
    canDeliver: Boolean(c.canDeliver),
  }))
}

export async function fetchPlanToday(clientId) {
  try {
    const data = await getJson(`/api/client/${encodeURIComponent(clientId)}/plan/today`)
    if (!data?.ok) return null
    const units = Array.isArray(data.einheiten) ? data.einheiten : []
    const first = units[0]
    const exercises = first?.abschnitte?.flatMap((a) => a.übungen || a.uebungen || []) || []
    return {
      date: data.date,
      weekday: data.weekday,
      todayDone: Boolean(data.todayDone),
      unitName: first?.name || null,
      exerciseNames: exercises.map((e) => e.name).filter(Boolean).slice(0, 6),
      unitCount: units.length,
    }
  } catch {
    return null
  }
}

export async function fetchCoachingNotes(clientId) {
  try {
    const data = await getJson(`/api/client/${encodeURIComponent(clientId)}/coaching-notes`)
    const notes = Array.isArray(data?.notes) ? data.notes : []
    return notes.slice(0, 5)
  } catch {
    return []
  }
}

/**
 * Build "Heute im Fokus" cards from clients that can be delivered.
 * Briefing bullets are heuristic stubs until LLM step 2.
 */
export async function buildTodayFocus(clients) {
  const deliverable = clients.filter((c) => c.canDeliver || c.role === 'client')
  const cards = await Promise.all(
    deliverable.map(async (client) => {
      const [today, notes] = await Promise.all([
        fetchPlanToday(client.id),
        fetchCoachingNotes(client.id),
      ])
      const lastNote = notes[0]
      const noteHint = lastNote?.text || lastNote?.body || lastNote?.content || null
      const briefing = [
        today?.unitName
          ? `Geplante Einheit: ${today.unitName}`
          : 'Kein Plan-Heute hinterlegt — Agenda in der Session klären.',
        today?.exerciseNames?.length
          ? `Fokus-Übungen: ${today.exerciseNames.slice(0, 3).join(', ')}`
          : 'Übungsfokus noch offen.',
        noteHint
          ? `Letzte Notiz: ${String(noteHint).slice(0, 120)}`
          : 'Keine Coaching-Notizen — Blockaden aus dem Gespräch holen.',
      ]
      return {
        clientId: client.id,
        name: client.name,
        status: client.status,
        today,
        briefing,
        sessionLabel: today?.unitName ? `Heute · ${today.unitName}` : 'Heute · freies Coaching',
      }
    }),
  )
  return cards
}

export function computeKpis(clients, todayCards, approvals) {
  const active = clients.filter((c) => c.canDeliver || c.role === 'client' || c.status === 'active').length
  const sessionsToday = todayCards.filter((c) => c.today?.unitName && !c.today?.todayDone).length
  const openFollowups = approvals.filter((a) => a.status === 'pending_approval').length
  return { activeClients: active, sessionsToday, openFollowups }
}
