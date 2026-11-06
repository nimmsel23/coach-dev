/**
 * RecordChronicle — jede neue Bestleistung als Eintrag, nach Monaten gruppiert.
 * "Erstbesteigung" = erster geloggter Wert einer Übung (Ausgangspunkt, kein
 * echter Rekord) und standardmäßig ausgeblendet.
 */

import { useState } from 'react';
import { Mountain, Flag, ChevronRight } from 'lucide-react';
import { fmtNum, fmtScore, fmtTop, parseDay } from './logbookStats.js';

const PAGE = 60;
const dim = (o) => ({ color: 'var(--dim)', opacity: o });

export default function RecordChronicle({ records, onOpenSession, onFocusExercise }) {
  const [withFirst, setWithFirst] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const list = records.filter((r) => withFirst || r.kind === 'rekord');
  const shown = list.slice(0, limit);

  const groups = [];
  for (const r of shown) {
    const label = parseDay(r.date).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
    const g = groups[groups.length - 1];
    if (g && g.label === label) g.items.push(r);
    else groups.push({ label, items: [r] });
  }

  return (
    <div className="pb-32">
      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={() => setWithFirst((v) => !v)}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest"
          style={{
            background: withFirst ? 'var(--accent)' : 'var(--bg2)',
            color: withFirst ? '#000' : 'var(--dim)',
            border: '1px solid var(--line)',
          }}
          aria-pressed={withFirst}
        >
          <Flag size={10} /> Erstbesteigungen
        </button>
        <span className="text-[9px] font-bold uppercase tracking-widest" style={dim(0.45)}>{list.length} Einträge</span>
      </div>

      {groups.length === 0 && (
        <div className="py-24 text-center text-[11px] font-black uppercase tracking-[0.3em]" style={dim(0.3)}>
          Noch keine Rekorde
        </div>
      )}

      {groups.map((g) => (
        <section key={g.label} className="mb-4">
          <h3 className="px-1 pb-2 text-[9px] font-black uppercase tracking-[0.3em]" style={dim(0.4)}>{g.label}</h3>
          <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--card)', border: '1px solid var(--line)' }}>
            {g.items.map((r, i) => {
              const first = r.kind === 'erst';
              return (
                <div
                  key={`${r.key}-${r.date}`}
                  className="flex items-center gap-2.5 px-3 py-2.5"
                  style={{ borderTop: i ? '1px solid var(--line)' : 'none' }}
                >
                  <div className="w-9 text-center shrink-0">
                    <div className="text-[13px] font-black leading-none" style={{ color: 'var(--ink)' }}>{parseDay(r.date).getDate()}</div>
                    <div className="text-[8px] font-black uppercase" style={dim(0.4)}>
                      {parseDay(r.date).toLocaleDateString('de-DE', { month: 'short' }).replace('.', '')}
                    </div>
                  </div>
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: first ? 'var(--bg2)' : 'color-mix(in srgb, var(--accent) 16%, transparent)', color: first ? 'var(--dim)' : 'var(--accent)' }}
                  >
                    {first ? <Flag size={12} /> : <Mountain size={13} />}
                  </div>
                  <button className="flex-1 min-w-0 text-left" onClick={() => onFocusExercise?.(r.key)} title="Im Kodex zeigen">
                    <div className="text-[12px] font-black truncate" style={{ color: 'var(--ink)' }}>{r.name}</div>
                    <div className="text-[10px] font-mono font-bold truncate" style={dim(0.6)}>
                      {fmtTop(r.entry, r.mode)}{r.mode === 'load' ? ` · e1RM ${fmtNum(r.score)} kg` : ''}
                    </div>
                  </button>
                  <div className="text-right shrink-0">
                    {first ? (
                      <div className="text-[9px] font-black uppercase tracking-widest" style={dim(0.5)}>Start</div>
                    ) : (
                      <>
                        <div className="text-[12px] font-black font-mono" style={{ color: 'var(--green, #34d399)' }}>+{fmtNum(r.gain * 100, 1)} %</div>
                        <div className="text-[9px] font-bold font-mono" style={dim(0.5)}>vorher {fmtScore(r.prev, r.mode)}</div>
                      </>
                    )}
                  </div>
                  <button
                    onClick={() => onOpenSession?.(r.date)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: 'var(--bg2)', color: 'var(--dim)' }}
                    title="Session öffnen" aria-label="Session öffnen"
                  >
                    <ChevronRight size={13} />
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {list.length > limit && (
        <button
          onClick={() => setLimit((l) => l + PAGE)}
          className="w-full mt-2 py-3 rounded-xl text-sm font-bold"
          style={{ background: 'var(--bg2)', border: '1px solid var(--line)', color: 'var(--ink)' }}
        >
          Mehr laden
        </button>
      )}
    </div>
  );
}
