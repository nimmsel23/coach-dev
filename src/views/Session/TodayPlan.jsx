import { useState, useEffect } from 'react'
import { Dumbbell, Check } from 'lucide-react'
import { useUser } from '../../contexts/UserContext'
import { clientView } from '../Plan/lib/planVersions.js'
import { pickActiveMacrocycle } from '../Plan/lib/activeMacrocycle.js'
import { microcycleForWeek, microcycleSummary, planWeek, applyMicrocycleToRoutine } from '../Plan/lib/microcycles.js'
import { routineToSessionDraft, prescriptionText, lastPerformanceMap, withLastPerformance } from '../Plan/lib/sessionDraft.js'
import TemplateLauncher from './TemplateLauncher.jsx'
import { getSessionHistory, watchAuth, listMacrocycles, getMacrocycle, completeRoutine, getLastPerformance } from '@db'

// Habit-artig: Coach legt eine rotierende Liste von Routinen an (Push/Pull/
// Legs o.ä.), kein Kalender/Wochentag. Der Klient sieht immer nur "die
// nächste dran" (Rotation nach Anzahl Completions, nicht nach Datum) und
// tippt sie ab wie einen Habit — Details (Übungen/Sätze/Wdh) bleiben
// sichtbar, nur die Bedienung ist so simpel wie ein Habit-Tracker.
export function useTodayPlan() {
  const userContext = useUser()
  const [authUser, setAuthUser] = useState(null)
  const user = userContext?.user ?? authUser
  const [state, setState] = useState({ loading: true, cycle: null, nextRoutine: null, lastPerformance: null })

  useEffect(() => watchAuth?.((nextUser) => setAuthUser(nextUser)), [])

  async function reload() {
    if (!user?.uid) { setState({ loading: false, cycle: null, nextRoutine: null, lastPerformance: null }); return }
    const list = await listMacrocycles(user.uid)
    if (!list.length) { setState({ loading: false, cycle: null, nextRoutine: null, lastPerformance: null }); return }
    const full = await getMacrocycle(user.uid, pickActiveMacrocycle(list).id)
    if (!full || !(full.macrocycle.routines || []).length) {
      setState({ loading: false, cycle: null, nextRoutine: null, lastPerformance: null })
      return
    }
    const nextRoutine = full.macrocycle.routines[full.nextRoutineIndex]
    const last = await getLastPerformance(user.uid, full.macrocycle.id, nextRoutine.id)
    setState({ loading: false, cycle: full.macrocycle, nextRoutine, lastPerformance: last, clientUid: user.uid })
  }

  useEffect(() => { reload() }, [user?.uid])

  return { ...state, reload }
}

export default function TodayPlan({ cycle: rawCycle, nextRoutine: next, lastPerformance, clientUid, onDone, onLogFreely, onLoadDraft }) {
  const [completing, setCompleting] = useState(false)
  const [history, setHistory] = useState([])
  useEffect(() => { getSessionHistory(30).then(h => setHistory(Array.isArray(h) ? h : [])).catch(() => {}) }, [])
  const cycle = rawCycle.coachUid && rawCycle.coachUid !== clientUid ? clientView(rawCycle) : rawCycle
  const routines = cycle.routines || []
  const [pickedId, setPickedId] = useState(next.id)
  const picked = routines.find(r => r.id === pickedId) || next
  const week = planWeek(cycle)
  const microcycle = microcycleForWeek(cycle.microcycles, week)
  const nextRoutine = applyMicrocycleToRoutine(picked, microcycle, week)

  function lastFor(exerciseId) {
    return lastPerformance?.exercises?.find(e => e.exercise_id === exerciseId)
  }

  async function markDone() {
    setCompleting(true)
    try {
      await completeRoutine(clientUid, cycle.id, picked.id, nextRoutine.exercises || [])
      onDone()
    } finally {
      setCompleting(false)
    }
  }

  return (
    <div className="px-2 mt-3 pb-32 space-y-4">
      <div className="rounded-lg bg-fit-accent/10 border border-fit-accent/30 overflow-hidden">
        <div className="px-4 py-3 border-b border-fit-accent/20">
          <div className="text-[10px] font-black uppercase text-fit-accent">{cycle.name}</div>
          <div className="text-lg font-black text-fit-ink mt-0.5">{nextRoutine.label}</div>
        </div>

        {routines.length > 1 && (
          <div role="group" aria-label="Einheit wählen" className="flex gap-1.5 overflow-x-auto px-3 pt-3">
            {routines.map(r => (
              <button key={r.id} type="button" aria-pressed={r.id === picked.id} onClick={() => setPickedId(r.id)}
                className={`min-h-[44px] shrink-0 rounded-lg px-3 text-xs font-black uppercase ${r.id === picked.id ? 'bg-fit-accent text-fit-bg' : 'border border-fit-line text-fit-dim'}`}>
                {r.label}{r.id === next.id ? ' ·  dran' : ''}
              </button>
            ))}
          </div>
        )}
        {microcycle && <div aria-label="Aktueller Mikrozyklus" className={`mx-3 mt-3 rounded-lg px-3 py-2 text-xs font-bold ${microcycle.kind === 'deload' ? 'bg-green-500/10 text-green-500' : 'bg-fit-accent/10 text-fit-accent'}`}>{microcycleSummary(cycle.microcycles, week)}{microcycle.note ? <span className="block font-normal text-fit-dim">{microcycle.note}</span> : null}</div>}

        {(nextRoutine.exercises || []).length > 0 ? (
          <div className="divide-y divide-fit-line/20">
            {nextRoutine.exercises.map((ex, i) => {
              const last = picked.id === next.id ? lastFor(ex.exercise_id) : null
              return (
                <div key={i} className="px-4 py-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Dumbbell size={13} className="text-fit-dim flex-shrink-0" />
                    <span className="text-sm font-bold text-fit-ink">{ex.name}</span>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-bold text-fit-dim">
                      {prescriptionText(ex) || `${ex.sets ?? ex.target_sets ?? '?'}×${ex.reps ?? ex.target_reps ?? '?'}`}
                    </div>
                    {last && (
                      <div className="text-[10px] text-fit-dim/60">
                        letztes Mal: {last.sets}×{last.reps}{last.weight ? ` @ ${last.weight}kg` : ''}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="px-4 py-4 text-xs text-fit-dim text-center">Keine Übungen hinterlegt</div>
        )}

        <div className="p-3 space-y-2">
          {onLoadDraft && (nextRoutine.exercises || []).length > 0 && (
            <button
              onClick={() => onLoadDraft(withLastPerformance(routineToSessionDraft(picked, { microcycle, week, planName: cycle.name }), lastPerformanceMap(history)))}
              className="w-full btn btn-primary py-3 text-sm font-black uppercase"
            >
              Mit Vorbereitung loggen
            </button>
          )}
          <button
            onClick={markDone}
            disabled={completing}
            className="w-full btn btn-primary py-3 text-sm font-black uppercase flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Check size={16} /> {completing ? 'Speichert…' : `${nextRoutine.label} erledigt`}
          </button>
        </div>
      </div>

      {onLoadDraft && <TemplateLauncher onLoadDraft={(d) => onLoadDraft(withLastPerformance(d, lastPerformanceMap(history)))} />}

      <button
        onClick={onLogFreely}
        className="w-full text-xs font-bold text-fit-dim hover:text-fit-ink uppercase text-center py-2"
      >
        Stattdessen frei loggen
      </button>
    </div>
  )
}
