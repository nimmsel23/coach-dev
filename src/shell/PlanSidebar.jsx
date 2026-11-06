import { ChevronLeft, ChevronRight, LogOut, Palette, RefreshCw, ClipboardList } from 'lucide-react'
import { NAV_ITEMS } from './NavigationItems.js'

// Desktop-Navigation — Fork von ~/vitalos/src/shell/layout/Sidebar.jsx.
// Gleiche Glas-Rail (einklappbar), aber mit den Plan-Bereichen als Hauptnavigation.
export default function PlanSidebar({ active, onNavigate, counts = {}, pinned, setPinned, user, onTheme, onRefresh, onSignOut }) {
  return (
    <aside className={`hidden lg:flex flex-col alpha-glass fixed left-3 top-6 bottom-6 z-50 rounded-[2rem] border border-fit-line/70 shadow-2xl shadow-black/20 transition-all duration-500 ease-in-out ${pinned ? 'w-[280px]' : 'w-24'}`}>
      <div className={`flex h-full flex-col p-3.5 ${!pinned ? 'items-center' : ''}`}>
        <div className={`relative mb-5 flex w-full items-center gap-3 ${!pinned ? 'justify-center' : ''}`}>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-fit-accent text-fit-bg shadow-xl shadow-fit-accent/30 transition-transform hover:scale-105">
            <ClipboardList size={20} />
          </div>
          {pinned && (
            <div className="animate-in fade-in duration-500">
              <h2 className="text-lg font-black tracking-tight text-fit-ink">Plan</h2>
              <div className="vos-eyebrow -mt-0.5">VitalOS</div>
            </div>
          )}
          <button
            onClick={() => setPinned(!pinned)}
            aria-label={pinned ? 'Navigation einklappen' : 'Navigation ausklappen'}
            className={`absolute top-1 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/8 text-fit-dim shadow-lg backdrop-blur transition-all hover:scale-110 hover:text-fit-accent active:scale-90 ${pinned ? 'right-0' : '-right-1 translate-x-1/2'}`}
          >
            {pinned ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
          </button>
        </div>

        <nav className="flex-1 space-y-1">
          {NAV_ITEMS.map(({ id, label, Icon }) => {
            const isActive = active === id
            const count = counts[id]
            return (
              <button
                key={id}
                onClick={() => onNavigate(id)}
                title={label}
                aria-current={isActive ? 'page' : undefined}
                className={`flex w-full items-center border transition-all duration-200 ${pinned ? 'gap-4 rounded-2xl px-5 py-3.5' : 'justify-center rounded-2xl p-3.5'} ${isActive ? 'border-fit-accent/25 bg-white/10 font-black text-fit-ink shadow-xl shadow-black/10 backdrop-blur' : 'border-transparent font-bold text-fit-dim hover:border-white/10 hover:bg-white/5'}`}
              >
                <Icon size={20} className={isActive ? 'stroke-[3]' : ''} />
                {pinned && <span className="flex-1 truncate text-left text-sm animate-in fade-in duration-500">{label}</span>}
                {pinned && count > 0 && <span className="vos-tag">{count}</span>}
              </button>
            )
          })}
        </nav>

        <div className={`mt-auto space-y-2.5 border-t border-fit-line/30 pt-3 ${!pinned ? 'flex w-full flex-col items-center' : ''}`}>
          {pinned && user?.email && <div className="truncate px-2 text-[12px] text-fit-dim">{user.email}</div>}
          <div className={`flex gap-1.5 ${!pinned ? 'flex-col' : ''}`}>
            {[
              { key: 'theme', title: 'Theme', Icon: Palette, onClick: onTheme },
              { key: 'refresh', title: 'Neu laden', Icon: RefreshCw, onClick: onRefresh },
              ...(user ? [{ key: 'logout', title: 'Abmelden', Icon: LogOut, onClick: onSignOut }] : []),
            ].map(({ key, title, Icon, onClick }) => (
              <button
                key={key}
                onClick={onClick}
                title={title}
                aria-label={title}
                className="vos-press vos-fill flex h-9 w-9 items-center justify-center rounded-full text-fit-dim hover:text-fit-accent"
              >
                <Icon size={16} />
              </button>
            ))}
          </div>
        </div>
      </div>
    </aside>
  )
}
