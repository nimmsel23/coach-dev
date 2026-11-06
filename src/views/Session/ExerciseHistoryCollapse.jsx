/**
 * ExerciseHistoryCollapse — "Previous stats bar" toggle + expanded history
 * list for ExerciseCard, plus the "Übernehmen"/"Progression" chips that copy
 * the previous sets into today's set grid. Pure presentational — the
 * apply logic (onApplyPrev) lives in ExerciseCard.
 */

import { TrendingUp, TrendingDown, ChevronDown, History, CornerDownLeft, ArrowUp } from 'lucide-react';
import { PROGRESSION_KG } from './utils.js';

const chipStyle = {
  background: 'rgba(var(--accent-rgb,200,255,0),0.06)',
  border: '1px solid rgba(var(--accent-rgb,200,255,0),0.2)',
  color: 'var(--accent)',
};

export default function ExerciseHistoryCollapse({
  prev, trend, showHistory, setShowHistory, canApply = false, onApplyPrev,
}) {
  if (!prev) return null;

  return (
    <>
      {/* Previous stats bar */}
      <button
        onClick={() => setShowHistory(h => !h)}
        className="mt-3 w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all"
        style={{
          background: showHistory ? 'rgba(var(--accent-rgb,200,255,0),0.05)' : 'var(--bg2)',
          border: showHistory ? '1px solid rgba(var(--accent-rgb,200,255,0),0.15)' : '1px solid var(--line)',
        }}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="w-6 h-6 rounded-lg flex items-center justify-center"
            style={{ background: 'var(--card)', border: '1px solid var(--line)' }}
          >
            <History size={11} style={{ color: 'var(--dim)' }} />
          </div>
          <div className="text-left">
            <div
              className="text-[9px] font-black uppercase tracking-[0.2em]"
              style={{ color: 'var(--dim)', opacity: 0.4 }}
            >
              Zuletzt · {prev.date}
            </div>
            <div
              className="text-[11px] font-mono font-bold"
              style={{ color: 'var(--dim)', opacity: 0.8 }}
            >
              {prev.setsArray
                ? `${prev.setsArray.length}×${prev.setsArray[0]?.reps}${prev.setsArray[0]?.weight ? ` @ ${prev.setsArray[0].weight}kg` : ''}`
                : `${prev.sets}×${prev.reps}${prev.weight ? ` @ ${prev.weight}kg` : ''}`}
            </div>
          </div>
        </div>
        <ChevronDown
          size={13}
          style={{
            color: 'var(--dim)',
            opacity: 0.4,
            transform: showHistory ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.2s',
          }}
        />
      </button>

      {/* Werte vom letzten Mal übernehmen */}
      {canApply && (
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => onApplyPrev?.('same')}
            title="Sätze der letzten Session unverändert übernehmen"
            className="flex items-center justify-center gap-1.5 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all active:scale-[0.98]"
            style={chipStyle}
          >
            <CornerDownLeft size={11} strokeWidth={3} />
            Übernehmen
          </button>
          <button
            type="button"
            onClick={() => onApplyPrev?.('progress')}
            title={`Letzte Werte +${PROGRESSION_KG} kg pro Satz (ohne Gewicht: +1 Wdh.)`}
            className="flex items-center justify-center gap-1.5 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all active:scale-[0.98]"
            style={chipStyle}
          >
            <ArrowUp size={11} strokeWidth={3} />
            Progression
          </button>
        </div>
      )}

      {/* Expanded history */}
      {showHistory && (
        <div
          className="mt-2 p-3 rounded-xl space-y-1.5 animate-in slide-in-from-top-2 duration-200"
          style={{ background: 'var(--bg2)', border: '1px solid var(--line)' }}
        >
          {prev.setsArray ? prev.setsArray.map((s, idx) => (
            <div key={idx} className="flex items-center gap-3">
              <span
                className="text-[9px] font-black uppercase w-5"
                style={{ color: 'var(--dim)', opacity: 0.35 }}
              >
                S{idx + 1}
              </span>
              <span
                className="text-[11px] font-mono font-bold"
                style={{ color: 'var(--dim)', opacity: 0.7 }}
              >
                {s.reps} reps{s.weight ? ` @ ${s.weight}kg` : ''}
              </span>
            </div>
          )) : (
            <span
              className="text-[11px] font-mono font-bold"
              style={{ color: 'var(--dim)', opacity: 0.7 }}
            >
              {prev.sets}×{prev.reps}{prev.weight ? ` @ ${prev.weight}kg` : ''}
            </span>
          )}
          {trend && trend.status !== 'neutral' && (
            <div
              className="pt-1.5 mt-1 flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest"
              style={{
                borderTop: '1px solid var(--line)',
                color: trend.status === 'up' ? 'var(--green)' : 'var(--red)',
                opacity: 0.7,
              }}
            >
              {trend.status === 'up' ? <TrendingUp size={9} /> : <TrendingDown size={9} />}
              {trend.change}% zum Vorwert
            </div>
          )}
        </div>
      )}
    </>
  );
}
