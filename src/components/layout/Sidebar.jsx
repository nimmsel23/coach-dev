import { Activity, ChevronLeft, ChevronRight, Bell, ClipboardList } from "lucide-react";

export default function Sidebar({ tab, navigate, subTab, navigateSub, navigateToPlan, pinned, setPinned, children, navItems }) {
  return (
    <aside className={`hidden lg:flex flex-col alpha-glass border-r border-fit-line fixed inset-y-0 z-40 transition-all duration-500 ease-in-out ${pinned ? 'w-[280px]' : 'w-24'}`}>
      <div className={`p-8 flex flex-col h-full ${!pinned ? 'items-center' : ''}`}>
        <div className="relative mb-12 flex items-center gap-4 pr-6">
          <a
            href="https://fitness-aos.web.app"
            target="_blank"
            rel="noopener noreferrer"
            title="Firebase-App öffnen (fitness-aos.web.app)"
            className="w-12 h-12 shrink-0 rounded-2xl bg-fit-accent text-black flex items-center justify-center shadow-2xl shadow-fit-accent/40 transition-transform hover:scale-105"
          >
            <Activity size={26} />
          </a>
          {pinned && (
            <div className="animate-in fade-in slide-in-from-left-4 duration-500">
              <h2 className="text-xl font-black tracking-tight text-fit-ink">Fitness</h2>
              <div className="text-[10px] font-black uppercase tracking-[0.2em] text-fit-accent -mt-1">VitalOS System</div>
            </div>
          )}
          <button
            onClick={() => setPinned(!pinned)}
            className="absolute right-0 top-2 z-10 flex h-8 w-8 translate-x-1/2 items-center justify-center rounded-full border border-fit-line bg-fit-card text-fit-dim shadow-lg transition-all hover:scale-110 hover:text-fit-accent active:scale-90"
          >
            {pinned ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
          </button>
        </div>

        <nav className="space-y-1 flex-1">
          {navItems.map(({ id, label, Icon, sub, noDefaultSub }) => {
            const isActive = tab === id;
            return (
              <div key={id}>
                <button
                  onClick={() => navigate(id)}
                  title={!pinned ? label : ''}
                  className={`w-full flex items-center transition-all duration-300 ${pinned ? 'gap-4 px-5 py-3.5 rounded-2xl' : 'justify-center p-4 rounded-2xl'} ${isActive ? 'bg-fit-accent text-black shadow-xl shadow-fit-accent/20 font-black scale-[1.02]' : 'text-fit-dim hover:bg-white/5 font-bold hover:translate-x-1'}`}
                >
                  <Icon size={20} className={isActive ? 'stroke-[3]' : ''} />
                  {pinned && <span className="text-sm truncate animate-in fade-in slide-in-from-left-4 duration-500">{label}</span>}
                </button>

                {isActive && pinned && sub?.length > 0 && (
                  <div className="ml-4 mt-1 mb-1 space-y-0.5 border-l-2 border-fit-accent/20 pl-3 animate-in fade-in slide-in-from-top-2 duration-300">
                    {sub.map(({ id: subId, label: subLabel, Icon: SubIcon }) => {
                      const isSubActive = subTab === subId || (!subTab && !noDefaultSub && sub[0].id === subId);
                      return (
                        <button
                          key={subId}
                          onClick={() => navigateSub(subId)}
                          className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-[0.15em] transition-all ${isSubActive ? 'bg-fit-accent/15 text-fit-accent' : 'text-fit-dim/60 hover:text-fit-dim hover:bg-white/5'}`}
                        >
                          <SubIcon size={13} />
                          {subLabel}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          <button onClick={navigateToPlan} title={!pinned ? 'Plan' : ''}
            className={`w-full flex items-center transition-all duration-300 mt-4 ${pinned ? 'gap-4 px-5 py-3.5 rounded-2xl' : 'justify-center p-4 rounded-2xl'} ${tab === 'session' && subTab === 'plan' ? 'bg-fit-accent text-black shadow-xl shadow-fit-accent/20 font-black scale-[1.02]' : 'text-fit-dim hover:bg-white/5 font-bold hover:translate-x-1'}`}>
            <ClipboardList size={20} className={tab === 'session' && subTab === 'plan' ? 'stroke-[3]' : ''} />
            {pinned && <span className="text-sm truncate animate-in fade-in slide-in-from-left-4 duration-500">Plan</span>}
          </button>

          <button onClick={() => navigate('inbox')} title={!pinned ? 'Mitteilungen' : ''}
            className={`w-full flex items-center transition-all duration-300 mt-4 ${pinned ? 'gap-4 px-5 py-3.5 rounded-2xl' : 'justify-center p-4 rounded-2xl'} ${tab === 'inbox' ? 'bg-fit-accent text-black shadow-xl shadow-fit-accent/20 font-black scale-[1.02]' : 'text-fit-dim hover:bg-white/5 font-bold hover:translate-x-1'}`}>
            <Bell size={20} className={tab === 'inbox' ? 'stroke-[3]' : ''} />
            {pinned && <span className="text-sm truncate animate-in fade-in slide-in-from-left-4 duration-500">Mitteilungen</span>}
          </button>

        </nav>

        <div className={`mt-auto space-y-4 pt-6 border-t border-fit-line/30 ${!pinned ? 'w-full flex flex-col items-center overflow-hidden' : ''}`}>
          {pinned ? children : (
            <div className="w-10 h-10 rounded-full bg-fit-bg2 border border-fit-line" />
          )}
        </div>
      </div>
    </aside>
  );
}
