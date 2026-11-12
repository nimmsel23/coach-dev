import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { getClientRoutinesProgress } from '@db'

// Legacy-Tab „Rotation“: derselbe gepinnte Plan-Editor wie unter
// „Individuellen Plan gestalten“ — keine parallele Schreibpfad-Logik mehr.
const TrainingPlans = lazy(() => import('@plan/views/Plan/TrainingPlans.jsx'))

export default function AssignPlan({ clientUid, clientName }) {
  const [workouts, setWorkouts] = useState([])
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!clientUid) {
      setWorkouts([])
      return
    }
    try {
      const progress = await getClientRoutinesProgress(clientUid)
      setWorkouts(progress?.workouts || [])
      setError('')
    } catch (err) {
      setWorkouts([])
      setError(err.message || 'Trainingsdaten konnten nicht geladen werden.')
    }
  }, [clientUid])

  useEffect(() => {
    load()
  }, [load])

  if (!clientUid) {
    return <p className="text-sm text-fit-muted">Klient wählen, um Rotationen zu verwalten.</p>
  }

  return (
    <div className="space-y-3">
      <header className="rounded-2xl border border-fit-line bg-fit-card p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-fit-accent">Plan · gepinnt</p>
        <h2 className="mt-1 text-lg font-semibold text-fit-ink">
          {clientName ? `Rotationen · ${clientName}` : 'Rotationen'}
        </h2>
        <p className="mt-1 text-sm text-fit-muted">
          Bearbeitet dieselben Macrocycle-/Routinen-Daten wie zuvor — über die Plan-Verwaltung mit geprüften Speicherwegen.
        </p>
      </header>
      {error && (
        <p role="alert" className="rounded-xl border border-red-500/30 p-3 text-sm text-fit-red">
          {error}
        </p>
      )}
      <Suspense fallback={<p role="status">Pläne laden…</p>}>
        <TrainingPlans clientUid={clientUid} templates={[]} workouts={workouts} onChanged={load} />
      </Suspense>
    </div>
  )
}
