import UnreadBadge from '../UnreadBadge.jsx';
import { useRef, useState } from 'react';
import { MessageSquare, MoreHorizontal, ChevronLeft, LayoutGrid } from 'lucide-react';

// Training (session) ist der mit Abstand meistgenutzte Tab und startet
// standardmäßig offen — deshalb erscheinen seine Subtabs (Heute/Timer/
// Skills/Plan/History) direkt als primäre Reihe in der Bottom Nav statt
// eines einzigen "Training"-Icons unter Gleichen. Alles andere (Review/
// Lernen/Anamnese-Fokus/Setup) wandert hinter "•••" ganz rechts — ein Tap
// tauscht die Icons derselben Zeile gegen die bisherigen Nav-Items aus
// (keine zweite Zeile/kein Sheet), der Button wird dann zum "Zurück".
// Timer (6Pack) und Skills (Calisthenics) sind weder in der Hauptreihe noch
// hinter "Mehr": sie werden im Training-Tab neben Kraft/Ausdauer angeboten
// (SessionModeTabs). Atlas (eigener Tab) steht dafür in der Hauptreihe.
const HIDDEN_SUBS = ['timer', 'skills'];
const PRIMARY_TABS = ['atlas'];

export default function MobileNav({ tab, subTab, navigate, navigateSub, swipeHint, navItems, inboxUnread, onOpenHub, onOpenSheet }) {
  const [showMore, setShowMore] = useState(false);
  // Die Leiste ist die eingeklappte Unterkante des Gate-Sheets: nach oben wischen (oder den
  // Griff tippen) zieht das Sheet heraus; dort ersetzt die Hub-Leiste diese Nav.
  const dragStartY = useRef(null);
  const onDragStart = (e) => { dragStartY.current = e.touches[0].clientY; };
  const onDragEnd = (e) => {
    if (dragStartY.current == null) return;
    const dy = e.changedTouches[0].clientY - dragStartY.current;
    dragStartY.current = null;
    if (dy < -40) onOpenSheet?.();
  };

  const sessionItem = navItems.find((i) => i.id === 'session');
  const sessionSubs = sessionItem?.sub || [];
  const isOnSession = tab === 'session';
  const activeSub = subTab || 'today';
  const isSubActive = (id) => isOnSession && activeSub === id;
  // "Mehr" leuchtet, wenn der aktive Ort nur dort erreichbar ist.
  const isOnOtherTab = !isOnSession && !PRIMARY_TABS.includes(tab);

  function openPrimary(subId) {
    setShowMore(false);
    if (!isOnSession) navigate('session');
    navigateSub(subId);
  }

  function openOther(id) {
    setShowMore(false);
    navigate(id);
  }

  // Der Default-Subtab 'today' heißt in der Bottom Nav "Training" (Tab-Label
  // + Icon von session) — "Heute" taucht hier bewusst nicht mehr auf.
  const subEntry = ({ id, label, Icon }) => ({
    id,
    label: id === 'today' ? sessionItem.label : label,
    Icon: id === 'today' ? sessionItem.Icon : Icon,
    isActive: isSubActive(id),
    onClick: () => openPrimary(id),
  });
  const tabEntry = ({ id, label, Icon }) => ({
    id, label, Icon,
    isActive: tab === id,
    onClick: () => openOther(id),
  });

  const rowItems = showMore
    ? [
        ...navItems
          .filter((i) => i.id !== 'session' && !PRIMARY_TABS.includes(i.id))
          .map(tabEntry),
        tabEntry({ id: 'inbox', label: 'Nachrichten', Icon: MessageSquare }),
      ]
    : [
        // Plan/Logbuch/Timer/Skills + alle Tabs liegen im Hub (Gate-Sheet, hochziehbar);
        // die Leiste behält nur Training, den Hub-Einstieg und Atlas.
        ...(onOpenHub
          ? [
              ...sessionSubs.filter((i) => i.id === 'today').map(subEntry),
              { id: 'hub', label: 'Hub', Icon: LayoutGrid, isActive: false, onClick: () => { setShowMore(false); onOpenHub(); } },
            ]
          : sessionSubs.filter((i) => !HIDDEN_SUBS.includes(i.id)).map(subEntry)),
        ...navItems.filter((i) => PRIMARY_TABS.includes(i.id)).map(tabEntry),
      ];

  return (
    <nav
      aria-label="Hauptnavigation"
      onTouchStart={onOpenSheet ? onDragStart : undefined}
      onTouchEnd={onOpenSheet ? onDragEnd : undefined}
      className="mobile-nav lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-fit-card/90 backdrop-blur-2xl border-t border-fit-line/40"
    >
      {onOpenSheet && (
        <button
          type="button"
          onClick={onOpenSheet}
          aria-label="Sheet herausziehen"
          className="absolute -top-3 left-1/2 -translate-x-1/2 h-6 w-16 flex items-start justify-center pt-1.5"
        >
          <span className="block h-1 w-10 rounded-full bg-fit-line" />
        </button>
      )}
      {/* Swipe direction indicator — thin accent line at top */}
      <div className={`absolute top-0 left-0 right-0 h-[2px] transition-all duration-200 ${
        swipeHint === 'left'
          ? 'bg-gradient-to-l from-fit-accent via-[var(--accent)]/40 to-transparent opacity-80'
          : swipeHint === 'right'
            ? 'bg-gradient-to-r from-fit-accent via-[var(--accent)]/40 to-transparent opacity-80'
            : 'opacity-0'
      }`} />

      <div
        className="mobile-nav-inner"
      >
        <div className="flex flex-wrap items-end justify-around">
          {rowItems.map(({ id, label, Icon, isActive, onClick }) => (
            <button
              key={id}
              onClick={onClick}
              aria-current={isActive ? 'page' : undefined}
              className="min-h-12 flex flex-1 flex-col items-center justify-center gap-[5px] px-1 active:scale-90 transition-transform duration-150 min-w-[44px]"
            >
              <div className={`flex items-center justify-center rounded-2xl transition-all duration-300 ${
                isActive ? 'bg-fit-accent w-12 h-8 shadow-lg shadow-fit-accent/30' : 'w-10 h-8'
              }`}>
                <Icon size={isActive ? 17 : 19} className={isActive ? 'text-black stroke-[2.5]' : 'text-fit-dim stroke-[1.8]'} />
              </div>
              <span className={`text-[10px] font-bold leading-tight transition-all duration-300 ${
                isActive ? 'text-fit-accent' : 'text-fit-dim'
              }`}>
                {label}{id === 'inbox' && <UnreadBadge value={inboxUnread} />}
              </span>
            </button>
          ))}

          <button
            onClick={() => setShowMore((v) => !v)}
            aria-expanded={showMore}
            aria-label={showMore ? 'Zurück zur Hauptnavigation' : 'Weitere Bereiche anzeigen'}
            className="min-h-12 flex flex-1 flex-col items-center justify-center gap-[5px] px-1 active:scale-90 transition-transform duration-150 min-w-[44px]"
          >
            <div className={`flex items-center justify-center rounded-2xl transition-all duration-300 ${
              showMore || isOnOtherTab ? 'bg-fit-accent w-12 h-8 shadow-lg shadow-fit-accent/30' : 'w-10 h-8'
            }`}>
              {showMore
                ? <ChevronLeft size={17} className="text-black stroke-[2.5]" />
                : <MoreHorizontal size={isOnOtherTab ? 17 : 19} className={isOnOtherTab ? 'text-black stroke-[2.5]' : 'text-fit-dim stroke-[1.8]'} />}
            </div>
            <span className={`text-[10px] font-bold leading-tight transition-all duration-300 ${
              showMore || isOnOtherTab ? 'text-fit-accent' : 'text-fit-dim'
            }`}>
              {showMore ? 'Zurück' : <>Mehr <UnreadBadge value={inboxUnread} /></>}
            </span>
          </button>
        </div>
      </div>
    </nav>
  );
}
