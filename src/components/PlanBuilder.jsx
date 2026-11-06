import { useEffect, useState } from 'react'
import { CalendarDays, Download, RotateCw, Sparkles } from 'lucide-react'
import { getConfig, getPlanSuggestion, exportFitnessData } from '@db'

const TEMPLATES = [
  { id: 'push_day', label: 'Push' },
  { id: 'pull_day', label: 'Pull' },
  { id: 'legs_day', label: 'Legs' },
  { id: 'full_body', label: 'Full Body' },
]

const GOALS = [
  'hypertrophy',
  'strength',
  'technique',
  'general',
]

function sectionValue(value) {
  if (value === null || value === undefined) return 'n/a'
  return String(value)
}

export default function PlanBuilder({ onInspectExercise }) {
  const [template, setTemplate] = useState('full_body')
  const [goal, setGoal] = useState('hypertrophy')
  const [day, setDay] = useState('')
  const [plan, setPlan] = useState(null)
  const [config, setConfig] = useState(null)
  const [loading, setLoading] = useState(false)
  const [exportState, setExportState] = useState('')

  useEffect(() => {
    getConfig().then(d => {
      if (d?.ok) setConfig(d)
    }).catch(() => {})
  }, [])

  async function build() {
    setLoading(true)
    try {
      const data = await getPlanSuggestion({ template, goal, day })
      setPlan(data)
    } catch {
      setPlan(null)
    } finally {
      setLoading(false)
    }
  }

  async function exportPlan() {
    if (!plan) return
    setExportState('exporting')
    try {
      const result = await exportFitnessData({
        kind: 'plan',
        plan,
        force: true,
      })
      setExportState(result?.path ? `Exportiert: ${result.path}` : 'Exportiert')
    } catch {
      setExportState('Export fehlgeschlagen')
    }
    setTimeout(() => setExportState(''), 2600)
  }

  const coverageEntries = Object.entries(plan?.coverage_summary?.muscle_scores || {})
  const regionEntries = Object.entries(plan?.coverage_summary?.body_region_scores || {})

  return (
    <div className="space-y-4">
      <section className="p-4 rounded-2xl" style={{ background: 'var(--card)', border: '1px solid var(--line)' }}>
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em]" style={{ color: 'var(--muted)' }}>
          <Sparkles size={13} />
          Plan Builder
        </div>
        <h2 className="mt-2 text-2xl font-extrabold tracking-tight" style={{ color: 'var(--ink)' }}>
          Plan aus Regeln und lokaler YAML-Library bauen
        </h2>
        <p className="mt-2 text-sm leading-6" style={{ color: 'var(--muted)' }}>
          Wähle Split, Ziel und optional einen Wochentag. Der Builder zieht die Reihenfolge aus `program_rules.yml` und schreibt den Export direkt nach Obsidian.
        </p>
      </section>

      <section className="p-4 rounded-2xl" style={{ background: 'var(--card)', border: '1px solid var(--line)' }}>
        <div className="grid gap-3 md:grid-cols-3">
          <label className="block">
            <div className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--muted)' }}>Split</div>
            <div className="flex flex-wrap gap-2">
              {TEMPLATES.map(item => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTemplate(item.id)}
                  className="px-3 py-2 rounded-xl text-sm font-semibold"
                  style={{
                    background: template === item.id ? 'var(--accent)' + '20' : 'var(--bg2)',
                    color: template === item.id ? 'var(--accent)' : 'var(--muted)',
                    border: `1px solid ${template === item.id ? 'var(--accent)' + '66' : 'var(--line)'}`,
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </label>

          <label className="block">
            <div className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--muted)' }}>Goal</div>
            <select
              value={goal}
              onChange={e => setGoal(e.target.value)}
              className="w-full px-3 py-2 rounded-xl text-sm"
              style={{ background: 'var(--bg2)', border: '1px solid var(--line)', color: 'var(--ink)' }}
            >
              {GOALS.map(item => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>

          <label className="block">
            <div className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--muted)' }}>Day</div>
            <input
              value={day}
              onChange={e => setDay(e.target.value)}
              placeholder="optional, z.B. Mo"
              className="w-full px-3 py-2 rounded-xl text-sm"
              style={{ background: 'var(--bg2)', border: '1px solid var(--line)', color: 'var(--ink)' }}
            />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={build}
            className="px-4 py-2 rounded-xl font-semibold text-sm flex items-center gap-2"
            style={{ background: 'var(--accent)', color: '#071018', border: 'none' }}
          >
            {loading ? <RotateCw size={14} className="animate-spin" /> : <CalendarDays size={14} />}
            Plan erzeugen
          </button>
          <button
            type="button"
            onClick={exportPlan}
            disabled={!plan}
            className="px-4 py-2 rounded-xl font-semibold text-sm flex items-center gap-2"
            style={{
              background: plan ? 'rgba(94,234,212,0.12)' : 'var(--bg2)',
              color: plan ? 'var(--accent)' : 'var(--dim)',
              border: `1px solid ${plan ? 'rgba(94,234,212,0.28)' : 'var(--line)'}`,
              opacity: plan ? 1 : 0.6,
            }}
          >
            <Download size={14} />
            In Obsidian exportieren
          </button>
          {config?.exportPath && (
            <div className="flex items-center text-xs" style={{ color: 'var(--muted)' }}>
              Ziel: {config.exportPath}
            </div>
          )}
        </div>
        {exportState && (
          <div className="mt-3 text-sm" style={{ color: 'var(--accent)' }}>
            {exportState}
          </div>
        )}
      </section>

      {plan && (
        <>
          <section className="p-4 rounded-2xl" style={{ background: 'var(--card)', border: '1px solid var(--line)' }}>
            <div className="flex items-center justify-between gap-2 mb-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--muted)' }}>Generated Plan</div>
                <div className="text-lg font-bold mt-1" style={{ color: 'var(--ink)' }}>
                  {plan.template} {plan.goal ? `· ${plan.goal}` : ''}
                </div>
              </div>
              <div className="text-xs text-right" style={{ color: 'var(--muted)' }}>
                Sets {sectionValue(plan?.coverage_summary?.sets)} · RPE {sectionValue(plan?.coverage_summary?.rpe)}
              </div>
            </div>

            <div className="space-y-2">
              {(plan.slots || []).map(slot => (
                <button
                  key={slot.name}
                  type="button"
                  onClick={() => slot.selected_exercise && onInspectExercise?.(slot.selected_exercise)}
                  className="w-full text-left p-3 rounded-xl"
                  style={{ background: 'var(--bg2)', border: '1px solid var(--line)', cursor: slot.selected_exercise ? 'pointer' : 'default' }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-semibold" style={{ color: 'var(--ink)' }}>{slot.name}</div>
                    <div className="text-xs" style={{ color: 'var(--muted)' }}>
                      {slot.selected_exercise?.exercise_id || 'kein Match'}
                    </div>
                  </div>
                  <div className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
                    {slot.choose_from?.join(' · ')}
                  </div>
                  {slot.selected_exercise && (
                    <div className="mt-2 text-sm" style={{ color: 'var(--accent)' }}>
                      {slot.selected_exercise.display_name || slot.selected_exercise.name}
                    </div>
                  )}
                </button>
              ))}
            </div>
          </section>

          <div className="grid gap-4 md:grid-cols-2">
            <section className="p-4 rounded-2xl" style={{ background: 'var(--card)', border: '1px solid var(--line)' }}>
              <div className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--muted)' }}>Muscle Coverage</div>
              <div className="space-y-2">
                {coverageEntries.length ? coverageEntries.map(([name, score]) => (
                  <div key={name} className="flex items-center justify-between text-sm">
                    <span style={{ color: 'var(--ink)' }}>{name}</span>
                    <span style={{ color: 'var(--accent)' }}>{Number(score).toFixed(1)}</span>
                  </div>
                )) : <p className="text-sm" style={{ color: 'var(--muted)' }}>Noch keine Coverage.</p>}
              </div>
            </section>

            <section className="p-4 rounded-2xl" style={{ background: 'var(--card)', border: '1px solid var(--line)' }}>
              <div className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--muted)' }}>Body Regions</div>
              <div className="space-y-2">
                {regionEntries.length ? regionEntries.map(([name, score]) => (
                  <div key={name} className="flex items-center justify-between text-sm">
                    <span style={{ color: 'var(--ink)' }}>{name}</span>
                    <span style={{ color: 'var(--accent)' }}>{Number(score).toFixed(1)}</span>
                  </div>
                )) : <p className="text-sm" style={{ color: 'var(--muted)' }}>Keine Regionenscores berechnet.</p>}
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  )
}
