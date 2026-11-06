import { RefreshCw } from "lucide-react";

export default function UpdateSection({
  swVersion,
  swUpdateAvailable,
  swChecking,
  swCheckResult,
  swLastChecked,
  onSwCheck,
  onSwApply,
}) {
  return (
    <section className="card p-6 space-y-4 animate-in fade-in duration-500">
       <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-fit-bg2 border border-fit-line flex items-center justify-center">
            <RefreshCw size={18} className={swChecking ? 'animate-spin text-fit-accent' : 'text-fit-dim'} />
          </div>
          <h3 className="text-base font-semibold text-fit-ink">App-Version &amp; Updates</h3>
       </div>

       <div className="bg-fit-bg2 p-4 rounded-2xl border border-fit-line space-y-3">
          <div className="flex items-center justify-between bg-fit-bg p-3 rounded-xl border border-fit-line">
             <span className="text-xs font-medium" style={{ color: 'var(--dim)', opacity: 0.6 }}>Installiert</span>
             <span className="text-xs font-mono font-semibold text-fit-accent">{swVersion || '—'}</span>
          </div>
          {swUpdateAvailable && (
             <div className="text-xs font-medium text-amber-500 bg-amber-500/10 border border-amber-500/20 px-3 py-2 rounded-xl text-center">
                Update bereit
             </div>
          )}
          {!swUpdateAvailable && !swChecking && swCheckResult === 'up-to-date' && (
             <div className="text-xs font-medium text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 rounded-xl text-center">
                App ist aktuell{swLastChecked ? ` · ${swLastChecked.toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' })}` : ''}
             </div>
          )}
          {!swUpdateAvailable && !swChecking && swCheckResult === 'error' && (
             <div className="text-xs font-medium text-red-500 bg-red-500/10 border border-red-500/20 px-3 py-2 rounded-xl text-center">
                Prüfung fehlgeschlagen — kein Service Worker aktiv
             </div>
          )}
          {swUpdateAvailable ? (
             <button onClick={onSwApply} className="w-full btn btn-primary py-2.5 text-xs font-semibold">
                Jetzt aktualisieren &amp; neu laden
             </button>
          ) : (
             <button onClick={onSwCheck} disabled={swChecking} className="w-full py-2.5 text-xs font-semibold text-fit-dim bg-fit-bg border border-fit-line rounded-xl hover:text-fit-ink hover:border-fit-accent/40 transition-all">
                {swChecking ? 'Suche Update…' : 'Auf Update prüfen'}
             </button>
          )}
       </div>
    </section>
  );
}
