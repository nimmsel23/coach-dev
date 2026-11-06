import { useState, useEffect } from 'react';
import { getProgressTrend } from '@db';
import { TrendingUp, TrendingDown, Plus, Info, X, Clock, History, ChevronDown, ChevronUp } from 'lucide-react';
import { formatMuscleDetail, loadMuscleDetail, MUSCLE_DETAIL_KEY, splitMuscleEntries } from '../../lib/translations.js';

const NXM_PATTERN = /^\s*(\d{1,2})\s*[xX×*]\s*(\d{1,3})\s*$/;

export default function ExerciseItem({
  ex, i, muscleRecovery = {}, updateEx, addSet, removeSet, removeEx, replaceSets, moveEx,
  isFirst, isLast, prev, onInspectExercise
}) {
  const [trend, setTrend] = useState(null);
  const [showHistory, setShowDetails] = useState(false);
  const [expandHint, setExpandHint] = useState(null); // {sets, reps} kurz nach NxM-Expansion
  const [flashSet, setFlashSet] = useState(null);     // {idx, field} kurz nach Stepper-Klick
  const [muscleDetail, setMuscleDetail] = useState(() => loadMuscleDetail());
  const muscleLang = (typeof localStorage !== 'undefined' && localStorage.getItem('fitness-muscleLanguage')) || 'de';

  useEffect(() => {
    const onStorage = (e) => {
      if (!e.key || e.key === MUSCLE_DETAIL_KEY) setMuscleDetail(loadMuscleDetail());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const formatMuscle = (m) => formatMuscleDetail(m, null, muscleLang, muscleDetail);

  useEffect(() => {
    if (ex.name) {
      getProgressTrend(ex.name).then(setTrend);
    }
  }, [ex.name]);

  const handleRepsChange = (val, sIdx) => {
    updateEx(i, 'reps', val, sIdx);
  };

  // Expand "5x5" → 5 Sätze à 5 reps, Gewicht aus aktueller Zeile übernommen.
  const tryExpandReps = (val, sIdx) => {
    const m = NXM_PATTERN.exec(val);
    if (!m || !replaceSets) return false;
    const nSets = Math.min(parseInt(m[1], 10), 20);
    const nReps = String(parseInt(m[2], 10));
    if (nSets < 1) return false;
    const baseWeight = ex.setsArray?.[sIdx]?.weight || ex.setsArray?.[0]?.weight || '';
    const newArr = Array.from({ length: nSets }, () => ({ reps: nReps, weight: baseWeight }));
    replaceSets(i, newArr);
    setExpandHint({ sets: nSets, reps: nReps });
    setTimeout(() => setExpandHint(null), 2200);
    return true;
  };

  const flash = (idx, field, delta) => {
    setFlashSet({ idx, field, delta });
    setTimeout(() => setFlashSet(curr => (curr?.idx === idx && curr?.field === field ? null : curr)), 600);
  };

  const stepReps = (sIdx, delta) => {
    const raw = ex.setsArray?.[sIdx]?.reps || '';
    if (NXM_PATTERN.test(raw)) return; // im Pattern-Modus → kein Stepper
    const cur = parseInt(raw, 10) || 0;
    updateEx(i, 'reps', String(Math.max(0, cur + delta)), sIdx);
    flash(sIdx, 'reps', delta);
  };

  const stepWeight = (sIdx, delta) => {
    const raw = String(ex.setsArray?.[sIdx]?.weight || '').replace(',', '.');
    const cur = parseFloat(raw) || 0;
    const next = Math.max(0, Math.round((cur + delta) * 100) / 100);
    const out = Number.isInteger(next) ? String(next) : String(next);
    updateEx(i, 'weight', out, sIdx);
    flash(sIdx, 'weight', delta);
  };

  // Sind alle Sätze gleich (Reps + Weight)? Dann ist's ein straight-set Pattern.
  const setsArr = ex.setsArray || [];
  const patternSummary = (() => {
    if (setsArr.length < 2) return null;
    const r0 = setsArr[0]?.reps, w0 = setsArr[0]?.weight;
    if (!r0) return null;
    const allEqual = setsArr.every(s => s.reps === r0 && (s.weight || '') === (w0 || ''));
    if (!allEqual) return null;
    return { count: setsArr.length, reps: r0, weight: w0 };
  })();
  // Drop-Set Detection: gleiche Reps, fallendes Gewicht
  const isDropSet = (() => {
    if (setsArr.length < 2) return false;
    const w = setsArr.map(s => parseFloat(String(s.weight || '').replace(',', '.'))).filter(v => !isNaN(v));
    if (w.length !== setsArr.length) return false;
    let dropped = false;
    for (let k = 1; k < w.length; k++) {
      if (w[k] > w[k - 1]) return false;
      if (w[k] < w[k - 1]) dropped = true;
    }
    return dropped;
  })();
  
  let exRecoveryHours = null;
  if (ex.primaryMuscles && ex.primaryMuscles.length > 0) {
    const hours = ex.primaryMuscles.map(m => muscleRecovery[m]).filter(h => h !== undefined);
    if (hours.length > 0) {
       exRecoveryHours = Math.min(...hours);
    }
  }

  return (
    <div className={`card relative mb-3 overflow-hidden transition-all duration-300 border-l-4 border-fit-accent ${showHistory ? 'shadow-2xl ring-1 ring-accent/10' : 'shadow-sm'}`}>
      
      {/* Exercise Header */}
      <div className="p-4 sm:p-5">
        <div className="flex justify-between items-start gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center flex-wrap gap-2 mb-1.5">
              <h3 
                onClick={() => onInspectExercise?.(ex)}
                className={`text-base font-black tracking-tight ${onInspectExercise ? 'cursor-pointer hover:text-accent transition-colors' : 'text-fit-ink'}`}
              >
                {ex.name || <span className="text-fit-dim italic">Übung</span>}
              </h3>
              
              {ex.source && ex.source !== 'expert' && (
                <span className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-[0.2em] border ${
                  ex.source === 'bulk' ? 'bg-fit-bg2 text-fit-dim/40 border-fit-line' : 'bg-fit-orange/5 text-fit-orange/50 border-fit-orange/10'
                }`}>
                  {ex.source}
                </span>
              )}
            </div>

            <div className="flex items-center flex-wrap gap-3">
              {/* Primary Muscle Badges */}
              <div className="flex gap-1.5 flex-wrap">
                {(() => {
                  // Splittet Komma-Joints (Legacy-Session-Daten) → einzelne Muskeln,
                  // dann kanonisiert + formatiert + dedupliziert.
                  const raw = splitMuscleEntries(ex.primaryMuscles || []);
                  const seen = new Set();
                  const labels = [];
                  for (const m of raw) {
                    const label = formatMuscle(m);
                    if (label && !seen.has(label)) { seen.add(label); labels.push(label); }
                    if (labels.length >= 2) break;
                  }
                  return labels.map(label => (
                    <span key={label} className={`text-[9px] font-bold text-fit-dim/60 ${muscleDetail === 'catalog' ? 'font-mono normal-case' : 'uppercase tracking-widest'}`}>{label}</span>
                  ));
                })()}
              </div>

              {/* Trend Badge */}
              {trend && trend.status !== 'neutral' && (
                <div className={`flex items-center gap-1 text-[9px] font-black px-2 py-0.5 rounded-full ${
                  trend.status === 'up' ? 'bg-fit-green/10 text-fit-green' : 'bg-fit-red/10 text-fit-red'
                }`}>
                  {trend.status === 'up' ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                  {trend.change}%
                </div>
              )}

              {/* Recovery Time */}
              {exRecoveryHours !== null && (
                <div className="flex items-center gap-1 text-[9px] font-bold text-fit-accent uppercase tracking-widest bg-fit-accent/5 px-2 py-0.5 rounded-full">
                  <Clock size={10} />
                  {exRecoveryHours}h Rest
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
             <div className="flex flex-col gap-1 mr-2">
                <button onClick={() => moveEx(i, -1)} disabled={isFirst} className="w-8 h-8 rounded-lg flex items-center justify-center text-fit-dim hover:text-accent hover:bg-bg2 disabled:opacity-0 transition-all">↑</button>
                <button onClick={() => moveEx(i, 1)} disabled={isLast} className="w-8 h-8 rounded-lg flex items-center justify-center text-fit-dim hover:text-accent hover:bg-bg2 disabled:opacity-0 transition-all">↓</button>
             </div>
             <button onClick={() => removeEx(i)} className="w-10 h-10 rounded-xl flex items-center justify-center text-fit-dim hover:text-red hover:bg-red/5 transition-all">
                <X size={20} />
             </button>
          </div>
        </div>

        {/* Info Bar / Previous Stats */}
        {prev && (
          <>
            <div className="mt-4 p-3 rounded-2xl bg-fit-bg2/50 border border-fit-line/50 flex items-center justify-between cursor-pointer select-none" onClick={() => setShowDetails(!showHistory)}>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-fit-card flex items-center justify-center text-fit-dim border border-fit-line">
                  <History size={14} />
                </div>
                <div>
                  <div className="text-[10px] font-black uppercase tracking-widest text-fit-dim/40 mb-0.5">Zuletzt ({prev.date})</div>
                  <div className="text-xs font-mono font-bold text-fit-dim/80">
                    {prev.setsArray ? (
                      <span>{prev.setsArray.length}×{prev.setsArray[0].reps}@{prev.setsArray[0].weight}kg</span>
                    ) : (
                      <span>{prev.sets}×{prev.reps}{prev.weight ? `@${prev.weight}kg` : ''}</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="text-fit-dim/30">
                {showHistory ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </div>
            </div>

            {showHistory && (
              <div className="mt-2 mx-1 p-4 rounded-2xl bg-fit-bg2/30 border border-fit-line/30 space-y-2 animate-in slide-in-from-top-2 duration-200">
                {prev.setsArray ? prev.setsArray.map((s, idx) => (
                  <div key={idx} className="flex items-center gap-3">
                    <span className="text-[9px] font-black text-fit-dim/30 uppercase w-6">S{idx + 1}</span>
                    <span className="text-xs font-mono font-bold text-fit-dim/70">{s.reps} reps @ {s.weight}kg</span>
                  </div>
                )) : (
                  <div className="text-xs font-mono font-bold text-fit-dim/70">
                    {prev.sets}×{prev.reps}{prev.weight ? ` @ ${prev.weight}kg` : ''}
                  </div>
                )}
                {trend && trend.status !== 'neutral' && (
                  <div className="pt-2 border-t border-fit-line/30 flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-fit-dim/40">
                    {trend.status === 'up' ? <TrendingUp size={10} className="text-fit-green" /> : <TrendingDown size={10} className="text-fit-red" />}
                    {trend.change}% zum Vorwert
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Input Section */}
      <div className="px-4 pb-4 sm:px-5 sm:pb-5">
        {ex.setsArray && (
          <div className="space-y-2">
              {/* Pattern / Drop-Set / Expand-Hint Banner */}
              {(expandHint || patternSummary || isDropSet) && (
                <div className={`flex items-center justify-between gap-2 px-3 py-1.5 mb-2 rounded-xl border text-[9px] font-black uppercase tracking-widest transition-all ${
                  expandHint
                    ? 'bg-fit-accent/10 border-fit-accent/30 text-fit-accent animate-in fade-in slide-in-from-top-1 duration-200'
                    : isDropSet
                      ? 'bg-fit-orange/10 border-fit-orange/30 text-fit-orange'
                      : 'bg-fit-bg2/60 border-fit-line/40 text-fit-dim/60'
                }`}>
                  {expandHint ? (
                    <span>✓ Expandiert · {expandHint.sets} × {expandHint.reps} Reps</span>
                  ) : isDropSet ? (
                    <span>↓ Drop-Set erkannt</span>
                  ) : patternSummary ? (
                    <span>Straight Sets · {patternSummary.count} × {patternSummary.reps}{patternSummary.weight ? ` @ ${patternSummary.weight}kg` : ''}</span>
                  ) : null}
                  {expandHint && (
                    <span className="text-[8px] font-bold opacity-50 normal-case tracking-normal hidden sm:inline">Tipp: ↓ pro Satz Gewicht senken</span>
                  )}
                </div>
              )}

              <div className="grid grid-cols-[1fr_auto_1fr_28px] gap-1.5 px-2 mb-1">
                <span className="text-[9px] font-black uppercase tracking-widest text-fit-dim/40 text-center">Reps</span>
                <span />
                <span className="text-[9px] font-black uppercase tracking-widest text-fit-dim/40 text-center">Weight</span>
                <span />
              </div>

              {ex.setsArray.map((set, sIdx) => {
                const flashReps = flashSet?.idx === sIdx && flashSet?.field === 'reps';
                const flashWeight = flashSet?.idx === sIdx && flashSet?.field === 'weight';
                return (
                  <div key={sIdx} className="grid grid-cols-[1fr_auto_1fr_28px] items-center gap-1.5 animate-in slide-in-from-left-2 duration-200">

                    {/* Reps: Pfeile links/rechts im Feld */}
                    <div className="relative">
                      <button type="button" onClick={() => stepReps(sIdx, -1)} aria-label="Reps -1"
                        className="absolute left-0 top-0 bottom-0 w-11 rounded-l-2xl flex items-center justify-center text-fit-dim/40 hover:text-fit-accent hover:bg-fit-accent/8 active:bg-accent/15 active:text-accent transition-all z-10">
                        <ChevronDown size={18} />
                      </button>
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder={sIdx === 0 ? '5x5' : 'Reps'}
                        value={set.reps || ''}
                        onChange={e => handleRepsChange(e.target.value, sIdx)}
                        onBlur={e => tryExpandReps(e.target.value, sIdx)}
                        onKeyDown={e => { if (e.key === 'Enter') { if (tryExpandReps(e.target.value, sIdx)) e.target.blur(); } }}
                        className={`text-center font-mono font-black py-3 px-11 rounded-2xl bg-fit-bg2 border w-full text-sm focus:border-accent focus:ring-4 focus:ring-accent/5 outline-none transition-all ${
                          flashReps ? 'border-fit-accent ring-4 ring-accent/20' : 'border-fit-line'
                        }`}
                      />
                      <button type="button" onClick={() => stepReps(sIdx, +1)} aria-label="Reps +1"
                        className="absolute right-0 top-0 bottom-0 w-11 rounded-r-2xl flex items-center justify-center text-fit-dim/40 hover:text-fit-accent hover:bg-fit-accent/8 active:bg-accent/15 active:text-accent transition-all z-10">
                        <ChevronUp size={18} />
                      </button>
                      {flashReps && flashSet?.delta != null && (
                        <span className="pointer-events-none absolute -top-2 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded-md bg-fit-accent text-black text-[8px] font-black uppercase tracking-widest animate-in fade-in slide-in-from-bottom-1 duration-150">
                          {flashSet.delta > 0 ? `+${flashSet.delta}` : flashSet.delta}
                        </span>
                      )}
                    </div>

                    <span className="text-fit-dim/30 font-black text-xs italic px-0.5">@</span>

                    {/* Weight: Pfeile links/rechts im Feld */}
                    <div className="relative">
                      <button type="button" onClick={() => stepWeight(sIdx, -2.5)} aria-label="Gewicht -2.5"
                        className="absolute left-0 top-0 bottom-0 w-11 rounded-l-2xl flex items-center justify-center text-fit-dim/40 hover:text-fit-accent hover:bg-fit-accent/8 active:bg-accent/15 active:text-accent transition-all z-10">
                        <ChevronDown size={18} />
                      </button>
                      <input type="text" inputMode="decimal" placeholder="kg" value={set.weight || ''}
                        onChange={e => updateEx(i, 'weight', e.target.value, sIdx)}
                        className={`text-center font-mono font-black py-3 px-11 rounded-2xl bg-fit-bg2 border w-full text-sm focus:border-accent focus:ring-4 focus:ring-accent/5 outline-none transition-all ${
                          flashWeight ? 'border-fit-accent ring-4 ring-accent/20' : 'border-fit-line'
                        }`} />
                      <button type="button" onClick={() => stepWeight(sIdx, +2.5)} aria-label="Gewicht +2.5"
                        className="absolute right-0 top-0 bottom-0 w-11 rounded-r-2xl flex items-center justify-center text-fit-dim/40 hover:text-fit-accent hover:bg-fit-accent/8 active:bg-accent/15 active:text-accent transition-all z-10">
                        <ChevronUp size={18} />
                      </button>
                      {flashWeight && flashSet?.delta != null && (
                        <span className="pointer-events-none absolute -top-2 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded-md bg-fit-accent text-black text-[8px] font-black uppercase tracking-widest animate-in fade-in slide-in-from-bottom-1 duration-150">
                          {flashSet.delta > 0 ? `+${flashSet.delta}` : flashSet.delta}
                        </span>
                      )}
                    </div>

                    <button onClick={() => removeSet(i, sIdx)} className="w-7 h-7 rounded-lg flex items-center justify-center text-fit-dim/30 hover:text-red hover:bg-red/5 transition-all">
                      <X size={14} />
                    </button>
                  </div>
                );
              })}
              
              <button 
                onClick={() => addSet(i)} 
                className="w-full py-3 mt-2 rounded-[20px] bg-fit-accent/5 border border-dashed border-fit-accent/20 text-fit-accent text-[10px] font-black uppercase tracking-[0.2em] hover:bg-accent/10 transition-all flex items-center justify-center gap-2"
              >
                <Plus size={14} /> Satz hinzufügen
              </button>
          </div>
        )}
      </div>

      {/* Footer / Meta Section */}
      <div className="px-4 pb-4 sm:px-5 sm:pb-5 border-t border-fit-line/30 pt-4 flex flex-col sm:flex-row gap-4">
        <div className="flex-1 relative group">
          <Info size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-fit-dim/40" />
          <input 
            type="text" 
            placeholder="Notiz hinzufügen..." 
            value={ex.note || ''} 
            onChange={e => updateEx(i, 'note', e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 text-[11px] font-bold bg-fit-bg2/50 border border-fit-line/50 rounded-xl focus:border-accent/50 focus:bg-card outline-none transition-all" 
          />
        </div>

      </div>
    </div>
  );
}
