/**
 * ActivityAddon — Kompakter Activity-Anhang für Kraft-Sessions
 *
 * Gedacht für Finisher-Aktivitäten wie "5min HIIT Core" am Ende eines
 * Krafttrainings. Bleibt Teil derselben Session, keine neue Session nötig.
 * Unterscheidet sich von ActivitySection (pure cardio) durch kompaktes Layout.
 */

import { Plus, X } from 'lucide-react';
import { ACTIVITY_MUSCLE_DEFAULTS, ACTIVITY_MUSCLE_GROUPS, MUSCLE_TARGET_GROUPS } from '../../constants/ActivityConstants';
import { ACTIVITY_TYPES } from '../../constants/activities';

const MUSCLE_TARGETS = [
  { value: 'core',  label: 'Core' },
  { value: 'legs',  label: 'Beine' },
  { value: 'full',  label: 'Full Body' },
];

// Build ADDON_TYPES from ACTIVITY_TYPES — map lucide icon to emoji
export const ADDON_TYPES = ACTIVITY_TYPES.map(activity => ({
  value: activity.value,
  label: activity.label,
  icon: activity.emoji, // ActivityAddon uses emoji as the icon field, not lucide component
}));

export default function ActivityAddon({ hasActivity, setHasActivity, activity, setActivity }) {
  if (!hasActivity) {
    return (
      <button
        onClick={() => {
          setHasActivity(true);
          // Default 5min: der weit überwiegende Fall in der Praxis (Coach-
          // Feedback), Nutzer können den Wert weiterhin frei überschreiben.
          setActivity({ type: 'hiit', duration: '5', notes: '', muscleTarget: 'core', muscles: ['core'] });
        }}
        className="w-full flex items-center justify-center gap-2.5 px-4 py-3.5 rounded-2xl border border-dashed border-fit-line text-fit-dim hover:border-fit-orange/40 hover:text-fit-orange hover:bg-fit-orange/5 text-[10px] font-black uppercase tracking-[0.2em] transition-all duration-200"
      >
        <Plus size={13} strokeWidth={3} />
        Activity-Finisher hinzufügen
      </button>
    );
  }

  const selected = ADDON_TYPES.find(t => t.value === activity.type) || ADDON_TYPES[0];

  return (
    <div className="rounded-[24px] border border-fit-orange/20 bg-fit-orange/5 p-5 space-y-4 animate-in slide-in-from-top-2 duration-200">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg leading-none">{selected.icon}</span>
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-fit-orange">
              Activity-Finisher
            </div>
            <div className="text-[9px] text-fit-dim/40 font-medium">
              Anhang zu diesem Workout
            </div>
          </div>
        </div>
        <button
          onClick={() => setHasActivity(false)}
          className="w-7 h-7 rounded-lg bg-fit-bg2 flex items-center justify-center text-fit-dim hover:text-fit-red hover:bg-fit-red/10 transition-all"
        >
          <X size={13} />
        </button>
      </div>

      {/* Type + Duration inline */}
      <div className="flex gap-2">
        {/* Type selector — compact horizontal scroll */}
        <div className="flex-1 flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {ADDON_TYPES.map(t => {
            const isActive = activity.type === t.value;
            return (
              <button
                key={t.value}
                onClick={() => {
                  const target = ACTIVITY_MUSCLE_DEFAULTS[t.value] || 'full';
                  // Nur HIIT wählt seine Muskeln über das Ziel; alle anderen Typen haben feste Muskeln,
                  // die in die Coverage und die PPL-Balance einfließen (z. B. Crossfit: upper_back, forearms).
                  const muscles = t.value === 'hiit' ? MUSCLE_TARGET_GROUPS[target] : (ACTIVITY_MUSCLE_GROUPS[t.value] || MUSCLE_TARGET_GROUPS[target]);
                  setActivity({ ...activity, type: t.value, muscleTarget: target, muscles });
                }}
                title={t.label}
                className={`flex-shrink-0 flex flex-col items-center gap-1 px-3 py-2 rounded-xl border transition-all ${
                  isActive
                    ? 'border-fit-orange bg-fit-orange/15 shadow-xs'
                    : 'border-fit-line bg-fit-bg2 hover:border-fit-orange/30'
                }`}
              >
                <span className="text-base leading-none">{t.icon}</span>
                <span className={`text-[8px] font-black uppercase tracking-wide whitespace-nowrap ${
                  isActive ? 'text-fit-orange' : 'text-fit-dim'
                }`}>
                  {t.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Muscle Target Switch */}
      <div className="flex items-center gap-2">
        <span className="text-[9px] font-black uppercase tracking-widest text-fit-dim/40 shrink-0">Ziel</span>
        <div className="flex gap-1">
          {MUSCLE_TARGETS.map(t => {
            const isActive = (activity.muscleTarget || ACTIVITY_MUSCLE_DEFAULTS[activity.type] || 'full') === t.value;
            return (
              <button
                key={t.value}
                onClick={() => setActivity({ ...activity, muscleTarget: t.value, muscles: MUSCLE_TARGET_GROUPS[t.value] })}
                className={`px-3 py-1.5 rounded-lg border text-[9px] font-black uppercase tracking-wider transition-all ${
                  isActive
                    ? 'border-fit-orange bg-fit-orange/15 text-fit-orange'
                    : 'border-fit-line bg-fit-bg2 text-fit-dim hover:border-fit-orange/30'
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Duration */}
      <div className="relative">
        <input
          type="number"
          placeholder="Dauer"
          value={activity.duration}
          onChange={e => setActivity({ ...activity, duration: e.target.value })}
          className="w-full p-3 pr-20 rounded-xl border bg-fit-bg2 border-fit-line text-fit-ink font-bold text-sm focus:border-fit-orange outline-none transition-all"
        />
        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black uppercase tracking-widest text-fit-dim/30">
          min
        </span>
      </div>
    </div>
  );
}
