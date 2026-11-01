import { useCoachUnreadCounts } from './useCoachUnreadCounts.js';
import { useEffect } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { useInbox } from '../Inbox/useInbox';
import InboxCard from '../Inbox/InboxCard';
import CatalogBrowser from './CatalogBrowser';
import ClientsPanel from './ClientsPanel';

// Inhalt der Coach-Konsole. Navigation (Sidebar/Tab-Bar) und Titel liegen in
// der Shell (src/shell/CoachShell.jsx); `sub` kommt aus der Hash-Route.
export default function Coach({ sub = 'exercises', onInspectExercise, onInboxCount, onUnreadCount }) {
  const unread = useCoachUnreadCounts();
  useEffect(() => { onUnreadCount?.(unread.total); }, [unread.total, onUnreadCount]);
  const { exercises, mergeCandidates, loading, actioning, toast, approve, remove, reenrich, reload } = useInbox({ global: true });

  useEffect(() => {
    onInboxCount?.(exercises.length);
  }, [exercises.length, onInboxCount]);

  if (loading && sub === 'exercises') return (
    <div className="flex items-center justify-center py-20">
      <div className="spinner" />
    </div>
  );

  return (
    <div className="space-y-4 p-4 md:p-6">
      {unread.error && <p role="status" className="text-sm text-fit-dim">Ungelesen-Status ist derzeit nicht verfügbar.</p>}
      {sub === 'exercises' && (
        exercises.length === 0 ? (
          <div className="card flex flex-col items-center justify-center py-16 text-center">
            <CheckCircle2 size={40} className="mb-3 text-fit-green" />
            <h3 className="text-base font-semibold text-fit-ink">Alles freigegeben</h3>
            <p className="mt-1 text-xs text-fit-dim">Keine offenen Anfragen</p>
          </div>
        ) : (
          <div className="vos-card-grid">
            {exercises.map(ex => (
              <InboxCard
                key={ex.file_id}
                ex={ex}
                actioning={actioning}
                onApprove={approve}
                onDelete={remove}
                onReenrich={reenrich}
                onSourcesChanged={reload}
                onInspect={onInspectExercise}
                mergeCandidate={mergeCandidates[ex.exercises?.[0]?.exercise_id || ex.enriched?.exercise_id || ex.exercise_id]}
                showUserId
              />
            ))}
          </div>
        )
      )}
      {sub === 'catalog' && <CatalogBrowser onInspectExercise={onInspectExercise} />}
      {sub === 'clients' && <ClientsPanel unreadCounts={unread.byClient} />}

      {toast && (
        <div
          className="vos-sheet vos-sheet-in fixed left-1/2 z-[65] -translate-x-1/2 rounded-full px-5 py-2.5 text-xs font-semibold text-fit-accent shadow-lg"
          style={{ bottom: 'calc(var(--mobile-nav-height, 0px) + 16px)', border: '1px solid color-mix(in srgb, var(--ink) 8%, transparent)' }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}
