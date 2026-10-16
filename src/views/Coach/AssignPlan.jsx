import { useState, useEffect } from 'react'
import { Dumbbell, Plus, Trash2, X, ChevronDown, ChevronUp, Snowflake } from 'lucide-react'

// Standard-Vorgaben, damit nicht bei jeder Übung Sätze/Wdh von Hand getippt
// werden müssen — nur ein Startpunkt, Coach kann danach trotzdem frei ändern.
const REP_PRESETS = [
  { label: 'Hypertrophie', sets: 3, reps: '8-12' },
  { label: 'Kraft', sets: 5, reps: '5' },
  { label: 'Ausdauer', sets: 3, reps: '15-20' },
  { label: 'Deload', sets: 2, reps: '8-10' },
]
import { useUser } from '../../contexts/UserContext'
import {
  getAllUserProfiles,
  listMacrocycles,
  getMacrocycle,
  createMacrocycle,
  deleteMacrocycle,
  addRoutine,
  updateRoutine,
  deleteRoutine,
} from '@db'
import ExerciseSearch from '../Plan/components/ExerciseSearch.jsx'

export default function AssignPlan({ clientUid: presetClientUid, clientName: presetClientName }) {
  const { user } = useUser()
  const embedded = !!presetClientUid
  const [profiles, setProfiles] = useState({})
  const [selectedClient, setSelectedClient] = useState(presetClientUid || '')
  const [cycles, setCycles] = useState([])
  const [loading, setLoading] = useState(false)

  const [cycle, setCycle] = useState(null)
  const [newName, setNewName] = useState('')
  const [newTotalWeeks, setNewTotalWeeks] = useState(10)
  const [creating, setCreating] = useState(false)
  const [newRoutineLabel, setNewRoutineLabel] = useState('')
  const [newRoutineRest, setNewRoutineRest] = useState(24)
  const [newRoutineDeload, setNewRoutineDeload] = useState(false)
  const [openRoutine, setOpenRoutine] = useState(null)
  const [preset, setPreset] = useState(REP_PRESETS[0])
  const [completions, setCompletions] = useState([])
  const [cycleMeta, setCycleMeta] = useState(null)

  useEffect(() => {
    if (embedded) return
    getAllUserProfiles().then(setProfiles).catch(() => setProfiles({}))
  }, [embedded])

  // Eingebetteter Modus (aus ClientsPanel): Klient ist schon fix, direkt Zyklen laden.
  useEffect(() => {
    if (presetClientUid) selectClient(presetClientUid)
  }, [presetClientUid])

  async function selectClient(clientUid) {
    setSelectedClient(clientUid)
    setCycle(null)
    if (!clientUid) { setCycles([]); return }
    setLoading(true)
    try {
      setCycles(await listMacrocycles(clientUid))
    } finally {
      setLoading(false)
    }
  }

  async function openCycle(cycleId) {
    setLoading(true)
    try {
      const full = await getMacrocycle(selectedClient, cycleId)
      setCycle(full?.macrocycle || null)
      setCompletions(full?.completions || [])
      setCycleMeta(full ? { currentWeek: full.currentWeek, totalWeeks: full.totalWeeks, finished: full.finished } : null)
    } finally {
      setLoading(false)
    }
  }

  async function handleCreate() {
    if (!newName.trim() || !user?.uid || !selectedClient) return
    setCreating(true)
    try {
      const created = await createMacrocycle(selectedClient, { name: newName.trim(), coachUid: user.uid, totalWeeks: Number(newTotalWeeks) || 10 })
      if (created) {
        setNewName('')
        setCycles(await listMacrocycles(selectedClient))
        setCycle(created)
        setCompletions([])
        setCycleMeta({ currentWeek: 1, totalWeeks: created.totalWeeks, finished: false })
      }
    } finally {
      setCreating(false)
    }
  }

  async function handleDeleteCycle(cycleId) {
    await deleteMacrocycle(selectedClient, cycleId)
    setCycles(await listMacrocycles(selectedClient))
    if (cycle?.id === cycleId) setCycle(null)
  }

  async function handleAddRoutine() {
    if (!newRoutineLabel.trim()) return
    const updated = await addRoutine(selectedClient, cycle.id, {
      label: newRoutineLabel.trim(),
      isDeload: newRoutineDeload,
      restHoursAfter: Number(newRoutineRest) || 0,
    })
    if (updated) {
      setCycle(updated)
      setNewRoutineLabel('')
      setNewRoutineDeload(false)
      setOpenRoutine(updated.routines[updated.routines.length - 1].id)
    }
  }

  async function handleDeleteRoutine(routineId) {
    const updated = await deleteRoutine(selectedClient, cycle.id, routineId)
    if (updated) setCycle(updated)
  }

  async function addExercise(routineId, ex) {
    const routine = cycle.routines.find(r => r.id === routineId)
    const exercises = [...(routine.exercises || []), { exercise_id: ex.id, name: ex.name, sets: preset.sets, reps: preset.reps, weight: '' }]
    setCycle(prev => ({ ...prev, routines: prev.routines.map(r => r.id === routineId ? { ...r, exercises } : r) }))
    await updateRoutine(selectedClient, cycle.id, routineId, { exercises })
  }

  async function removeExercise(routineId, idx) {
    const routine = cycle.routines.find(r => r.id === routineId)
    const exercises = routine.exercises.filter((_, i) => i !== idx)
    setCycle(prev => ({ ...prev, routines: prev.routines.map(r => r.id === routineId ? { ...r, exercises } : r) }))
    await updateRoutine(selectedClient, cycle.id, routineId, { exercises })
  }

  async function updateExerciseField(routineId, idx, field, value) {
    const routine = cycle.routines.find(r => r.id === routineId)
    const exercises = routine.exercises.map((ex, i) => i === idx ? { ...ex, [field]: value } : ex)
    setCycle(prev => ({ ...prev, routines: prev.routines.map(r => r.id === routineId ? { ...r, exercises } : r) }))
    await updateRoutine(selectedClient, cycle.id, routineId, { exercises })
  }

  return (
    <div className="space-y-6">
      {embedded ? (
        <h2 className="text-base font-semibold text-fit-ink flex items-center gap-2">
          <Dumbbell size={18} className="text-fit-accent" />
          Trainingsplan {presetClientName ? `— ${presetClientName}` : ''}
        </h2>
      ) : (
        <div className="card p-6">
          <h2 className="text-base font-semibold text-fit-ink mb-4 flex items-center gap-2">
            <Dumbbell size={18} className="text-fit-accent" />
            Trainingszyklen
          </h2>
          <label className="block text-xs font-medium mb-2" style={{ color: 'var(--dim)', opacity: 0.7 }}>Klient auswählen</label>
          <select
            value={selectedClient}
            onChange={(e) => selectClient(e.target.value)}
            className="w-full bg-fit-bg border border-fit-line rounded-xl px-4 py-2 text-sm font-semibold text-fit-ink focus:border-fit-accent outline-none"
          >
            <option value="">Klient wählen…</option>
            {Object.values(profiles).map(p => (
              <option key={p.uid} value={p.uid}>{p.displayName}</option>
            ))}
          </select>
        </div>
      )}

      {selectedClient && !cycle && (
        <>
          <div className="card p-6">
            <h3 className="text-sm font-semibold text-fit-ink mb-3">Neuer Zyklus</h3>
            <div className="flex flex-wrap gap-2">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="z.B. Push Pull Legs"
                className="flex-1 min-w-[200px] bg-fit-bg border border-fit-line rounded-xl px-3 py-2 text-sm text-fit-ink focus:border-fit-accent outline-none"
              />
              <label className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--dim)', opacity: 0.7 }}>
                <input
                  type="number"
                  min={1}
                  max={52}
                  value={newTotalWeeks}
                  onChange={(e) => setNewTotalWeeks(e.target.value)}
                  className="w-16 bg-fit-bg border border-fit-line rounded-lg px-2 py-2 text-fit-ink"
                />
                Wochen
              </label>
              <button
                onClick={handleCreate}
                disabled={creating || !newName.trim()}
                className="btn btn-primary px-4 py-2 text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50"
              >
                <Plus size={14} /> Anlegen
              </button>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-fit-accent/30 border-t-fit-accent rounded-full animate-spin" />
            </div>
          ) : cycles.length === 0 ? (
            <div className="text-center py-12 text-xs" style={{ color: 'var(--dim)', opacity: 0.5 }}>
              <Dumbbell size={28} className="mx-auto mb-2" style={{ opacity: 0.5 }} />
              <p>Noch kein Zyklus für diesen Klienten</p>
            </div>
          ) : (
            <div className="space-y-3">
              {cycles.map(c => (
                <div
                  key={c.id}
                  className="card p-4 flex items-center justify-between hover:border-fit-accent/25 transition-all cursor-pointer"
                  onClick={() => openCycle(c.id)}
                >
                  <div>
                    <h3 className="font-semibold text-sm text-fit-ink">{c.name}</h3>
                    <p className="text-xs mt-1" style={{ color: 'var(--dim)', opacity: 0.6 }}>{c.routineCount || 0} Routinen</p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteCycle(c.id) }}
                    className="p-2 text-fit-dim hover:text-red-400 transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {cycle && (
        <div className="space-y-4">
          <button onClick={() => setCycle(null)} className="text-xs font-semibold text-fit-dim hover:text-fit-ink">
            ← Zurück
          </button>

          <div className="card p-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-fit-ink">{cycle.name}</h3>
              {cycleMeta && (
                <span className={`text-xs font-semibold ${cycleMeta.finished ? 'text-fit-dim' : 'text-fit-accent'}`}>
                  {cycleMeta.finished ? 'Abgeschlossen' : `Woche ${cycleMeta.currentWeek} / ${cycleMeta.totalWeeks}`}
                </span>
              )}
            </div>
            <p className="text-xs mt-1" style={{ color: 'var(--dim)', opacity: 0.6 }}>Rotiert flexibel in dieser Reihenfolge — kein fester Kalendertag.</p>
            {cycleMeta && (
              <div className="h-1.5 bg-fit-bg rounded-full overflow-hidden mt-2">
                <div
                  className="h-full bg-fit-accent transition-all"
                  style={{ width: `${Math.min(100, (cycleMeta.currentWeek / cycleMeta.totalWeeks) * 100)}%` }}
                />
              </div>
            )}
          </div>

          {/* Feedback des Klienten: was wurde tatsächlich trainiert */}
          <div className="card p-4">
            <h4 className="text-xs font-medium mb-2" style={{ color: 'var(--dim)', opacity: 0.7 }}>Erledigt vom Klienten</h4>
            {completions.length === 0 ? (
              <p className="text-xs" style={{ color: 'var(--dim)', opacity: 0.5 }}>Noch nichts abgehakt</p>
            ) : (
              <div className="space-y-1.5">
                {completions.slice(-8).reverse().map((c) => {
                  const routine = cycle.routines.find(r => r.id === c.routineId)
                  return (
                    <div key={c.id} className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-fit-ink">{routine?.label || c.routineId}</span>
                      <span style={{ color: 'var(--dim)', opacity: 0.6 }}>{new Date(c.completedAt).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Routine hinzufügen — Name + Pause danach + optional Deload */}
          <div className="card p-4 space-y-2">
            <div className="flex gap-2">
              <input
                value={newRoutineLabel}
                onChange={(e) => setNewRoutineLabel(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddRoutine()}
                placeholder="z.B. Push"
                className="flex-1 bg-fit-bg border border-fit-line rounded-xl px-3 py-2 text-sm text-fit-ink focus:border-fit-accent outline-none"
              />
              <button
                onClick={handleAddRoutine}
                disabled={!newRoutineLabel.trim()}
                className="btn btn-primary px-4 py-2 text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50"
              >
                <Plus size={14} /> Routine
              </button>
            </div>
            <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--dim)', opacity: 0.7 }}>
              <label className="flex items-center gap-1.5">
                Pause danach
                <input
                  type="number"
                  min={0}
                  value={newRoutineRest}
                  onChange={(e) => setNewRoutineRest(e.target.value)}
                  className="w-16 bg-fit-bg border border-fit-line rounded-lg px-2 py-1 text-fit-ink"
                />
                Std.
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={newRoutineDeload} onChange={(e) => setNewRoutineDeload(e.target.checked)} />
                <Snowflake size={13} /> Deload
              </label>
            </div>
          </div>

          {/* Vorgabe für neu hinzugefügte Übungen — nur ein Startwert */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs" style={{ color: 'var(--dim)', opacity: 0.6 }}>Vorgabe für neue Übungen:</span>
            {REP_PRESETS.map(p => (
              <button
                key={p.label}
                onClick={() => setPreset(p)}
                className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-colors ${
                  preset.label === p.label ? 'bg-fit-accent text-fit-bg' : 'bg-fit-bg border border-fit-line text-fit-dim hover:text-fit-ink'
                }`}
              >
                {p.label} ({p.sets}×{p.reps})
              </button>
            ))}
          </div>

          {/* Routinen — flache Liste, aufklappbar für Übungen, kein Grid */}
          <div className="space-y-2">
            {cycle.routines.map((routine, i) => {
              const isOpen = openRoutine === routine.id
              return (
                <div key={routine.id} className="card overflow-hidden">
                  <button
                    onClick={() => setOpenRoutine(isOpen ? null : routine.id)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-fit-bg2/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-full bg-fit-accent/20 text-fit-accent text-xs font-semibold flex items-center justify-center">{i + 1}</span>
                      <span className="font-semibold text-sm text-fit-ink">{routine.label}</span>
                      {routine.isDeload && <Snowflake size={13} className="text-blue-400" title="Deload" />}
                      <span className="text-xs" style={{ color: 'var(--dim)', opacity: 0.6 }}>{(routine.exercises || []).length} Übungen</span>
                      {routine.restHoursAfter > 0 && (
                        <span className="text-xs" style={{ color: 'var(--dim)', opacity: 0.5 }}>· {routine.restHoursAfter}h Pause danach</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        onClick={(e) => { e.stopPropagation(); handleDeleteRoutine(routine.id) }}
                        className="p-1 text-fit-dim hover:text-red-400"
                      >
                        <Trash2 size={14} />
                      </span>
                      {isOpen ? <ChevronUp size={16} className="text-fit-dim" /> : <ChevronDown size={16} className="text-fit-dim" />}
                    </div>
                  </button>

                  {isOpen && (
                    <div className="p-4 border-t border-fit-line/30 bg-fit-bg/30 space-y-3">
                      {(routine.exercises || []).length > 0 && (
                        <div className="space-y-2">
                          {routine.exercises.map((ex, exIdx) => (
                            <div key={exIdx} className="flex items-center gap-2 bg-fit-bg2/50 rounded-xl px-3 py-2">
                              <span className="flex-1 text-xs font-semibold text-fit-ink truncate">{ex.name}</span>
                              <input
                                type="number"
                                value={ex.sets}
                                onChange={(e) => updateExerciseField(routine.id, exIdx, 'sets', Number(e.target.value))}
                                className="w-12 bg-fit-bg border border-fit-line rounded px-1.5 py-1 text-xs text-center text-fit-ink"
                                title="Sätze"
                              />
                              <span className="text-fit-dim text-xs">×</span>
                              <input
                                value={ex.reps}
                                onChange={(e) => updateExerciseField(routine.id, exIdx, 'reps', e.target.value)}
                                className="w-16 bg-fit-bg border border-fit-line rounded px-1.5 py-1 text-xs text-center text-fit-ink"
                                title="Wiederholungen"
                              />
                              <input
                                value={ex.weight ?? ''}
                                onChange={(e) => updateExerciseField(routine.id, exIdx, 'weight', e.target.value)}
                                placeholder="kg"
                                className="w-14 bg-fit-bg border border-fit-line rounded px-1.5 py-1 text-xs text-center text-fit-ink"
                                title="Gewicht (kg)"
                              />
                              <button onClick={() => removeExercise(routine.id, exIdx)} className="p-1 text-fit-dim hover:text-red-400">
                                <X size={14} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      <ExerciseSearch
                        exclude={(routine.exercises || []).map(e => e.exercise_id)}
                        onAdd={(ex) => addExercise(routine.id, ex)}
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
