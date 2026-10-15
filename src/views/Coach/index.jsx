import { CheckCircle2, Dumbbell, Users } from 'lucide-react';
import { useInbox } from '../Inbox/useInbox';
import InboxCard from '../Inbox/InboxCard';
import CatalogBrowser from './CatalogBrowser';
import ClientsPanel from './ClientsPanel';
import { useCoachRoute } from './useCoachRoute.js';

const SUB_TABS = [
  { id: 'exercises', idx: '01 · UPLINK', label: () => 'Übungsanfragen', cnt: (n) => `(${n})` },
  { id: 'catalog', idx: '02 · ARCHIV', label: () => 'Katalog Browser', icon: Dumbbell },
  { id: 'clients', idx: '03 · DOSSIER', label: () => 'Klienten', icon: Users },
];

export default function Coach({ onInspectExercise }) {
  const { exercises, mergeCandidates, loading, actioning, toast, approve, remove, reenrich, linkSource } = useInbox({ global: true });
  const [route, navigate] = useCoachRoute();
  const activeSubTab = route.sub;

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="w-6 h-6 border-2 border-fit-accent/30 border-t-fit-accent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-6 p-4 md:p-6 pb-20">
      <header className="cc-cmdbar">
        <div>
          <p className="cc-eyebrow"><span className="cc-dot" /> Sub Rosa Access · Coach</p>
          <h1 className="text-2xl font-bold text-fit-ink">Hidden <span className="cc-em">Chamber</span></h1>
          <p className="text-xs mt-1" style={{ color: 'var(--dim)' }}>Verwaltung &amp; Freigaben</p>
        </div>
        <div className="cc-readout">
          Anfragen offen: <b>{exercises.length}</b><br />
          Aktiv: <b>{SUB_TABS.find((t) => t.id === activeSubTab)?.label()}</b>
        </div>
      </header>

      {/* Sub-Tabs Selector */}
      <div className="cc-switchboard">
        {SUB_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => navigate({ sub: tab.id, client: '', date: '' })}
            className={`cc-switch ${activeSubTab === tab.id ? 'active' : ''}`}
          >
            <span className="cc-idx">{tab.idx}</span>
            <span className="cc-lbl">
              {tab.label()}
              {tab.cnt && <span className="cc-cnt">{tab.cnt(exercises.length)}</span>}
            </span>
          </button>
        ))}
      </div>

      {activeSubTab === 'exercises' && (
        <div className="space-y-4">
          <div className="cc-section-title">
            <h2>Offene Übungsanfragen</h2>
            <span className="cc-tag">{exercises.length} unreviewed</span>
          </div>
          {exercises.length === 0 ? (
            <div className="card py-16 flex flex-col items-center justify-center text-center" style={{ opacity: 0.5 }}>
              <CheckCircle2 size={40} className="mb-3 text-fit-green" />
              <h3 className="text-base font-semibold text-fit-ink">Alles freigegeben</h3>
              <p className="text-xs mt-1" style={{ color: 'var(--dim)' }}>Keine offenen Anfragen</p>
            </div>
          ) : (
            <div className="cc-card-grid">
              {exercises.map(ex => (
                <InboxCard
                  key={ex.file_id}
                  ex={ex}
                  actioning={actioning}
                  onApprove={approve}
                  onDelete={remove}
                  onReenrich={reenrich}
                  onLinkSource={linkSource}
                  onInspect={onInspectExercise}
                  mergeCandidate={mergeCandidates[ex.exercises?.[0]?.exercise_id || ex.enriched?.exercise_id || ex.exercise_id]}
                  showUserId
                />
              ))}
            </div>
          )}
        </div>
      )}
      {activeSubTab === 'catalog' && (
        <div className="space-y-4">
          <div className="cc-section-title">
            <h2>Katalog Browser</h2>
          </div>
          <CatalogBrowser onInspectExercise={onInspectExercise} />
        </div>
      )}
      {activeSubTab === 'clients' && (
        <div className="space-y-4">
          <div className="cc-section-title">
            <h2>Klienten</h2>
          </div>
          <ClientsPanel />
        </div>
      )}

      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 px-5 py-2.5 rounded-full text-xs font-semibold shadow-lg z-50 bg-fit-card text-fit-accent border border-fit-line animate-in slide-in-from-bottom-4 duration-300">
          {toast}
        </div>
      )}
    </div>
  );
}
