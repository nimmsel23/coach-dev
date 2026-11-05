import { useState } from 'react';
import TabSettingsModal from '../../components/TabSettingsModal.jsx';
import {
  LANG_OPTIONS, LANG_DEFAULTS, LANG_STORAGE_KEY,
  loadLanguageFilter, saveLanguageFilter,
} from '../../lib/exerciseLanguage.js';
import {
  MUSCLE_DETAIL_OPTIONS, MUSCLE_DETAIL_KEY,
  loadMuscleDetail, saveMuscleDetail,
} from '../../lib/kb/muscles.js';

const SOURCES = [
  { key: 'wger',    label: 'wger',         desc: '~800 Übungen · Standard',       experimental: false },
  { key: 'yuhonas', label: 'yuhonas',       desc: '~870 Übungen · Geräte-Mirror (Atlas → Quellen)',  experimental: false },
  { key: 'coach',   label: 'VitalOS Catalog', desc: 'Kuratiert · Anatomie-Detail',   experimental: true  },
];
const DEFAULTS = { wger: true, yuhonas: true, coach: true };
const STORAGE_KEY = 'fitness-sessionSources';

export default function SourceSettingsModal({ onClose }) {
  const [sources, setSources] = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
  });
  const [langs, setLangs] = useState(() => loadLanguageFilter());
  const [muscleDetail, setMuscleDetail] = useState(() => loadMuscleDetail());
  const [savedHint, setSavedHint] = useState('');

  function flashSaved(msg) {
    setSavedHint(msg);
    setTimeout(() => setSavedHint(''), 1400);
  }

  function toggle(key) {
    const next = { ...DEFAULTS, ...sources, [key]: !isActive(key) };
    setSources(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    flashSaved(`${SOURCES.find(s => s.key === key)?.label || key} ${next[key] ? 'aktiv' : 'aus'}`);
  }

  function isActive(key) {
    return sources[key] !== undefined ? sources[key] : DEFAULTS[key];
  }

  function pickDetail(key) {
    setMuscleDetail(key);
    saveMuscleDetail(key);
    const label = MUSCLE_DETAIL_OPTIONS.find(o => o.key === key)?.label || key;
    flashSaved(`Muskelnamen: ${label}`);
    window.dispatchEvent(new StorageEvent('storage', { key: MUSCLE_DETAIL_KEY }));
  }

  function toggleLang(key) {
    const next = { ...langs, [key]: !langs[key] };
    setLangs(next);
    saveLanguageFilter(next);
    const label = LANG_OPTIONS.find(o => o.key === key)?.label || key;
    flashSaved(`${label} ${next[key] ? 'an' : 'aus'}`);
    // Andere Tabs/Komponenten informieren
    window.dispatchEvent(new StorageEvent('storage', { key: LANG_STORAGE_KEY }));
  }

  const activeSources = SOURCES.filter(s => isActive(s.key)).map(s => s.label);
  const activeLangs = LANG_OPTIONS.filter(o => langs[o.key]).map(o => o.label);

  return (
    <TabSettingsModal title="Training · Einstellungen" onClose={onClose}>
      <div className="space-y-6">

        {/* Live-Feedback Banner */}
        <div className="rounded-2xl border border-fit-line/40 bg-fit-bg2/40 px-4 py-3 flex items-center justify-between gap-3">
          <div className="text-[10px] font-bold uppercase tracking-widest text-fit-dim/60">
            Aktiv: {activeSources.length} Quellen · {activeLangs.length} Sprachen
          </div>
          {savedHint && (
            <span className="text-[10px] font-black uppercase tracking-widest text-fit-accent animate-in fade-in slide-in-from-right-2 duration-200">
              ✓ {savedHint}
            </span>
          )}
        </div>

        {/* Übungsquellen */}
        <section>
          <p className="text-[9px] font-black uppercase tracking-[0.2em] text-fit-dim/50 mb-3">Übungsquellen</p>
          <div className="space-y-2">
            {SOURCES.map(({ key, label, desc, experimental }) => {
              const active = isActive(key);
              return (
                <button
                  key={key}
                  onClick={() => toggle(key)}
                  className={`w-full flex items-center justify-between p-4 rounded-2xl border transition-all text-left ${
                    active ? 'border-fit-accent/40 bg-fit-accent/5' : 'border-fit-line bg-fit-bg2 opacity-60'
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black text-fit-ink">{label}</span>
                      {experimental && (
                        <span className="text-[7px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-fit-orange/20 text-fit-orange border border-fit-orange/30">Lab</span>
                      )}
                    </div>
                    <div className="text-[9px] font-bold text-fit-dim/50 mt-0.5">{desc}</div>
                  </div>
                  <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${
                    active ? 'border-fit-accent bg-fit-accent' : 'border-fit-line/50'
                  }`}>
                    {active && <div className="w-2 h-2 bg-black rounded-xs" />}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Muskel-Detailgrad */}
        <section>
          <p className="text-[9px] font-black uppercase tracking-[0.2em] text-fit-dim/50 mb-3">Muskelnamen · Detailgrad</p>
          <p className="text-[9px] font-medium text-fit-dim/40 mb-3 leading-relaxed">
            Wie Muskeln in Session-Karten angezeigt werden. Sprache (DE/EN/LAT) kommt aus den globalen Einstellungen.
          </p>
          <div className="grid grid-cols-3 gap-2">
            {MUSCLE_DETAIL_OPTIONS.map(({ key, label, hint }) => {
              const active = muscleDetail === key;
              return (
                <button
                  key={key}
                  onClick={() => pickDetail(key)}
                  className={`flex flex-col items-start p-3 rounded-xl border transition-all text-left ${
                    active ? 'border-fit-accent/40 bg-fit-accent/5' : 'border-fit-line bg-fit-bg2 text-fit-dim/60'
                  }`}
                >
                  <span className={`text-[10px] font-black uppercase tracking-wider ${active ? 'text-fit-accent' : ''}`}>{label}</span>
                  <span className="text-[9px] font-mono font-bold text-fit-dim/40 mt-1 truncate w-full">{hint}</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Sprachfilter */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-fit-dim/50">Übungs-Sprachen</p>
            <button
              onClick={() => { setLangs({ ...LANG_DEFAULTS }); saveLanguageFilter({ ...LANG_DEFAULTS }); flashSaved('Sprachen zurückgesetzt'); }}
              className="text-[9px] font-black uppercase tracking-widest text-fit-dim/40 hover:text-accent"
            >
              Reset
            </button>
          </div>
          <p className="text-[9px] font-medium text-fit-dim/40 mb-3 leading-relaxed">
            Filtert wger/yuhonas-Treffer nach erkannter Sprache. Spanisch/Französisch ist standardmäßig aus.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {LANG_OPTIONS.map(({ key, label }) => {
              const active = !!langs[key];
              return (
                <button
                  key={key}
                  onClick={() => toggleLang(key)}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-xl border transition-all text-left ${
                    active ? 'border-fit-accent/40 bg-fit-accent/5 text-fit-ink' : 'border-fit-line bg-fit-bg2 text-fit-dim/60'
                  }`}
                >
                  <span className="text-[11px] font-black uppercase tracking-wider">{label}</span>
                  <div className={`w-4 h-4 rounded-md border-2 flex items-center justify-center transition-all ${
                    active ? 'border-fit-accent bg-fit-accent' : 'border-fit-line/50'
                  }`}>
                    {active && <div className="w-1.5 h-1.5 bg-black rounded-xs" />}
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </TabSettingsModal>
  );
}
