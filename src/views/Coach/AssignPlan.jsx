import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { getClientRoutinesProgress } from '@db'

// Legacy-Tab „Rotation“: derselbe gepinnte Plan-Editor wie unter
// „Individuellen Plan gestalten“ — keine parallele Schreibpfad-Logik mehr.
const TrainingPlans = lazy(() => import('@plan/views/Plan/TrainingPlans.jsx'))

export default function AssignPlan({ clientUid, clientName }) {
  const [workouts, setWorkouts] = useState([])
  const [error, setError] = useState('')
  const requestRef = useRef(0)

  const load = useCallback(async () => {
    const request = ++requestRef.current
    if (!clientUid) {
      setWorkouts([])
      return
    }
    try {
      const progress = await getClientRoutinesProgress(clientUid)
      if (request !== requestRef.current) return
      setWorkouts(progress?.workouts || [])
      setError('')
    } catch (err) {
      if (request !== requestRef.current) return
      setError(err.message || 'Trainingsdaten konnten nicht geladen werden.')
    }
  }, [clientUid])

  useEffect(() => {
    setWorkouts([])
    setError('')
    load()
    return () => { requestRef.current++ }
  }, [load])

  if (!clientUid) {
    return <p className="text-sm text-fit-muted">Klient wählen, um Rotationen zu verwalten.</p>
  }

  return (
    <div className="space-y-3">
      <header className="rounded-2xl border border-fit-line bg-fit-card p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-fit-accent">Individuelle Trainingspläne</p>
        <h2 className="mt-1 text-lg font-semibold text-fit-ink">
          {clientName ? `Rotationen · ${clientName}` : 'Rotationen'}
        </h2>
        <p className="mt-1 text-sm text-fit-muted">
          Bearbeite Trainingstage, Übungen und Satzvorgaben. Prüfe den Entwurf und gib ihn anschließend frei.
        </p>
      </header>
      {error && (
        <p role="alert" className="rounded-xl border border-red-500/30 p-3 text-sm text-fit-red">
          {error}
          <button type="button" onClick={load} className="ml-2 min-h-11 underline">Erneut versuchen</button>
        </p>
      )}
      <Suspense fallback={<p role="status">Pläne laden…</p>}>
        <TrainingPlans key={clientUid} clientUid={clientUid} templates={[]} workouts={workouts} onChanged={load} />
      </Suspense>
    </div>
  )
}
