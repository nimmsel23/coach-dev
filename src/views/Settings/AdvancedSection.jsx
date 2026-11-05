import { Sparkles, ShieldAlert, UserCircle, LayoutGrid } from "lucide-react";
import SegmentedControl from "./SegmentedControl";

function formatJoinDate(ts) {
  if (!ts) return '—';
  try {
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('de-DE', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch { return '—'; }
}

export default function AdvancedSection({
  swipeEnabled, setSwipeEnabled,
  navMode, setNavMode,
  sidebarPinned, setSidebarPinned,
  layoutScale, setLayoutScale,
  muscleLanguage, setMuscleLanguage,
  user,
}) {
  return (
    <section className="card p-6 mt-6 border-dashed border-red-500/20 bg-red-500/5 animate-in fade-in slide-in-from-bottom-8 duration-500">
       <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 rounded-xl bg-red-500/20 flex items-center justify-center">
            <ShieldAlert size={18} className="text-red-500" />
          </div>
          <div>
             <h3 className="text-base font-semibold text-fit-ink">Erweitert &amp; Labor</h3>
             <p className="text-xs" style={{ color: 'var(--dim)', opacity: 0.6 }}>Experimentelle Funktionen</p>
          </div>
       </div>

       <div className="bg-fit-bg2 p-5 rounded-2xl border border-fit-line">
          <div className="flex items-center gap-2.5 mb-4">
             <Sparkles size={16} className="text-fit-accent" />
             <h4 className="text-sm font-semibold text-fit-ink">Labor</h4>
          </div>
          <div className="space-y-5">
             {/* Swipe Navigation */}
             <div className="flex items-center justify-between">
                <div>
                   <div className="text-xs font-semibold text-fit-ink">Swipe-Navigation</div>
                   <div className="text-xs text-fit-dim" style={{ opacity: 0.6 }}>Tab-Wechsel per Wischgeste</div>
                </div>
                <div className="flex bg-fit-bg p-1 rounded-xl border border-fit-line">
                   {[{ id: true, label: 'Ein' }, { id: false, label: 'Aus' }].map(({ id, label }) => (
                      <button key={label} onClick={() => setSwipeEnabled(id)}
                         className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${swipeEnabled === id ? 'bg-fit-card shadow-xs text-fit-accent' : 'text-fit-dim hover:text-fit-ink'}`}>
                         {label}
                      </button>
                   ))}
                </div>
             </div>

          </div>
       </div>

       {/* Layout & Navigation (experimentell) */}
       <div className="mt-5 bg-fit-bg2 p-5 rounded-2xl border border-fit-line space-y-5">
          <div className="flex items-center gap-2.5">
             <LayoutGrid size={16} className="text-fit-accent" />
             <h4 className="text-sm font-semibold text-fit-ink">Layout &amp; Navigation</h4>
          </div>

          <SegmentedControl
            label="Navigations-Modus"
            options={[
              { id: 'tabs', label: 'Tabs + Navbar' },
              { id: 'home', label: 'Home-Menü' },
            ]}
            value={navMode}
            onChange={setNavMode}
          />

          {/* Desktop Sidebar Toggle */}
          <div className="hidden lg:flex items-center justify-between">
             <div>
                <div className="text-sm font-semibold text-fit-ink">Desktop-Sidebar</div>
                <div className="text-xs" style={{ color: 'var(--dim)', opacity: 0.6 }}>Permanent fixiert</div>
             </div>
             <button onClick={() => setSidebarPinned(!sidebarPinned)}
                className={`w-12 h-6 rounded-full transition-colors relative border ${sidebarPinned ? 'bg-fit-accent border-fit-accent' : 'bg-fit-bg2 border-fit-line'}`}>
                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${sidebarPinned ? 'left-7' : 'left-1'}`} />
             </button>
          </div>

          {/* Layout Scale */}
          <div className="space-y-3">
             <div className="text-xs font-medium ml-1" style={{ color: 'var(--dim)', opacity: 0.7 }}>Layout-Skalierung</div>
             <input
               type="range"
               min="70"
               max="150"
               step="5"
               value={layoutScale}
               onChange={(e) => setLayoutScale(parseInt(e.target.value))}
               className="fit-slider w-full"
             />
             <div className="flex justify-between text-xs" style={{ color: 'var(--dim)', opacity: 0.5 }}>
                <span>70%</span>
                <span>{layoutScale}%</span>
                <span>150%</span>
             </div>
          </div>
          <SegmentedControl
            label="Muskel-Terminologie"
            options={[
              { id: 'de', label: 'Deutsch' },
              { id: 'en', label: 'English' },
              { id: 'lat', label: 'Latein' },
            ]}
            value={muscleLanguage}
            onChange={setMuscleLanguage}
          />
       </div>

       {/* User Auth */}
       {user && (
          <div className="mt-5 bg-fit-bg2 p-5 rounded-2xl border border-fit-line">
             <div className="flex items-center gap-2.5 mb-4">
                <UserCircle size={16} className="text-fit-accent" />
                <h4 className="text-sm font-semibold text-fit-ink">Account</h4>
             </div>
             <div className="space-y-2.5 text-xs font-mono">
                <div className="flex items-center justify-between bg-fit-bg p-3 rounded-xl border border-fit-line">
                   <span style={{ color: 'var(--dim)', opacity: 0.6 }}>E-Mail</span>
                   <span className="font-semibold text-fit-ink truncate max-w-[60%]">{user.email || '—'}</span>
                </div>
                <div className="flex items-center justify-between bg-fit-bg p-3 rounded-xl border border-fit-line">
                   <span style={{ color: 'var(--dim)', opacity: 0.6 }}>UID</span>
                   <span className="font-semibold text-fit-accent truncate max-w-[60%]" title={user.uid}>{user.uid || '—'}</span>
                </div>
                <div className="flex items-center justify-between bg-fit-bg p-3 rounded-xl border border-fit-line">
                   <span style={{ color: 'var(--dim)', opacity: 0.6 }}>Beitritt</span>
                   <span className="font-semibold text-fit-ink">{formatJoinDate(user.metadata?.creationTime)}</span>
                </div>
                {user.metadata?.lastSignInTime && (
                   <div className="flex items-center justify-between bg-fit-bg p-3 rounded-xl border border-fit-line">
                      <span style={{ color: 'var(--dim)', opacity: 0.6 }}>Letzter Login</span>
                      <span className="font-semibold text-fit-dim">{formatJoinDate(user.metadata.lastSignInTime)}</span>
                   </div>
                )}
             </div>
          </div>
       )}
    </section>
  );
}
