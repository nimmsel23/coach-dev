import { LayoutGrid } from "lucide-react";
import { DARK_THEMES, LIGHT_THEMES } from "../../constants/Themes";

export default function AppearanceSection({
  themeMode, setModeState,
  circLight, setCircLight,
  circDark, setCircDark,
  themes, theme, setThemeState,
}) {
  return (
    <section className="card p-6 space-y-6 animate-in fade-in slide-in-from-left-4 duration-500">
       <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-fit-accent/10 flex items-center justify-center">
            <LayoutGrid size={18} className="text-fit-accent" />
          </div>
          <h3 className="text-base font-semibold text-fit-ink">Erscheinungsbild</h3>
       </div>

       <div className="space-y-6">
          {/* Theme Selector */}
          <div>
             <div className="flex items-center justify-between mb-3">
                <div className="text-xs font-medium ml-1" style={{ color: 'var(--dim)', opacity: 0.7 }}>Theme ({Object.keys(themes).length})</div>
                <button onClick={() => setModeState(themeMode === 'circadian' ? 'manual' : 'circadian')}
                   className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${themeMode === 'circadian' ? 'border-fit-accent bg-fit-accent/10 text-fit-accent' : 'border-fit-line text-fit-dim hover:text-fit-ink'}`}>
                   Auto-Theme: {themeMode === 'circadian' ? 'ein' : 'aus'}
                </button>
             </div>

             {themeMode === 'circadian' ? (
                <div className="grid grid-cols-2 gap-4 animate-in fade-in duration-300 bg-fit-bg2 p-4 rounded-2xl border border-fit-line">
                   <div>
                      <div className="text-xs font-medium text-fit-dim mb-2 ml-1">☀️ Tag (Light)</div>
                      <select value={circLight} onChange={e => setCircLight(e.target.value)} className="w-full bg-fit-card border border-fit-line rounded-lg px-2 py-2 text-xs font-medium outline-none focus:border-fit-accent">
                         {LIGHT_THEMES.filter(t => themes[t]).map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                   </div>
                   <div>
                      <div className="text-xs font-medium text-fit-dim mb-2 ml-1">🌙 Nacht (Dark)</div>
                      <select value={circDark} onChange={e => setCircDark(e.target.value)} className="w-full bg-fit-card border border-fit-line rounded-lg px-2 py-2 text-xs font-medium outline-none focus:border-fit-accent">
                         {DARK_THEMES.filter(t => themes[t]).map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                   </div>
                </div>
             ) : (
                <div className="space-y-4 animate-in fade-in duration-300">
                   <div>
                     <div className="text-xs font-medium text-fit-dim mb-2 ml-1">Dark Mode</div>
                     <div className="flex flex-wrap gap-2">
                        {DARK_THEMES.filter(id => themes[id]).map(id => {
                           const t = themes[id];
                           return (
                             <button key={id} onClick={() => setThemeState(id)}
                                className={`w-9 h-9 rounded-xl border-2 transition-all flex items-center justify-center ${theme === id ? 'border-fit-accent scale-110' : 'border-fit-line hover:border-fit-accent/40'}`}
                                style={{ background: t.bg }} title={id}>
                                <div className="w-2 h-2 rounded-full" style={{ background: t.accent }} />
                             </button>
                           );
                        })}
                     </div>
                   </div>
                   <div>
                     <div className="text-xs font-medium text-fit-dim mb-2 ml-1">Light Mode</div>
                     <div className="flex flex-wrap gap-2">
                        {LIGHT_THEMES.filter(id => themes[id]).map(id => {
                           const t = themes[id];
                           return (
                             <button key={id} onClick={() => setThemeState(id)}
                                className={`w-9 h-9 rounded-xl border-2 transition-all flex items-center justify-center ${theme === id ? 'border-fit-accent scale-110' : 'border-fit-line hover:border-fit-accent/40'}`}
                                style={{ background: t.bg }} title={id}>
                                <div className="w-2 h-2 rounded-full" style={{ background: t.accent }} />
                             </button>
                           );
                        })}
                     </div>
                   </div>
                </div>
             )}
          </div>
       </div>
    </section>
  );
}
