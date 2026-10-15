import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, Sparkles, Check, X, RotateCw } from 'lucide-react';
import { checkClientGaps, getCoachDrafts, reviewCoachDraft } from '@db';

const KIND_LABEL = { gap: 'Trainingslücke', feedback: 'Feedback-Entwurf' };

// KI-Insights-Tab: Trainingslücken-Check (Einmal-Check statt fitness-log
// consoles Endlos-Loop) + die davon persistierten Drafts, hier zum
// Freigeben/Verwerfen statt nur im Terminal via `fitness-log drafts`
// einsehbar. Gleiche Datenquelle (~/.aos/fitness/console/drafts/) wie das
// CLI — ein Speicher, zwei Oberflächen.
export default function ClientInsights({ clientUid }) {
  const [gaps, setGaps] = useState([]);
  const [drafts, setDrafts] = useState([]);
  const [checking, setChecking] = useState(false);
  const [loadingDrafts, setLoadingDrafts] = useState(true);
  const [reviewing, setReviewing] = useState(null);
  const [toastMessage, setToastMessage] = useState('');
  const [error, setError] = useState(false);

  const triggerToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 2200);
  };

  const loadDrafts = useCallback(() => {
    setLoadingDrafts(true);
    getCoachDrafts({ uid: clientUid })
      .then(setDrafts)
      .finally(() => setLoadingDrafts(false));
  }, [clientUid]);

  useEffect(() => {
    loadDrafts();
  }, [loadDrafts]);

  async function runGapCheck() {
    setChecking(true);
    setError(false);
    try {
      const result = await checkClientGaps(clientUid);
      setGaps(result);
      loadDrafts();
      if (result.length === 0) triggerToast('Keine ungeklärte Trainingslücke gefunden ✓');
    } catch {
      setError(true);
    } finally {
      setChecking(false);
    }
  }

  async function handleReview(draft, status) {
    setReviewing(draft.id);
    try {
      await reviewCoachDraft(draft.id, draft.uid, status);
      setDrafts((prev) => prev.map((d) => (d.id === draft.id ? { ...d, status } : d)));
      triggerToast(status === 'approved' ? 'Draft freigegeben ✓' : 'Draft verworfen');
    } catch {
      triggerToast('Fehler beim Speichern');
    } finally {
      setReviewing(null);
    }
  }

  const pendingDrafts = drafts.filter((d) => (d.status || 'pending') === 'pending');
  const reviewedDrafts = drafts.filter((d) => (d.status || 'pending') !== 'pending');

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Gap-Check Trigger */}
      <div className="card p-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 shrink-0 rounded-xl flex items-center justify-center bg-fit-accent/15 text-fit-accent">
            <AlertTriangle size={16} />
          </div>
          <div>
            <div className="text-sm font-semibold text-fit-ink">Trainingslücken-Check</div>
            <p className="text-xs" style={{ color: 'var(--dim)', opacity: 0.6 }}>
              {clientUid ? 'Prüft diesen Klienten' : 'Prüft alle aktiven Klienten'} per KI gegen Journal-Einträge (Gemini + Review)
            </p>
          </div>
        </div>
        <button
          onClick={runGapCheck}
          disabled={checking}
          className="flex items-center gap-2 px-4 py-2 bg-fit-accent text-fit-bg rounded-full font-semibold text-xs transition-all disabled:opacity-50 hover:opacity-90"
        >
          {checking ? (
            <><RotateCw size={13} className="animate-spin" /> Prüfe… (kann ~20s dauern)</>
          ) : (
            <><Sparkles size={13} /> Check starten</>
          )}
        </button>
      </div>

      {error && (
        <div className="card py-6 flex flex-col items-center justify-center text-center text-xs" style={{ color: 'var(--dim)' }}>
          Fehler beim Gap-Check — Fitness-Backend evtl. nicht erreichbar
        </div>
      )}

      {gaps.length > 0 && (
        <div className="space-y-3">
          {gaps.map((g) => (
            <div key={g.uid} className="card p-4 border-l-2 border-l-red-500/60 space-y-1.5">
              <div className="flex items-center gap-2">
                <AlertTriangle size={14} className="text-red-500" />
                <span className="text-sm font-semibold text-fit-ink">{g.name}</span>
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-500/10 border border-red-500/20 text-red-500">
                  {g.daysGap}d seit {g.lastSessionDate}
                </span>
              </div>
              {g.reason && <p className="text-xs pl-6" style={{ color: 'var(--dim)' }}>{g.reason}</p>}
            </div>
          ))}
        </div>
      )}

      {/* Pending Drafts */}
      <div>
        <div className="text-xs font-medium pl-1 mb-2" style={{ color: 'var(--dim)', opacity: 0.7 }}>
          Offene Drafts ({loadingDrafts ? '…' : pendingDrafts.length})
        </div>
        {!loadingDrafts && pendingDrafts.length === 0 && (
          <div className="card py-8 flex flex-col items-center justify-center text-center" style={{ opacity: 0.5 }}>
            <p className="text-xs font-medium" style={{ color: 'var(--dim)' }}>Keine offenen Drafts</p>
          </div>
        )}
        <div className="space-y-3">
          {pendingDrafts.map((d) => (
            <div key={d.id} className="card p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Sparkles size={13} className="text-fit-accent" />
                  <span className="text-sm font-semibold text-fit-ink">{d.name}</span>
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-fit-bg2 border border-fit-line/30" style={{ color: 'var(--dim)' }}>
                    {KIND_LABEL[d.kind] || d.kind}
                  </span>
                </div>
                <span className="text-xs" style={{ color: 'var(--dim)', opacity: 0.5 }}>{d.created_at}</span>
              </div>
              <p className="text-xs leading-relaxed text-fit-ink bg-fit-bg2/40 p-3 rounded-xl border border-fit-line/20">{d.text}</p>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => handleReview(d, 'dismissed')}
                  disabled={reviewing === d.id}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full font-semibold text-xs text-fit-dim hover:text-fit-ink disabled:opacity-50"
                >
                  <X size={12} /> Verwerfen
                </button>
                <button
                  onClick={() => handleReview(d, 'approved')}
                  disabled={reviewing === d.id}
                  className="flex items-center gap-1.5 px-3 py-2 bg-fit-accent text-fit-bg rounded-full font-semibold text-xs disabled:opacity-50 hover:opacity-90"
                >
                  <Check size={12} /> Freigeben
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {reviewedDrafts.length > 0 && (
        <div>
          <div className="text-xs font-medium pl-1 mb-2" style={{ color: 'var(--dim)', opacity: 0.7 }}>
            Bereits entschieden ({reviewedDrafts.length})
          </div>
          <div className="space-y-2">
            {reviewedDrafts.map((d) => (
              <div key={d.id} className="card p-3 flex items-center justify-between gap-2 opacity-60">
                <div className="flex items-center gap-2 min-w-0">
                  {d.status === 'approved' ? <Check size={12} className="text-fit-accent shrink-0" /> : <X size={12} className="text-fit-dim shrink-0" />}
                  <span className="text-xs text-fit-ink truncate">{d.text}</span>
                </div>
                <span className="text-xs shrink-0" style={{ color: 'var(--dim)' }}>{d.status === 'approved' ? 'Freigegeben' : 'Verworfen'}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {toastMessage && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 px-5 py-2.5 rounded-full text-xs font-semibold shadow-lg z-50 bg-fit-card text-fit-accent border border-fit-line animate-in slide-in-from-bottom-4 duration-300">
          {toastMessage}
        </div>
      )}
    </div>
  );
}
