/**
 * SetGridEditor — Set grid area of ExerciseCard: pattern/drop-set banner,
 * column headers, set rows (reps/weight inputs with steppers, remove-set),
 * and the "Satz hinzufügen" button. Leere Felder zeigen die Werte desselben
 * Satzes aus der letzten Session (`prevSets`) als Platzhalter.
 *
 * Pure presentational — handlers (updateEx, tryExpandReps, stepReps,
 * stepWeight, removeSet, addSet) and computed values (setsArr, flashSet,
 * expandHint, patternSummary, isDropSet) are all owned by the ExerciseCard
 * orchestrator and passed in as props.
 */

import { useEffect, useRef } from 'react';
import { Plus, ChevronDown, ChevronUp, X } from 'lucide-react';

export default function SetGridEditor({
  i, setsArr, updateEx, removeSet, addSet,
  expandHint, patternSummary, isDropSet,
  flashSet, tryExpandReps, stepReps, stepWeight, prevSets = null,
}) {
  // Enter-Navigation zwischen Satz-Feldern (Tabellen-Kalkulation-artig,
  // statt Browser-Default-Tab-Reihenfolge): Reps → Weight derselben Zeile →
  // Reps der nächsten Zeile, bei der letzten Zeile wird zuerst eine neue
  // Zeile erzeugt. `containerRef` + `data-role`/`data-idx` statt eigener
  // Ref-Arrays pro Zeile, weil Zeilen per addSet/removeSet dynamisch
  // entstehen/verschwinden — ein Query-Scope auf den Grid-Container bleibt
  // dabei robuster als synchron mitgeführte Ref-Listen.
  const containerRef = useRef(null);
  const pendingFocusRef = useRef(null);

  useEffect(() => {
    const pending = pendingFocusRef.current;
    if (!pending) return;
    const el = containerRef.current?.querySelector(
      `[data-role="${pending.field}"][data-idx="${pending.idx}"]`
    );
    if (el) {
      el.focus();
      pendingFocusRef.current = null;
    }
  }, [setsArr.length]);

  function focusField(idx, field) {
    const el = containerRef.current?.querySelector(`[data-role="${field}"][data-idx="${idx}"]`);
    if (el) el.focus();
    return !!el;
  }

  function handleRepsEnter(e, sIdx) {
    if (tryExpandReps(e.target.value, sIdx)) {
      // Pattern-Expand (z.B. "5x5") hat bereits neue Sätze erzeugt —
      // bestehendes Verhalten (Blur) bleibt unverändert, keine zusätzliche
      // Feld-Navigation obendrauf.
      e.target.blur();
      return;
    }
    e.preventDefault();
    focusField(sIdx, 'weight');
  }

  function handleWeightEnter(e, sIdx) {
    e.preventDefault();
    const isLastRow = sIdx === setsArr.length - 1;
    if (!isLastRow) {
      focusField(sIdx + 1, 'reps');
      return;
    }
    pendingFocusRef.current = { idx: sIdx + 1, field: 'reps' };
    addSet(i);
  }

  // Pfeiltasten hoch/runter springen wie in einer Tabellen-Kalkulation
  // zwischen Zeilen derselben Spalte (Reps bleibt Reps, Weight bleibt
  // Weight) — Felder sind `type="text"`, kein nativer Zahlen-Stepper, den
  // das verdrängen würde.
  function handleVerticalNav(e, sIdx, field) {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const targetIdx = e.key === 'ArrowUp' ? sIdx - 1 : sIdx + 1;
    focusField(targetIdx, field);
  }

  if (setsArr.length === 0) return null;

  return (
    <div className="px-3 pb-3" ref={containerRef}>
      {/* Pattern / Drop-set banner */}
      {(expandHint || patternSummary || isDropSet) && (
        <div
          className="flex items-center justify-between gap-2 px-3 py-1.5 mb-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all"
          style={{
            background: expandHint
              ? 'rgba(var(--accent-rgb,200,255,0),0.08)'
              : isDropSet
                ? 'rgba(255,140,50,0.08)'
                : 'var(--bg2)',
            border: expandHint
              ? '1px solid rgba(var(--accent-rgb,200,255,0),0.2)'
              : isDropSet
                ? '1px solid rgba(255,140,50,0.2)'
                : '1px solid var(--line)',
            color: expandHint ? 'var(--accent)' : isDropSet ? 'var(--orange)' : 'var(--dim)',
          }}
        >
          {expandHint
            ? `✓ ${expandHint.sets} × ${expandHint.reps} Reps`
            : isDropSet
              ? '↓ Drop-Set'
              : `Straight · ${patternSummary.count}×${patternSummary.reps}${patternSummary.weight ? ` @ ${patternSummary.weight}kg` : ''}`}
        </div>
      )}

      {/* Column headers */}
      <div className="grid grid-cols-[24px_1fr_auto_1fr_28px] gap-1 px-1 mb-1.5">
        <span />
        <span
          className="text-[9px] font-black uppercase tracking-widest text-center"
          style={{ color: 'var(--dim)', opacity: 0.4 }}
        >
          Reps
        </span>
        <span />
        <span
          className="text-[9px] font-black uppercase tracking-widest text-center"
          style={{ color: 'var(--dim)', opacity: 0.4 }}
        >
          kg
        </span>
        <span />
      </div>

      {/* Set rows */}
      <div className="space-y-1.5">
        {setsArr.map((set, sIdx) => {
          const flashReps   = flashSet?.idx === sIdx && flashSet?.field === 'reps';
          const flashWeight = flashSet?.idx === sIdx && flashSet?.field === 'weight';
          const prevSet     = prevSets?.[sIdx];
          return (
            <div
              key={sIdx}
              className="grid grid-cols-[24px_1fr_auto_1fr_28px] items-center gap-1 animate-in slide-in-from-left-1 duration-150"
            >
              {/* Set label */}
              <span
                className="text-[9px] font-black text-center"
                style={{ color: 'var(--dim)', opacity: 0.3 }}
              >
                {sIdx + 1}
              </span>

              {/* Reps */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => stepReps(sIdx, -1)}
                  className="absolute left-0 top-0 bottom-0 w-9 flex items-center justify-center transition-all z-10 rounded-l-xl"
                  style={{ color: 'var(--dim)', opacity: 0.5 }}
                  onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = 'var(--accent)'; }}
                  onMouseLeave={e => { e.currentTarget.style.opacity = '0.5'; e.currentTarget.style.color = 'var(--dim)'; }}
                >
                  <ChevronDown size={14} />
                </button>
                <input
                  type="text"
                  inputMode="numeric"
                  data-role="reps"
                  data-idx={sIdx}
                  placeholder={prevSet?.reps || (sIdx === 0 ? '5×5' : '—')}
                  value={set.reps || ''}
                  onChange={e => updateEx(i, 'reps', e.target.value, sIdx)}
                  onBlur={e => tryExpandReps(e.target.value, sIdx)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleRepsEnter(e, sIdx);
                    else handleVerticalNav(e, sIdx, 'reps');
                  }}
                  className="w-full text-center font-mono font-black py-2.5 px-9 rounded-xl text-sm outline-none transition-all focus:ring-2 focus:ring-[var(--accent)]"
                  style={{
                    background: flashReps ? 'rgba(var(--accent-rgb,200,255,0),0.08)' : 'var(--bg2)',
                    border: flashReps ? '1.5px solid var(--accent)' : '1.5px solid var(--line)',
                    color: 'var(--ink)',
                  }}
                />
                <button
                  type="button"
                  onClick={() => stepReps(sIdx, +1)}
                  className="absolute right-0 top-0 bottom-0 w-9 flex items-center justify-center transition-all z-10 rounded-r-xl"
                  style={{ color: 'var(--dim)', opacity: 0.5 }}
                  onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = 'var(--accent)'; }}
                  onMouseLeave={e => { e.currentTarget.style.opacity = '0.5'; e.currentTarget.style.color = 'var(--dim)'; }}
                >
                  <ChevronUp size={14} />
                </button>
                {flashReps && flashSet?.delta != null && (
                  <span
                    className="pointer-events-none absolute -top-1.5 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded-md text-[8px] font-black uppercase animate-in fade-in slide-in-from-bottom-1 duration-150"
                    style={{ background: 'var(--accent)', color: '#000' }}
                  >
                    {flashSet.delta > 0 ? `+${flashSet.delta}` : flashSet.delta}
                  </span>
                )}
              </div>

              <span
                className="text-[11px] font-black italic text-center"
                style={{ color: 'var(--dim)', opacity: 0.3 }}
              >
                @
              </span>

              {/* Weight */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => stepWeight(sIdx, -2.5)}
                  className="absolute left-0 top-0 bottom-0 w-9 flex items-center justify-center transition-all z-10 rounded-l-xl"
                  style={{ color: 'var(--dim)', opacity: 0.5 }}
                  onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = 'var(--accent)'; }}
                  onMouseLeave={e => { e.currentTarget.style.opacity = '0.5'; e.currentTarget.style.color = 'var(--dim)'; }}
                >
                  <ChevronDown size={14} />
                </button>
                <input
                  type="text"
                  inputMode="decimal"
                  data-role="weight"
                  data-idx={sIdx}
                  placeholder={prevSet?.weight || 'kg'}
                  value={set.weight || ''}
                  onChange={e => updateEx(i, 'weight', e.target.value, sIdx)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleWeightEnter(e, sIdx);
                    else handleVerticalNav(e, sIdx, 'weight');
                  }}
                  className="w-full text-center font-mono font-black py-2.5 px-9 rounded-xl text-sm outline-none transition-all focus:ring-2 focus:ring-[var(--accent)]"
                  style={{
                    background: flashWeight ? 'rgba(var(--accent-rgb,200,255,0),0.08)' : 'var(--bg2)',
                    border: flashWeight ? '1.5px solid var(--accent)' : '1.5px solid var(--line)',
                    color: 'var(--ink)',
                  }}
                />
                <button
                  type="button"
                  onClick={() => stepWeight(sIdx, +2.5)}
                  className="absolute right-0 top-0 bottom-0 w-9 flex items-center justify-center transition-all z-10 rounded-r-xl"
                  style={{ color: 'var(--dim)', opacity: 0.5 }}
                  onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = 'var(--accent)'; }}
                  onMouseLeave={e => { e.currentTarget.style.opacity = '0.5'; e.currentTarget.style.color = 'var(--dim)'; }}
                >
                  <ChevronUp size={14} />
                </button>
                {flashWeight && flashSet?.delta != null && (
                  <span
                    className="pointer-events-none absolute -top-1.5 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded-md text-[8px] font-black uppercase animate-in fade-in slide-in-from-bottom-1 duration-150"
                    style={{ background: 'var(--accent)', color: '#000' }}
                  >
                    {flashSet.delta > 0 ? `+${flashSet.delta}` : flashSet.delta}
                  </span>
                )}
              </div>

              {/* Remove set */}
              <button
                onClick={() => removeSet(i, sIdx)}
                className="w-6 h-6 rounded-lg flex items-center justify-center transition-all"
                style={{ color: 'var(--dim)', opacity: 0.3 }}
                onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = 'var(--red)'; e.currentTarget.style.background = 'rgba(255,80,80,0.08)'; }}
                onMouseLeave={e => { e.currentTarget.style.opacity = '0.3'; e.currentTarget.style.color = 'var(--dim)'; e.currentTarget.style.background = 'transparent'; }}
              >
                <X size={12} />
              </button>
            </div>
          );
        })}
      </div>

      {/* Add set */}
      <button
        onClick={() => addSet(i)}
        className="w-full mt-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-1.5 transition-all"
        style={{
          background: 'rgba(var(--accent-rgb,200,255,0),0.04)',
          border: '1.5px dashed rgba(var(--accent-rgb,200,255,0),0.2)',
          color: 'var(--accent)',
          opacity: 0.7,
        }}
        onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.background = 'rgba(var(--accent-rgb,200,255,0),0.08)'; }}
        onMouseLeave={e => { e.currentTarget.style.opacity = '0.7'; e.currentTarget.style.background = 'rgba(var(--accent-rgb,200,255,0),0.04)'; }}
      >
        <Plus size={12} strokeWidth={3} />
        Satz hinzufügen
      </button>
    </div>
  );
}
