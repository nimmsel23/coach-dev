import { FolderOpen, RefreshCw } from 'lucide-react';
import { workspaceForUid } from './workspaceApi.js';

export default function WorkspaceOverview({ uid, state }) {
  const match = workspaceForUid(state.workspaces, uid);
  const workspace = match.workspace;
  return (
    <section className="coach-workspace" aria-label="Lokaler Workspace">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-base font-semibold"><FolderOpen size={18} /> Lokaler Workspace</h3>
        <button type="button" onClick={state.retry} disabled={state.status === 'loading'} className="vos-btn min-h-11 text-xs"><RefreshCw size={14} /> Aktualisieren</button>
      </header>
      {state.status === 'loading' ? <p role="status" className="mt-4 text-sm text-fit-muted">Workspace wird verbunden …</p>
        : state.status !== 'ready' ? <p role="status" className="mt-4 text-sm text-fit-muted">{state.error}</p>
          : !workspace ? <p className="mt-4 text-sm text-fit-muted">{match.status === 'ambiguous' ? 'Mehrere Workspaces sind diesem Konto zugeordnet. UID-Zuordnung lokal klären.' : 'Diesem Konto ist noch kein lokaler Workspace zugeordnet.'}</p>
            : <>
              <div className="my-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
                <span className="font-medium">{workspace.name}</span><span className="text-fit-muted">Konto verknüpft</span>
                <span className="text-fit-muted">{workspace.taskwarriorConfigured ? 'Aufgaben eingerichtet' : 'Aufgaben nicht eingerichtet'}</span>
              </div>
              {workspace.plans.length ? <ul className="divide-y divide-fit-line/30">{workspace.plans.map((plan) => <li key={plan.id} className="flex flex-wrap items-baseline justify-between gap-2 py-3 text-sm">
                <span className="font-medium">{plan.name}</span>
                <span className="text-xs text-fit-muted">{plan.status === 'draft' ? 'Entwurf' : `Lokal freigegeben · V${plan.version}`}{plan.deliveredVersion ? ` · V${plan.deliveredVersion} versendet` : ' · noch nicht versendet'}</span>
              </li>)}</ul> : <p className="text-sm text-fit-muted">Noch keine lokalen Trainingspläne.{workspace.legacyPlan ? ' Ein älterer Plan ist vorhanden.' : ''}</p>}
              <p className="mt-4 text-xs text-fit-muted">Lokaler Stand · geprüft {state.checkedAt ? new Date(state.checkedAt).toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' }) : 'gerade eben'}. Entwürfe bleiben lokal, bis du sie ausdrücklich veröffentlichst.</p>
            </>}
    </section>
  );
}
