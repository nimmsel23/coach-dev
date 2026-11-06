/**
 * SessionToast — bottom-of-screen notification for SessionEditor.
 *
 * Read-only display: `toast` comes from `useSession.js`'s `showToast(msg)`,
 * which already sets its own auto-clear timer (`setTimeout(() => setToast(''), 2200)`,
 * see `useSession.js` ~line 342) every time it sets a message. This component
 * therefore does NOT run a second timer of its own — that would just be a
 * redundant, easy-to-desync clear racing the one in useSession.js. It only
 * renders whatever `toast` currently holds.
 */
export default function SessionToast({ toast, toastAction = null }) {
  if (!toast) return null;
  return (
    <div
      className="fixed bottom-24 lg:bottom-10 left-1/2 -translate-x-1/2 px-5 py-3 rounded-xl text-sm font-bold shadow-2xl z-50 animate-in slide-in-from-bottom-4 duration-300"
      style={{
        background: 'var(--card)',
        color: 'var(--accent)',
        border: '1px solid var(--line)',
      }}
    >
      {toast}
      {toastAction && (
        <button
          onClick={toastAction.onClick}
          className="ml-3 underline underline-offset-2"
          style={{ color: 'var(--ink)' }}
        >
          {toastAction.label}
        </button>
      )}
    </div>
  );
}
