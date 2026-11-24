import { ArrowUpRight, FolderOpen, RefreshCw } from 'lucide-react';
import { cloudCounterpart, localPlanState, localWorkspaceUrl, workspaceForUid } from './workspaceApi.js';
import { useWorkspaceCloudPlans } from './useWorkspaceCloudPlans.js';

export default function WorkspaceOverview({ uid, state, onOpenCloud }) {
  const match = workspaceForUid(state.workspaces, uid);
  const workspace = match.workspace;
  const cloud = useWorkspaceCloudPlans(uid);
  return (
    <section className="coach-workspace" aria-label="Lokaler Workspace">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-base font-semibold"><FolderOpen size={18} /> Lokal & Cloud</h3>
        <button type="button" onClick={() => { state.retry(); cloud.retry(); }} disabled={state.status === 'loading'} className="vos-btn min-h-11 text-xs"><RefreshCw size={14} /> Aktualisieren</button>
      </header>
      <h4 className="mt-5 text-sm font-semibold">Lokaler Workspace</h4>
      {state.status === 'loading' ? <p role="status" className="mt-4 text-sm text-fit-muted">Workspace wird verbunden …</p>
        : state.status !== 'ready' ? <p role="status" className="mt-4 text-sm text-fit-muted">{state.error}</p>
          : !workspace ? <p className="mt-4 text-sm text-fit-muted">{match.status === 'ambiguous' ? 'Mehrere Workspaces sind diesem Konto zugeordnet. UID-Zuordnung lokal klären.' : 'Diesem Konto ist noch kein lokaler Workspace zugeordnet.'}</p>
            : <>
              <div className="my-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
                <span className="font-medium">{workspace.name}</span>
                <span className="text-fit-muted">{workspace.taskwarriorConfigured ? 'Aufgaben eingerichtet' : 'Aufgaben nicht eingerichtet'}</span>
              </div>
              <a className="vos-btn" href={localWorkspaceUrl(workspace.id)} target="_blank" rel="noopener noreferrer">Lokal planen <ArrowUpRight size={14} /></a>
              {workspace.plans.length ? <ul className="mt-3 divide-y divide-fit-line/30">{workspace.plans.map((plan) => <li key={plan.id} className="py-3 text-sm">
                <span className="font-medium">{plan.name}</span>
                <span className="mt-1 block text-xs text-fit-muted">{localPlanState(plan).label}</span>
                <span className="mt-1 block text-xs text-fit-muted">{cloudCounterpart(plan, cloud)}</span>
              </li>)}</ul> : <p className="mt-3 text-sm text-fit-muted">Noch keine lokalen Trainingspläne.{workspace.legacyPlan ? ' Ein älterer Plan ist vorhanden.' : ''}</p>}
              <p className="mt-4 text-xs text-fit-muted">Lokaler Stand · geprüft {state.checkedAt ? new Date(state.checkedAt).toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' }) : 'gerade eben'}. Freigaben und Versand erfolgen in der lokalen Planung.</p>
            </>}
      <div className="mt-6 border-t border-fit-line/30 pt-4">
        <h4 className="text-sm font-semibold">Cloud-Pläne</h4>
        {cloud.status !== 'ready' && <p role="status" className="mt-3 text-xs text-fit-muted">{cloud.status === 'loading' ? 'Cloud-Pläne werden geprüft …' : cloud.status === 'cached' ? 'Gespeicherter Cloud-Stand · Verbindung noch nicht bestätigt' : 'Cloud-Pläne konnten nicht geladen werden. Bitte erneut aktualisieren.'}</p>}
        <ul className="mt-2 divide-y divide-fit-line/30">{cloud.plans.map((plan) => <li key={plan.id} className="py-3 text-sm">
          <button type="button" className="min-h-11 text-left font-medium underline" onClick={() => onOpenCloud(plan.id)}>{plan.name}</button>
          <p className="text-xs text-fit-muted">{plan.status === 'published' ? `Bereitgestellt · Cloud V${plan.version || '?'}` : 'Cloud-Entwurf'}{plan.source === 'coach-local-plan' ? ` · aus lokaler V${plan.sourceLocalVersion || '?'}` : ' · in der Cloud verwaltet'}</p>
        </li>)}</ul>
        {cloud.status === 'ready' && !cloud.plans.length && <p className="mt-3 text-sm text-fit-muted">Keine Cloud-Pläne vorhanden.</p>}
      </div>
    </section>
  );
}
