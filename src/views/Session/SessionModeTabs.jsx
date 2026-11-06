/**
 * Kraft / Ausdauer bleiben Session-Modi. Skills und 6Pack sind Links zu
 * eigenständigen Apps: VitalOS routet zu den Shell-Wrappern, Fitness Standalone
 * leitet auf die jeweiligen Hosting-Sites weiter.
 */

import { Dumbbell, Activity, ExternalLink } from 'lucide-react';

export default function SessionModeTabs({ sessionMode, setSessionMode, subTab, onSubNav }) {
  const onToday = !subTab || subTab === 'today';
  const tabs = [
    {
      key: 'strength', label: 'Kraft', Icon: Dumbbell, color: 'var(--accent)',
      active: onToday && sessionMode === 'strength',
      go: () => { setSessionMode('strength'); if (!onToday) onSubNav?.('today'); },
    },
    {
      key: 'cardio', label: 'Ausdauer', Icon: Activity, color: 'var(--orange)',
      active: onToday && sessionMode === 'cardio',
      go: () => { setSessionMode('cardio'); if (!onToday) onSubNav?.('today'); },
    },
    {
      key: 'skills', label: 'Skills', Icon: ExternalLink, color: 'var(--accent)',
      active: subTab === 'skills',
      go: () => onSubNav?.('skills'),
    },
    {
      key: 'timer', label: '6Pack', Icon: ExternalLink, color: 'var(--accent)',
      active: subTab === 'timer',
      go: () => onSubNav?.('timer'),
    },
  ];

  return (
    <div className="flex w-full min-w-0 flex-wrap items-center gap-x-3 text-[11px] font-semibold sm:ml-auto sm:w-auto">
      {tabs.map(({ key, label, Icon, color, active, go }) => (
        <button
          key={key}
          onClick={go}
          aria-label={key === 'skills' ? 'Skills-App öffnen' : key === 'timer' ? '6Pack-App öffnen' : label}
          aria-pressed={active}
          className="flex min-h-11 items-center gap-1 pb-0.5 whitespace-nowrap"
          style={{
            color: active ? color : 'var(--dim)',
            borderBottom: active ? `2px solid ${color}` : '2px solid transparent',
          }}
        >
          <Icon size={12} /> {label}
        </button>
      ))}
    </div>
  );
}
