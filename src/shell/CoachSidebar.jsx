import { useState } from 'react'
import { ChevronLeft, ChevronRight, ExternalLink, LogOut, Palette, RefreshCw, Shield } from 'lucide-react'
import { NAV_ITEMS } from './NavigationItems.js'
import ClientQuickMenu, { placeContextMenu } from './ClientQuickMenu.jsx'
import InboxQuickMenu from './InboxQuickMenu.jsx'
import { CLIENT_MORE_TABS, CLIENT_PRIMARY_TABS } from '../views/Coach/clientSubTabs.js'

// Desktop-Navigation — Fork von ~/vitalos/src/shell/layout/Sidebar.jsx.
// Gleiche Glas-Rail (einklappbar), aber mit den Coach-Bereichen als Hauptnavigation.
export default function CoachSidebar({
  active,
  onNavigate,
  counts = {},
  pinned,
  setPinned,
  user,
  onTheme,
  onRefresh,
  onSignOut,
  onSelectClient = null,
  unreadByClient = {},
  onSelectInbox = null,
  clientDetail = 'workouts',
  onSelectClientDetail = null,
}) {
  const [clientMenu, setClientMenu] = useState(null)
  const [inboxMenu, setInboxMenu] = useState(null)
  const [moreOpen, setMoreOpen] = useState(false)
  const clientsActive = active === 'clients'
  const moreActive = CLIENT_MORE_TABS.some((tab) => tab.id === clientDetail)

  return (
    <aside className={`hidden lg:flex flex-col alpha-glass fixed left-3 top-6 bottom-6 z-50 rounded-[2rem] border border-fit-line/70 shadow-2xl shadow-black/20 transition-all duration-500 ease-in-out ${pinned ? 'w-[280px]' : 'w-24'}`}>
      <div className={`flex h-full flex-col p-3.5 ${!pinned ? 'items-center' : ''}`}>
        <div className={`relative mb-5 flex w-full items-center gap-3 ${!pinned ? 'justify-center' : ''}`}>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-fit-accent text-black shadow-xl shadow-fit-accent/30 transition-transform hover:scale-105">
            <Shield size={20} />
          </div>
          {pinned && (
            <div className="animate-in fade-in duration-500">
              <h2 className="text-lg font-black tracking-tight text-fit-ink">Coach</h2>
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

        <nav className="flex-1 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map(({ id, label, Icon }) => {
            const isActive = active === id
            const count = counts[id]
            return (
              <div key={id}>
                <button
                  onClick={() => onNavigate(id)}
                  onContextMenu={(event) => {
                    if (id === 'clients' && onSelectClient) {
                      event.preventDefault()
                      setInboxMenu(null)
                      setClientMenu(placeContextMenu(event))
                      return
                    }
                    if (id === 'exercises' && onSelectInbox) {
                      event.preventDefault()
                      setClientMenu(null)
                      setInboxMenu(placeContextMenu(event, { width: 300 }))
                    }
                  }}
                  title={
                    id === 'clients' ? `${label} · Rechtsklick: Klient wählen`
                      : id === 'exercises' ? `${label} · Rechtsklick: kompakte Liste`
                        : label
                  }
                  aria-current={isActive ? 'page' : undefined}
                  className={`flex w-full items-center border transition-all duration-200 ${pinned ? 'gap-4 rounded-2xl px-5 py-3.5' : 'justify-center rounded-2xl p-3.5'} ${isActive ? 'border-fit-accent/25 bg-white/10 font-black text-fit-ink shadow-xl shadow-black/10 backdrop-blur' : 'border-transparent font-bold text-fit-dim hover:border-white/10 hover:bg-white/5'}`}
                >
                  <Icon size={20} className={isActive ? 'stroke-[3]' : ''} />
                  {pinned && <span className="flex-1 truncate text-left text-sm animate-in fade-in duration-500">{label}</span>}
                  {pinned && count > 0 && <span className="vos-tag">{count >= 100 ? '99+' : count}</span>}
                </button>

                {id === 'clients' && clientsActive && onSelectClientDetail && (
                  <div className={`mt-1 space-y-0.5 ${pinned ? 'ml-4 border-l border-fit-line/30 pl-2' : 'flex flex-col items-center'}`}>
                    {CLIENT_PRIMARY_TABS.map((tab) => {
                      const TabIcon = tab.icon
                      const tabActive = clientDetail === tab.id
                      return (
                        <button
                          key={tab.id}
                          type="button"
                          title={tab.label}
                          onClick={() => onSelectClientDetail(tab.id)}
                          aria-current={tabActive ? 'page' : undefined}
                          className={`flex w-full items-center transition-all ${pinned ? 'gap-3 rounded-xl px-3 py-2 text-left' : 'justify-center rounded-xl p-2.5'} ${tabActive ? 'bg-fit-accent/15 font-semibold text-fit-accent' : 'text-fit-dim hover:bg-white/5 hover:text-fit-ink'}`}
                        >
                          <TabIcon size={pinned ? 15 : 16} />
                          {pinned && <span className="truncate text-xs">{tab.label}</span>}
                        </button>
                      )
                    })}
                    {pinned ? (
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setMoreOpen((value) => !value)}
                          className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-xs ${moreActive || moreOpen ? 'bg-fit-accent/10 font-semibold text-fit-accent' : 'text-fit-dim hover:bg-white/5 hover:text-fit-ink'}`}
                        >
                          Mehr…
                        </button>
                        {moreOpen && (
                          <div className="mt-1 space-y-0.5 rounded-xl border border-fit-line/40 bg-fit-card/90 p-1 shadow-lg">
                            {CLIENT_MORE_TABS.map((tab) => {
                              const TabIcon = tab.icon
                              const tabActive = clientDetail === tab.id
                              return (
                                <button
                                  key={tab.id}
                                  type="button"
                                  onClick={() => {
                                    onSelectClientDetail(tab.id)
                                    setMoreOpen(false)
                                  }}
                                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-xs ${tabActive ? 'bg-fit-accent/15 font-semibold text-fit-accent' : 'text-fit-dim hover:bg-white/5 hover:text-fit-ink'}`}
                                >
                                  <TabIcon size={14} />
                                  <span className="truncate">{tab.label}</span>
                                </button>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    ) : (
                      CLIENT_MORE_TABS.slice(0, 1).map((tab) => {
                        const TabIcon = tab.icon
                        const tabActive = CLIENT_MORE_TABS.some((item) => item.id === clientDetail)
                        return (
                          <button
                            key="more-collapsed"
                            type="button"
                            title="Mehr Klienten-Bereiche"
                            onClick={() => onSelectClientDetail(tabActive ? clientDetail : tab.id)}
                            className={`flex justify-center rounded-xl p-2.5 ${tabActive ? 'bg-fit-accent/15 text-fit-accent' : 'text-fit-dim hover:bg-white/5'}`}
                          >
                            <TabIcon size={16} />
                          </button>
                        )
                      })
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </nav>

        <ClientQuickMenu
          menu={clientMenu}
          unreadByClient={unreadByClient}
          onClose={() => setClientMenu(null)}
          onSelect={onSelectClient}
        />
        <InboxQuickMenu
          menu={inboxMenu}
          onClose={() => setInboxMenu(null)}
          onSelect={onSelectInbox}
        />

        <div className={`mt-auto space-y-2.5 border-t border-fit-line/30 pt-3 ${!pinned ? 'flex w-full flex-col items-center' : ''}`}>
          {pinned && user?.email && <div className="truncate px-2 text-[12px] text-fit-dim">{user.email}</div>}
          <div className={`flex gap-1.5 ${!pinned ? 'flex-col' : ''}`}>
            <a
              href="https://vitalos.web.app"
              target="_blank"
              rel="noopener noreferrer"
              title="VitalOS öffnen (vitalos.web.app)"
              aria-label="VitalOS öffnen"
              className="vos-press vos-fill flex h-9 w-9 items-center justify-center rounded-full text-fit-dim hover:text-fit-accent"
            >
              <ExternalLink size={16} />
            </a>
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
