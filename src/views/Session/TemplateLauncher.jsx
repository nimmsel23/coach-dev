import { useEffect, useState } from 'react'
import { api } from '../Plan/api.js'
import { routineToSessionDraft } from '../Plan/lib/sessionDraft.js'

// Drill 4: Einzel-Workouts (Vorlagen aus vos-plan) ohne Plan direkt zum Quick-Logging mit Vorbereitung.
export default function TemplateLauncher({ onLoadDraft }) {
  const [state, setState] = useState({ loading: true, routines: [], error: '' })
  const [busyId, setBusyId] = useState(null)

  async function load() {
    setState(s => ({ ...s, loading: true, error: '' }))
    try {
      const { routines } = await api.get('/routines')
      setState({ loading: false, routines: (routines || []).filter(r => r.name), error: '' })
    } catch (err) { setState({ loading: false, routines: [], error: err.message || 'Vorlagen konnten nicht geladen werden.' }) }
  }
  useEffect(() => { load() }, [])

  async function pick(r) {
    setBusyId(r.id)
    try {
      const full = r.exercises?.length ? r : (await api.get(`/routines/${r.id}`)).routine
      if (!full?.exercises?.length) throw new Error('Diese Vorlage hat noch keine Übungen.')
      onLoadDraft(routineToSessionDraft({ ...full, label: full.name }))
    } catch (err) { setState(s => ({ ...s, error: err.message })) }
    finally { setBusyId(null) }
  }

  if (state.loading) return <p role="status" className="text-center text-xs text-fit-dim">Vorlagen laden…</p>
  if (state.error) return <p role="alert" className="text-center text-xs text-fit-red">{state.error} <button onClick={load} className="underline">Erneut versuchen</button></p>
  if (!state.routines.length) return null
  return (
    <section aria-label="Eigene Vorlagen" className="rounded-lg border border-fit-line/40 p-3">
      <h3 className="mb-2 text-[10px] font-black uppercase text-fit-dim">Einzelne Workouts (ohne Plan)</h3>
      <div className="flex flex-wrap gap-1.5">
        {state.routines.map(r => (
          <button key={r.id} disabled={busyId === r.id} onClick={() => pick(r)} className="min-h-[44px] rounded-lg border border-fit-line px-3 text-xs font-bold text-fit-ink disabled:opacity-50">{r.name}</button>
        ))}
      </div>
    </section>
  )
}
