import { useState, useEffect } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { getBodyEntries } from '@db'

function fmt(dateStr) {
  const [, m, d] = dateStr.split('-')
  return `${d}.${m}`
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  return (
    <div className="px-3 py-2 rounded-xl text-xs shadow-lg"
      style={{ background: 'var(--card)', border: '1px solid var(--line)', color: 'var(--ink)' }}>
      <div className="font-semibold mb-1" style={{ color: 'var(--muted)' }}>{label}</div>
      <div>{d.weight_kg} kg</div>
      {d.bmi && <div style={{ color: 'var(--dim)' }}>BMI {d.bmi}</div>}
      {d.body_fat_pct && <div style={{ color: 'var(--dim)' }}>{d.body_fat_pct}% Fett</div>}
    </div>
  )
}

export default function WeightChart({ days = 30 }) {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getBodyEntries(days)
      .then(data => {
        const filtered = (data || [])
          .filter(e => e.weight_kg)
          .sort((a, b) => a.date > b.date ? 1 : -1)
          .map(e => ({ ...e, label: fmt(e.date) }))
        setEntries(filtered)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [days])

  if (loading) return null
  if (entries.length === 0) return null

  const weights = entries.map(e => e.weight_kg)
  const min = Math.floor(Math.min(...weights)) - 1
  const max = Math.ceil(Math.max(...weights)) + 1
  const latest = entries[entries.length - 1]
  const first = entries[0]
  const delta = latest.weight_kg - first.weight_kg
  const deltaColor = delta < 0 ? 'var(--green)' : delta > 0 ? 'var(--red)' : 'var(--muted)'

  return (
    <div data-no-swipe="true" className="mb-4 p-4 rounded-2xl" style={{ background: 'var(--card)', border: '1px solid var(--line)' }}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--muted)' }}>
          Gewicht
        </span>
        <div className="flex items-baseline gap-2">
          <span className="text-lg font-extrabold" style={{ color: 'var(--ink)' }}>
            {latest.weight_kg} kg
          </span>
          {entries.length > 1 && (
            <span className="text-xs font-semibold" style={{ color: deltaColor }}>
              {delta > 0 ? '+' : ''}{delta.toFixed(1)} kg
            </span>
          )}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={120}>
        <LineChart data={entries} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: 'var(--dim)' }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={[min, max]}
            tick={{ fontSize: 10, fill: 'var(--dim)' }}
            axisLine={false}
            tickLine={false}
            tickCount={4}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'var(--line)' }} />
          {latest.bmi && latest.bmi >= 18.5 && latest.bmi <= 24.9 && (
            <ReferenceLine y={latest.weight_kg} stroke="var(--green)" strokeDasharray="3 3" strokeOpacity={0.4} />
          )}
          <Line
            type="monotone"
            dataKey="weight_kg"
            stroke="var(--accent)"
            strokeWidth={2}
            dot={{ r: 3, fill: 'var(--accent)', strokeWidth: 0 }}
            activeDot={{ r: 5, fill: 'var(--accent)' }}
          />
        </LineChart>
      </ResponsiveContainer>

      {latest.bmi && (
        <div className="mt-2 flex gap-3 text-xs" style={{ color: 'var(--dim)' }}>
          <span>BMI {latest.bmi}</span>
          {latest.body_fat_pct && <span>{latest.body_fat_pct}% Fett</span>}
          {latest.resting_hr && <span>{latest.resting_hr} bpm</span>}
        </div>
      )}
    </div>
  )
}
