import { X } from 'lucide-react';
import { ADDON_TYPES } from './ActivityAddon';

/**
 * ActivityAddonHistory — read-only list of already-saved cardio finishers
 * for the current day.
 *
 * Naming note (source of confusion flagged in AUDIT.md): this component
 * deals with `activityAddons` (PLURAL) — the historical list of finishers
 * already saved to this day's session(s). That is a different thing from
 * `activity` (SINGULAR, used in `ActivityAddon.jsx`/`ActivitySection.jsx`),
 * which is the single finisher currently being drafted/edited before it is
 * saved. `activityAddons` never includes the in-progress `activity` draft.
 */
export default function ActivityAddonHistory({ activityAddons, removeActivityAddon }) {
  if (!activityAddons?.length) return null;
  return (
    <div className="space-y-1.5">
      <div
        className="text-[9px] font-black uppercase tracking-[0.2em] px-1"
        style={{ color: 'var(--dim)', opacity: 0.5 }}
      >
        Geloggte Finisher
      </div>
      {activityAddons.map((addon, i) => {
        const meta = ADDON_TYPES.find(t => t.value === addon.type) || ADDON_TYPES[0];
        return (
          <div
            key={i}
            className="flex items-center gap-3 px-4 py-2.5 rounded-xl"
            style={{ background: 'var(--card)', border: '1px solid var(--line)' }}
          >
            <span className="text-base leading-none">{meta.icon}</span>
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-bold" style={{ color: 'var(--ink)' }}>
                {meta.label}{addon.duration ? ` · ${addon.duration} min` : ''}
              </div>
              {addon.notes && (
                <div className="text-[10px] truncate" style={{ color: 'var(--dim)', opacity: 0.6 }}>
                  {addon.notes}
                </div>
              )}
            </div>
            <button
              onClick={() => removeActivityAddon(i)}
              className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-fit-dim hover:text-fit-red hover:bg-fit-red/10 transition-all"
            >
              <X size={13} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
