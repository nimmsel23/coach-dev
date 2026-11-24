import { useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { localPlanState, localWorkspaceUrl, workspaceForUid } from './workspaceApi.js';

export default function WorkspaceDirectory({ state, profiles, onSelect }) {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const pending = (workspace) => workspace.plans.some((plan) => localPlanState(plan).id === 'pending');
  const unlinked = (workspace) => !workspace.uids.length;
  const workspaces = state.workspaces.filter((workspace) => workspace.name.toLocaleLowerCase('de').includes(search.toLocaleLowerCase('de'))
    && (filter === 'all' || (filter === 'pending' ? pending(workspace) : unlinked(workspace))));
  return <section className="coach-feed-section" aria-label="Lokale Workspaces">
    <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-xl font-semibold">Lokale Workspaces</h2><p className="mt-2 text-sm text-fit-muted">Planung auf dem Laptop · auch ohne Cloud-Konto</p></div>
      <button type="button" className="vos-btn" onClick={state.retry} disabled={state.status === 'loading'}>Workspaces aktualisieren</button>
    </header>
    {state.status !== 'ready' ? <p role="status" className="text-sm text-fit-muted">{state.status === 'loading' ? 'Workspaces werden geladen …' : state.error}</p> : <>
      <div className="coach-roster-tools mb-4">
        <label className="coach-client-search"><span className="sr-only">Workspaces suchen</span><input type="search" placeholder="Workspaces suchen" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
        <select aria-label="Workspaces filtern" className="coach-select" value={filter} onChange={(event) => setFilter(event.target.value)}>
          <option value="all">Alle Workspaces ({state.workspaces.length})</option>
          <option value="pending">Übergabe offen ({state.workspaces.filter(pending).length})</option>
          <option value="unlinked">Ohne Cloud-UID ({state.workspaces.filter(unlinked).length})</option>
        </select>
      </div>
      <ul className="coach-workspace-list">{workspaces.map((workspace) => {
        const uids = workspace.uids.filter((uid) => profiles[uid] && workspaceForUid(state.workspaces, uid).status === 'linked');
        return <li key={workspace.id}>
          <div className="min-w-0"><h3 className="font-semibold">{workspace.name}</h3>
            <p className="mt-1 text-xs text-fit-muted">{workspace.uids.length ? `${workspace.uids.length} Cloud-UID zugeordnet` : 'Lokale Betreuung · keine Cloud-UID'}</p>
            <ul className="mt-3 space-y-2 text-sm">{workspace.plans.map((plan) => <li key={plan.id}>{plan.name}<span className="block text-xs text-fit-muted">{localPlanState(plan).label}</span></li>)}</ul>
            {!workspace.plans.length && <p className="mt-3 text-sm text-fit-muted">{workspace.legacyPlan ? 'Älterer Plan vorhanden · lokale Planung öffnen' : 'Noch keine lokalen Pläne'}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <a className="vos-btn" href={localWorkspaceUrl(workspace.id)} target="_blank" rel="noopener noreferrer">Lokal planen <ArrowUpRight size={14} /></a>
            {uids.map((uid) => <button key={uid} className="vos-btn" onClick={() => onSelect(uid)} type="button">Cloud-Pläne{uids.length > 1 ? ` · ${profiles[uid].displayName || uid}` : ''}</button>)}
          </div>
        </li>;
      })}</ul>
      {!workspaces.length && <p className="py-6 text-sm text-fit-muted">Keine Workspaces für diese Auswahl.</p>}
      <p className="mt-4 text-xs text-fit-muted">Ein Versandvermerk bestätigt keine Übereinstimmung. Cloud-Planstände werden beim Öffnen des Klienten geprüft.</p>
    </>}
  </section>;
}
