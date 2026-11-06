import { RefreshCw, Settings2, Terminal } from "lucide-react";

export default function LocalDevSection({
  firestoreStatus,
  syncing, onSync,
  health, wger,
}) {
  return (
    <section className="card p-6 border-dashed border-fit-accent/20 animate-in fade-in duration-500">
       <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 rounded-xl bg-fit-accent/10 flex items-center justify-center">
            <Terminal size={18} className="text-fit-accent" />
          </div>
          <div>
             <h3 className="text-base font-semibold text-fit-ink">Local Dev</h3>
             <p className="text-xs" style={{ color: 'var(--dim)', opacity: 0.6 }}>Nur im lokalen Entwicklungsmodus sichtbar</p>
          </div>
       </div>

       <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* Firestore Sync */}
          <div className="bg-fit-bg2 p-5 rounded-2xl border border-fit-line">
             <div className="flex items-center gap-2.5 mb-4">
                <RefreshCw size={16} className={syncing ? 'animate-spin text-fit-accent' : 'text-fit-accent'} />
                <h4 className="text-sm font-semibold text-fit-ink">Firestore-Sync</h4>
             </div>
             <div className="space-y-3">
                <div className="flex items-center justify-between bg-fit-bg p-3 rounded-xl border border-fit-line">
                   <span className="text-xs font-medium" style={{ color: 'var(--dim)', opacity: 0.6 }}>Status</span>
                   {firestoreStatus?.ok
                      ? <span className="text-xs font-semibold bg-green-500/10 text-green-500 px-2.5 py-1 rounded-full border border-green-500/20">Verbunden</span>
                      : <span className="text-xs font-semibold bg-red-500/10 text-red-500 px-2.5 py-1 rounded-full border border-red-500/20">Offline</span>
                   }
                </div>
                <button onClick={onSync} disabled={syncing} className="w-full btn btn-primary py-2.5 text-xs font-semibold">
                   {syncing ? 'Synchronisiere…' : 'Jetzt synchronisieren'}
                </button>
             </div>
          </div>

          {/* Diagnose */}
          <div className="bg-fit-bg2 p-5 rounded-2xl border border-fit-line">
             <div className="flex items-center gap-2.5 mb-4">
                <Settings2 size={16} className="text-fit-dim" />
                <h4 className="text-sm font-semibold text-fit-dim">Diagnose</h4>
             </div>
             <div className="space-y-2.5">
                {[
                  ['Node-API (lokal)', health == null ? 'prüft…' : (health?.ok ? 'ok' : 'fehler')],
                  ['wger (Docker)', wger == null ? 'prüft…' : (wger ? 'ok' : 'fehler')],
                  ['Speicherpfad', '~/.aos/fitness/']
                ].map(([l, v]) => (
                   <div key={l} className="flex items-center justify-between text-xs font-mono bg-fit-bg p-3 rounded-xl border border-fit-line">
                      <span style={{ color: 'var(--dim)', opacity: 0.6 }}>{l}</span>
                      <span className={`font-semibold ${v === 'fehler' ? 'text-red-500' : v === 'prüft…' ? 'text-fit-dim' : 'text-fit-accent'}`}>{v}</span>
                   </div>
                ))}
             </div>
          </div>
       </div>
    </section>
  );
}
