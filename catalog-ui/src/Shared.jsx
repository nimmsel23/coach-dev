import React, { useState } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import Model from 'react-body-highlighter';
import { getRbhSlug } from './muscleMap';

export function NavItem({ icon, label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
        active
          ? 'bg-primary/20 text-primary border border-primary/30 shadow-inner shadow-primary/10 font-bold'
          : 'text-muted border border-transparent hover:bg-white/5 hover:text-text'
      }`}
    >
      {React.cloneElement(icon, { className: 'w-5 h-5 shrink-0' })}
      <span className="text-sm tracking-wide">{label}</span>
    </button>
  );
}

// ── Visual Muscle Highlighter (using react-body-highlighter Model) ──
export function VisualMuscleMap({ primaryMuscles = [], secondaryMuscles = [] }) {
  const [side, setSide] = useState('anterior'); // 'anterior' or 'posterior'

  // Map muscles to RBH format
  const rbhData = [];

  const primarySlugs = primaryMuscles.map(m => getRbhSlug(m)).filter(Boolean);
  const secondarySlugs = secondaryMuscles.map(m => getRbhSlug(m)).filter(Boolean);

  primarySlugs.forEach(slug => {
    rbhData.push({ name: slug, muscles: [slug], frequency: 2 });
  });

  secondarySlugs.forEach(slug => {
    if (!primarySlugs.includes(slug)) {
      rbhData.push({ name: slug, muscles: [slug], frequency: 1 });
    }
  });

  return (
    <div className="flex flex-col items-center p-4 bg-surface/50 border border-white/5 rounded-2xl shadow-inner">
      <div className="flex gap-1 p-1 bg-surface border border-white/10 rounded-xl mb-4 shrink-0 shadow-lg">
        <button
          onClick={() => setSide('anterior')}
          className={`px-3 py-1 rounded-lg text-[10px] font-mono uppercase tracking-wider transition-all font-bold ${
            side === 'anterior' ? 'bg-primary text-text shadow-sm shadow-primary/45' : 'text-muted hover:text-text'
          }`}
        >
          Anterior
        </button>
        <button
          onClick={() => setSide('posterior')}
          className={`px-3 py-1 rounded-lg text-[10px] font-mono uppercase tracking-wider transition-all font-bold ${
            side === 'posterior' ? 'bg-primary text-text shadow-sm shadow-primary/45' : 'text-muted hover:text-text'
          }`}
        >
          Posterior
        </button>
      </div>

      <div className="w-full flex justify-center py-2 min-h-[220px]">
        <Model
          type={side}
          data={rbhData}
          highlightedColors={['#fbbf24', '#f43f5e']} // index 0 is frequency 1 (Amber), index 1 is frequency 2 (Rose)
          bodyColor="#374151" // slate-700
          style={{ width: '130px', height: '220px' }}
        />
      </div>

      <div className="flex justify-center gap-4 mt-3 text-[10px] font-mono border-t border-white/5 pt-3 w-full shrink-0">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-[#f43f5e]"></span>
          <span className="text-muted font-bold">Primär</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-[#fbbf24]"></span>
          <span className="text-muted font-bold">Sekundär</span>
        </div>
      </div>
    </div>
  );
}

export function DescriptionTabViewer({ item }) {
  const [activeTab, setActiveTab] = useState('ai');
  if (!item) return null;

  const origDesc = item.original_description || item.instructions;
  const hasOriginal = Boolean(origDesc || item.wger_id || item.yuhonas_id);

  return (
    <div className="border-t border-white/5 pt-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex gap-1 bg-black/40 p-1 rounded-xl border border-white/10">
          <button
            type="button"
            onClick={() => setActiveTab('ai')}
            className={`px-3 py-1 rounded-lg text-[11px] font-mono font-bold transition-all ${
              activeTab === 'ai'
                ? 'bg-primary/20 text-primary border border-primary/30 shadow'
                : 'text-muted hover:text-text'
            }`}
          >
            KI / Expert Notes
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('original')}
            className={`px-3 py-1 rounded-lg text-[11px] font-mono font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'original'
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30 shadow'
                : 'text-muted hover:text-text'
            }`}
          >
            Original (wger / yuhonas)
            {hasOriginal && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />}
          </button>
        </div>
      </div>

      {activeTab === 'ai' ? (
        <div className="space-y-3 font-mono text-xs text-text/80 leading-relaxed">
          {item.coaching_notes ? (
            <div>
              <h5 className="text-[10px] font-mono uppercase tracking-wider text-muted font-bold mb-1">Coaching Cues</h5>
              <ul className="list-disc pl-4 space-y-1">
                {Array.isArray(item.coaching_notes)
                  ? item.coaching_notes.map((n, idx) => <li key={idx}>{n}</li>)
                  : <li>{String(item.coaching_notes)}</li>
                }
              </ul>
            </div>
          ) : (
            <p className="text-muted text-xs font-mono">Keine KI/Expert Coaching Notes vorhanden.</p>
          )}

          {item.common_errors && item.common_errors.length > 0 && (
            <div className="pt-2 border-t border-white/5">
              <h5 className="text-[10px] font-mono uppercase tracking-wider text-rose-400/80 font-bold mb-1">Typische Fehler</h5>
              <ul className="list-disc pl-4 space-y-1 text-rose-300/80">
                {Array.isArray(item.common_errors)
                  ? item.common_errors.map((e, idx) => <li key={idx}>{e}</li>)
                  : <li>{String(item.common_errors)}</li>
                }
              </ul>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3 font-mono text-xs text-text/80 leading-relaxed bg-black/30 p-3.5 rounded-xl border border-white/10">
          <div className="flex flex-wrap gap-2 mb-2">
            {item.wger_id && (
              <span className="px-2 py-0.5 rounded bg-blue-500/20 border border-blue-500/30 text-blue-400 text-[10px] font-mono font-bold">
                wger ID: #{item.wger_id}
              </span>
            )}
            {item.yuhonas_id && (
              <span className="px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-[10px] font-mono font-bold">
                yuhonas ID: {item.yuhonas_id}
              </span>
            )}
          </div>

          {origDesc ? (
            <div>
              <h5 className="text-[10px] font-mono uppercase tracking-wider text-amber-400/80 font-bold mb-1.5">Original Beschreibung / Instructions</h5>
              {Array.isArray(origDesc) ? (
                <ol className="list-decimal pl-4 space-y-1.5 text-text/90">
                  {origDesc.map((step, idx) => (
                    <li key={idx}>{step}</li>
                  ))}
                </ol>
              ) : (
                <p className="whitespace-pre-wrap text-text/90">{String(origDesc)}</p>
              )}
            </div>
          ) : (
            <p className="text-muted text-xs font-mono">Keine original Beschreibung für dieses Format gespeichert.</p>
          )}
        </div>
      )}
    </div>
  );
}

export function Field({ label, value }) {
  if (!value) return null;
  return (
    <div className="flex justify-between items-center py-1 border-b border-white/5 last:border-b-0 gap-4">
      <span className="text-muted font-mono text-[10px] uppercase font-bold shrink-0">{label}</span>
      <span className="font-mono text-text/90 text-right break-all">{value}</span>
    </div>
  );
}

export function Loading() {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="text-muted font-mono text-sm flex items-center gap-2">
        <RefreshCw className="w-4 h-4 animate-spin text-primary" />
        Lade Daten…
      </div>
    </div>
  );
}

export function ErrorBox({ msg }) {
  return (
    <div className="h-full flex items-center justify-center p-6 text-center">
      <div className="bg-danger/10 border border-danger/20 text-danger p-6 rounded-2xl max-w-md shadow-2xl">
        <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-danger" />
        <h4 className="font-mono font-bold text-md">Fehler aufgetreten</h4>
        <p className="text-xs font-mono text-danger/80 mt-1">{msg}</p>
      </div>
    </div>
  );
}

export function BadgeBox({ title, items = [], badgeClass }) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col">
      <span className="text-[10px] text-muted uppercase font-mono font-bold block mb-2">{title}</span>
      <div className="flex flex-wrap gap-1">
        {items.length > 0 ? (
          items.map((it, idx) => (
            <span key={idx} className={`px-2 py-0.5 rounded text-[10px] font-mono ${badgeClass}`}>
              {it}
            </span>
          ))
        ) : (
          <span className="text-[10px] text-muted/50 font-mono">—</span>
        )}
      </div>
    </div>
  );
}
