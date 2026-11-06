/**
 * ExerciseCardHeader — Header block of ExerciseCard: move handles, exercise
 * name, muscle tags, source/trend/recovery badges, volume summary, delete.
 *
 * Pure presentational — all values are computed by the ExerciseCard
 * orchestrator and passed in as props. No logic recomputation here.
 */

import {
  TrendingUp, TrendingDown, X, Clock,
  ChevronDown, ChevronUp,
} from 'lucide-react';

export default function ExerciseCardHeader({
  ex, i, moveEx, removeEx, isFirst, isLast, onInspectExercise,
  muscleTags, trend, exRecoveryHours, volumeSummary,
}) {
  return (
    <div className="flex items-start gap-2">

      {/* Move handles */}
      <div className="flex flex-col gap-0.5 shrink-0 mt-0.5 opacity-20 hover:opacity-60 transition-opacity">
        <button
          onClick={() => moveEx(i, -1)}
          disabled={isFirst}
          className="w-5 h-5 flex items-center justify-center disabled:opacity-0 hover:text-fit-accent transition-all"
        >
          <ChevronUp size={12} />
        </button>
        <button
          onClick={() => moveEx(i, 1)}
          disabled={isLast}
          className="w-5 h-5 flex items-center justify-center disabled:opacity-0 hover:text-fit-accent transition-all"
        >
          <ChevronDown size={12} />
        </button>
      </div>

      {/* Exercise info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3
              onClick={() => onInspectExercise?.(ex)}
              className={`font-black text-[15px] leading-tight tracking-tight transition-colors ${
                onInspectExercise ? 'cursor-pointer hover:text-fit-accent' : ''
              }`}
              style={{ color: 'var(--ink)' }}
            >
              {ex.name || <span style={{ color: 'var(--dim)', fontStyle: 'italic' }}>Übung</span>}
            </h3>

            <div className="flex flex-wrap items-center gap-2 mt-1.5">
              {/* Muscle tags */}
              {muscleTags.map(label => (
                <span
                  key={label}
                  className="text-[9px] font-bold uppercase tracking-widest"
                  style={{ color: 'var(--dim)', opacity: 0.6 }}
                >
                  {label}
                </span>
              ))}

              {/* Source badge */}
              {ex.source && ex.source !== 'expert' && (
                <span
                  className="text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-[0.15em]"
                  style={{
                    background: ex.source === 'bulk' ? 'var(--bg2)' : 'rgba(255,140,50,0.08)',
                    color: ex.source === 'bulk' ? 'var(--dim)' : 'var(--orange)',
                    border: `1px solid ${ex.source === 'bulk' ? 'var(--line)' : 'rgba(255,140,50,0.15)'}`,
                  }}
                >
                  {ex.source}
                </span>
              )}

              {/* Trend */}
              {trend && trend.status !== 'neutral' && (
                <div
                  className="flex items-center gap-1 text-[9px] font-black px-1.5 py-0.5 rounded-full"
                  style={{
                    background: trend.status === 'up' ? 'rgba(var(--green-rgb,80,200,100),0.1)' : 'rgba(var(--red-rgb,255,80,80),0.1)',
                    color: trend.status === 'up' ? 'var(--green)' : 'var(--red)',
                  }}
                >
                  {trend.status === 'up' ? <TrendingUp size={9} /> : <TrendingDown size={9} />}
                  {trend.change}%
                </div>
              )}

              {/* Recovery */}
              {exRecoveryHours !== null && (
                <div
                  className="flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-widest"
                  style={{
                    background: 'rgba(var(--accent-rgb,200,255,0),0.06)',
                    color: 'var(--accent)',
                  }}
                >
                  <Clock size={9} />
                  {exRecoveryHours}h
                </div>
              )}

              {/* Volume summary */}
              {volumeSummary && (
                <span
                  className="text-[9px] font-mono font-bold"
                  style={{ color: 'var(--dim)', opacity: 0.5 }}
                >
                  {volumeSummary}
                </span>
              )}
            </div>
          </div>

          {/* Delete */}
          <button
            onClick={() => removeEx(i)}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-all shrink-0"
            style={{ color: 'var(--dim)' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,80,80,0.08)'; e.currentTarget.style.color = 'var(--red)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--dim)'; }}
          >
            <X size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
