import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

export default function AuthGateModal({
  open,
  onClose,
  authEmail,
  setAuthEmail,
  authPassword,
  setAuthPassword,
  authError,
  authRegistering,
  setAuthRegistering,
  onSubmit,
  onGoogleSignIn,
  productName = 'VitalOS Fitness',
  requiredAccess = false,
}) {
  const dialogRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return undefined;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const dialog = dialogRef.current;
    dialog?.querySelector('input')?.focus();
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current?.(); }
      if (event.key !== 'Tab') return;
      const elements = [...dialog.querySelectorAll('button:not(:disabled), input:not(:disabled)')];
      const first = elements[0];
      const last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-fit-scrim px-4 py-4 backdrop-blur-xs"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={dialogRef}
        className="relative max-h-[calc(100dvh-2rem)] w-full max-w-sm overflow-y-auto card p-6 space-y-6 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-gate-title"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Login-Overlay schließen"
          className="absolute right-4 top-4 min-h-11 min-w-11 rounded-full p-2 text-fit-dim transition-colors hover:bg-fit-bg2 hover:text-fit-ink"
        >
          <X size={18} />
        </button>

        <div className="pr-10">
          <h2 id="auth-gate-title" className="text-2xl font-black tracking-tight">{productName}</h2>
          <p className="mt-2 text-[10px] font-bold uppercase tracking-widest text-fit-dim">
            {requiredAccess ? 'Anmeldung erforderlich' : 'Demo-Modus aktiv · Login optional'}
          </p>
          <p className="mt-3 text-sm text-fit-dim">
            {requiredAccess ? 'Melde dich mit deinem Coach-Konto an. Ein neu erstelltes Konto benötigt eine Coach-Freigabe.' : 'Melde dich an, um Firestore-Sync und Cloud-Daten auf diesem Gerät zu nutzen.'}
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          <input type="email" aria-label="E-Mail" autoComplete="email" placeholder="E-Mail" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} required className="w-full bg-fit-bg2 border border-fit-line rounded-xl px-4 py-3 text-base font-bold focus:border-fit-accent outline-none" />
          <input type="password" aria-label="Passwort" autoComplete={authRegistering ? 'new-password' : 'current-password'} placeholder="Passwort" value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} required className="w-full bg-fit-bg2 border border-fit-line rounded-xl px-4 py-3 text-base font-bold focus:border-fit-accent outline-none" />
          {authError && <p className="text-fit-red text-[10px] font-bold uppercase text-center">{authError}</p>}
          <button type="submit" className="w-full btn btn-primary py-3 font-black uppercase tracking-widest">
            {authRegistering ? 'Account erstellen' : 'Anmelden'}
          </button>
        </form>

        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-fit-line opacity-50" />
          <span className="text-[9px] font-black uppercase text-fit-dim">oder</span>
          <div className="h-px flex-1 bg-fit-line opacity-50" />
        </div>

        <button onClick={onGoogleSignIn} className="w-full flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-[10px] font-black uppercase tracking-widest text-black transition-transform active:scale-95">
          Google Login
        </button>

        <button onClick={() => setAuthRegistering(!authRegistering)} className="min-h-11 w-full text-[10px] font-black uppercase text-fit-dim hover:text-fit-accent">
          {authRegistering ? 'Bereits einen Account? Anmelden' : 'Neu hier? Account erstellen'}
        </button>
      </div>
    </div>
  );
}
