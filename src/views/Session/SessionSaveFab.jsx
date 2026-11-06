import { Save } from 'lucide-react';

/**
 * SessionSaveFab — floating mobile-only Save button for SessionEditor.
 *
 * Fix vs. the previous inline version: `bottom-24` alone ignores
 * `env(safe-area-inset-bottom)` on notch phones (the button could sit under
 * the home-indicator area). Now offset via `calc(6rem + env(safe-area-inset-bottom))`
 * (6rem == the previous `bottom-24`), so it keeps its old position on
 * non-notch devices and gains the safe-area padding where needed.
 */
export default function SessionSaveFab({ dirty, autoSaveLabel, saving, onSave }) {
  return (
    <div
      className="lg:hidden fixed right-4 z-40 flex flex-col items-end gap-1.5"
      style={{ bottom: 'calc(6rem + env(safe-area-inset-bottom))' }}
    >
      {dirty && !autoSaveLabel && (
        <span
          className="text-[9px] font-black uppercase tracking-widest animate-in fade-in duration-300"
          style={{ color: 'var(--red)', opacity: 0.7 }}
        >
          ●
        </span>
      )}
      <button
        onClick={onSave}
        disabled={saving}
        className="w-14 h-14 rounded-full flex items-center justify-center transition-all active:scale-95 disabled:opacity-50"
        style={{
          background: 'var(--accent)',
          color: '#000',
          boxShadow: dirty
            ? '0 0 0 4px rgba(200,255,0,0.15), 0 8px 32px -4px rgba(200,255,0,0.4)'
            : '0 8px 24px -4px rgba(200,255,0,0.3)',
        }}
      >
        {saving
          ? <div className="w-5 h-5 border-2 border-black/20 border-t-black rounded-full animate-spin" />
          : <Save size={22} strokeWidth={2.5} />}
      </button>
    </div>
  );
}
