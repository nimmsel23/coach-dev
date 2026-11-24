import ClientMessages from './ClientMessages';
import { useClientActivity } from './useClientActivity.js';
import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, ArrowUpRight, FolderOpen, MessageSquare, Search, Users } from 'lucide-react';
import { useWorkspaceSummary } from './useWorkspaceSummary.js';
import WorkspaceOverview from './WorkspaceOverview.jsx';
import WorkspaceDirectory from './WorkspaceDirectory.jsx';
import ClientNutritionPlan from './ClientNutritionPlan.jsx';
import { workspaceForUid } from './workspaceApi.js';
import './coachDashboard.css';
import { getAllUserProfiles, updateUserProfile } from '@db';
import ClientWorkoutsFeed from './ClientWorkoutsFeed';
import ClientConsole from './ClientConsole';
import AssignPlan from './AssignPlan';
import ClientTrainingPlans from './ClientTrainingPlans';
import ClientHabitCycle from './ClientHabitCycle';
import ClientInsights from './ClientInsights';
import ClientSixPack from './ClientSixPack';
import { useCoachRoute } from './useCoachRoute.js';
import { CLIENT_ALL_TABS } from './clientSubTabs.js';

const STATUS_OPTIONS = [
  { id: 'client', label: 'Klient', hint: 'Zahlend & committed' },
  { id: 'friend', label: 'Freund/Test', hint: 'Kein aktives Coaching' },
  { id: 'hidden', label: 'Ausgeblendet', hint: 'Nicht in der Liste' },
];

export default function ClientsPanel({ unreadCounts = {} }) {
  const [profiles, setProfiles] = useState({});
  const [activityFilter, setActivityFilter] = useState('all');
  const [search, setSearch] = useState('');
  const workspaceState = useWorkspaceSummary();
  const activity = useClientActivity(Object.keys(profiles));
  const [statuses, setStatuses] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(new Set());
  const pendingStatuses = useRef(new Map());
  const mounted = useRef(false);
  const selectedClient = useRef(null);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [manageUsers, setManageUsers] = useState(false);
  const [route, navigate] = useCoachRoute();
  const selectedUid = route.client;
  selectedClient.current = selectedUid;
  const detailTab = route.detail;

  const setSelectedUid = (uid) => navigate({ sub: 'clients', client: uid, detail: 'workouts', date: '', planId: '' });
  const setDetailTab = (detail) => navigate({ sub: 'clients', detail, date: '', planId: '' });

  function applyProfiles(data) {
    setProfiles(data);
    setStatuses(Object.fromEntries(Object.keys(data).map((uid) => [
      uid, pendingStatuses.current.get(uid)?.status || data[uid]?.clientStatus || (data[uid]?.authUserOnly ? 'hidden' : 'friend'),
    ])));
  }

  useEffect(() => {
    mounted.current = true;
    load();
    const onCache = (event) => {
      const { key, data } = event.detail || {};
      if (key !== 'profiles:all' || !data) return;
      applyProfiles(data);
      setLoadError('');
      setLoading(false);
    };
    const onCacheError = (event) => {
      if (event.detail?.key === 'profiles:all') setLoadError('Klienten konnten nicht aktualisiert werden. Gespeicherter Stand wird angezeigt.');
    };
    window.addEventListener('vos-coach-cache', onCache);
    window.addEventListener('vos-coach-cache-error', onCacheError);
    return () => {
      mounted.current = false;
      window.removeEventListener('vos-coach-cache', onCache);
      window.removeEventListener('vos-coach-cache-error', onCacheError);
    };
  }, []);

  async function load() {
    setLoadError('');
    setLoading(true);
    try {
      const p = await getAllUserProfiles();
      if (mounted.current) applyProfiles(p);
    } catch (err) {
      if (mounted.current) setLoadError(err.message || 'Klienten konnten nicht geladen werden.');
    } finally {
      if (mounted.current) setLoading(false);
    }
  }

  async function setStatus(uid, status) {
    if (pendingStatuses.current.has(uid)) return;
    const previous = statuses[uid];
    pendingStatuses.current.set(uid, { status });
    setError('');
    setSaving(new Set(pendingStatuses.current.keys()));
    setStatuses((prev) => ({ ...prev, [uid]: status }));
    try {
      const saved = await updateUserProfile(uid, { clientStatus: status });
      if (!saved) throw new Error('Auswahl konnte nicht gespeichert werden.');
      if (!mounted.current) return;
      setProfiles((prev) => ({ ...prev, [uid]: { ...prev[uid], clientStatus: status } }));
      if (status === 'hidden' && selectedClient.current === uid) {
        navigate({ sub: 'clients', client: '', detail: 'workouts', date: '' });
      }
    } catch (err) {
      if (mounted.current) {
        setStatuses((prev) => ({ ...prev, [uid]: previous }));
        setError(`${profiles[uid]?.displayName || uid}: ${err.message || 'Status konnte nicht gespeichert werden.'}`);
      }
    } finally {
      pendingStatuses.current.delete(uid);
      if (mounted.current) setSaving(new Set(pendingStatuses.current.keys()));
    }
  }

  const allUids = Object.keys(profiles).sort((a, b) => {
    const nameA = profiles[a].displayName || profiles[a].email || a;
    const nameB = profiles[b].displayName || profiles[b].email || b;
    return nameA.localeCompare(nameB);
  });
  const uids = allUids.filter((uid) => (manageUsers || (statuses[uid] || 'friend') !== 'hidden')
    && (activityFilter === 'all' || activity[uid]?.status === activityFilter)
    && `${profiles[uid].displayName || ''} ${profiles[uid].email || ''}`.toLocaleLowerCase('de').includes(search.toLocaleLowerCase('de')));
  const visibleCount = allUids.filter((uid) => (statuses[uid] || 'friend') !== 'hidden').length;

  if (loading && allUids.length === 0) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="spinner" />
      </div>
    );
  }

  const clientError = loadError || error;

  if (clientError && allUids.length === 0) {
    return (
      <div role="alert" className="p-6 text-fit-red">
        {clientError}
        <button type="button" onClick={load} disabled={loading} className="ml-3 min-h-11 underline">Erneut versuchen</button>
      </div>
    );
  }

  if (allUids.length === 0) {
    return (
      <div className="coach-dashboard"><div className="card flex flex-col items-center justify-center py-16 text-center">
        <Users size={40} className="mb-3 text-fit-dim" />
        <h3 className="text-base font-semibold text-fit-ink">Keine Nutzer</h3>
        <p className="mt-1 text-xs text-fit-muted">Es haben sich noch keine Klienten registriert</p>
      </div><WorkspaceDirectory state={workspaceState} profiles={profiles} onSelect={() => {}} /></div>
    );
  }

  const selectedProfile = selectedUid ? profiles[selectedUid] : null;
  const selectedName = selectedProfile
    ? (selectedProfile.displayName || selectedProfile.email || selectedUid)
    : '';
  return (
    <div className="coach-dashboard">
      <header className="coach-dashboard-heading">
        <div>
          {selectedUid && <button type="button" onClick={() => navigate({ sub: 'clients', client: '', detail: 'workouts', date: '', planId: '' })} className="mb-3 inline-flex min-h-11 items-center gap-2 text-sm text-fit-muted hover:text-fit-ink"><ArrowLeft size={16} /> Klientenübersicht</button>}
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{selectedUid ? selectedName || 'Klient' : 'Dein Coaching im Überblick'}</h1>
          <p className="mt-2 text-sm text-fit-muted">{selectedUid ? activity[selectedUid]?.label || 'Aktivität unbekannt' : `${visibleCount} Klienten und Kontakte · Aktivität, Betreuung und lokale Workspaces`}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => navigate({ sub: 'exercises', client: '', date: '' })} className="vos-btn">Anfragen <ArrowUpRight size={14} /></button>
          <button type="button" onClick={() => navigate({ sub: 'traction', client: '', date: '' })} className="vos-btn">Nutzung <ArrowUpRight size={14} /></button>
        </div>
      </header>

      {clientError && <p role="alert" className="text-sm text-fit-red">{clientError}{loadError && <button type="button" onClick={load} disabled={loading} className="ml-3 min-h-11 underline">Erneut versuchen</button>}</p>}

      {!selectedUid ? <>
        <section aria-label="Klientenübersicht">
          <div className="coach-roster-tools">
            <label className="coach-client-search"><Search size={17} /><span className="sr-only">Klienten suchen</span><input type="search" placeholder="Klienten suchen" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
            <label className="sr-only" htmlFor="activity-filter">App-Aktivität filtern</label>
            <select id="activity-filter" value={activityFilter} onChange={(event) => setActivityFilter(event.target.value)} className="coach-select">
              <option value="all">Alle Aktivitäten</option><option value="active">Aktiv · letzte 14 Tage</option><option value="inactive">Inaktiv · ab 14 Tagen</option><option value="unknown">Aktivität unbekannt</option>
            </select>
            <button type="button" aria-pressed={manageUsers} onClick={() => setManageUsers((value) => !value)} className="vos-btn">{manageUsers ? 'Verwaltung schließen' : 'Kontakte verwalten'}</button>
          </div>
          <div className="coach-workspace-connection" role="status">
            <FolderOpen size={16} className="shrink-0" />
            <p>{workspaceState.status === 'ready' ? `${workspaceState.workspaces.length} ${workspaceState.workspaces.length === 1 ? 'lokaler Workspace' : 'lokale Workspaces'} erreichbar` : workspaceState.status === 'loading' ? 'Lokale Workspaces werden verbunden …' : workspaceState.error}</p>
            <button type="button" onClick={workspaceState.retry} disabled={workspaceState.status === 'loading'} className="min-h-11 shrink-0 text-sm underline">Erneut prüfen</button>
          </div>
          <div className="coach-client-grid">
            {uids.map((uid) => {
              const profile = profiles[uid];
              const name = profile.displayName || profile.email || uid;
              const status = statuses[uid] || 'friend';
              const unread = unreadCounts[uid] || 0;
              const workspace = workspaceState.status === 'ready' ? workspaceForUid(workspaceState.workspaces, uid) : null;
              return <article key={uid} className="coach-client-item">
                <div className="flex items-start justify-between gap-3">
                  <button type="button" onClick={() => setSelectedUid(uid)} className="min-w-0 text-left hover:text-fit-accent">
                    <span className="block truncate text-lg font-semibold">{name}</span>
                    <span className="mt-1 block text-xs text-fit-muted">{status === 'client' ? 'Klient' : status === 'hidden' ? 'Ausgeblendet' : 'Freund / Test'}</span>
                  </button>
                  <span className={`coach-activity-dot ${activity[uid]?.status}`} title={activity[uid]?.label} />
                </div>
                <p className="mt-5 text-sm text-fit-muted">{activity[uid]?.label}</p>
                <p className="mt-2 flex items-center gap-2 text-xs text-fit-muted"><FolderOpen size={14} />{!workspace ? 'Workspace noch nicht geprüft' : workspace.status === 'linked' ? `${workspace.workspace.plans.length} ${workspace.workspace.plans.length === 1 ? 'lokaler Plan' : 'lokale Pläne'}` : workspace.status === 'ambiguous' ? 'Workspace-Zuordnung unklar' : 'Kein Workspace verknüpft'}</p>
                <div className="mt-5 flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => setSelectedUid(uid)} className="vos-btn primary">Console <ArrowUpRight size={14} /></button>
                  <button type="button" onClick={() => navigate({ sub: 'clients', client: uid, detail: 'trainingplan', date: '', planId: '' })} className="vos-btn">Plan</button>
                  <button type="button" onClick={() => navigate({ sub: 'clients', client: uid, detail: 'nutrition', date: '', planId: '' })} className="vos-btn">Ernährung</button>
                  <button type="button" onClick={() => navigate({ sub: 'clients', client: uid, detail: 'messages', date: '', planId: '' })} className="vos-btn"><MessageSquare size={14} />{unread ? `${unread} neu` : 'Chat'}</button>
                </div>
                {manageUsers && <div className="mt-4 flex flex-wrap gap-1 border-t border-fit-line/30 pt-3">{STATUS_OPTIONS.map((option) => <button key={option.id} type="button" disabled={saving.has(uid)} aria-pressed={status === option.id} title={option.hint} onClick={() => setStatus(uid, option.id)} className={`min-h-11 rounded-lg px-3 text-xs ${status === option.id ? 'bg-fit-accent/10 text-fit-accent' : 'text-fit-muted'}`}>{option.label}</button>)}</div>}
              </article>;
            })}
          </div>
          {!uids.length && <p className="py-10 text-sm text-fit-muted">Keine Klienten für diese Auswahl.</p>}
        </section>
        <WorkspaceDirectory state={workspaceState} profiles={profiles} onSelect={(uid) => navigate({ sub: 'clients', client: uid, detail: 'trainingplan', date: '', planId: '' })} />
        <section className="coach-feed-section" aria-label="Letzte Kraftsessions">
          <header className="mb-5 flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold">Letzte Kraftsessions</h2><span className="text-sm text-fit-muted">Direkt zum Klienten und Feedback</span></header>
          <ClientWorkoutsFeed initialTypeFilter="workout" onSelectClient={setSelectedUid} />
        </section>
      </> : <>
        <div className="coach-client-toolbar">
          <label className="flex flex-wrap items-center gap-2 text-sm text-fit-muted">Klient wechseln
            <select aria-label="Klient wechseln" value={selectedUid} onChange={(event) => setSelectedUid(event.target.value)} className="coach-select">
              {!profiles[selectedUid] && <option value={selectedUid}>{selectedName || 'Klient'}</option>}
              {allUids.filter((uid) => uid === selectedUid || statuses[uid] !== 'hidden').map((uid) => <option key={uid} value={uid}>{profiles[uid].displayName || profiles[uid].email || uid}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-fit-muted">Betreuung
            <select aria-label="Klientenstatus" value={statuses[selectedUid] || 'friend'} disabled={saving.has(selectedUid)} onChange={(event) => setStatus(selectedUid, event.target.value)} className="coach-select">{STATUS_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select>
          </label>
        </div>
        <nav className="coach-client-nav" aria-label="Klient-Bereiche">{CLIENT_ALL_TABS.map((tab) => {
          const Icon = tab.icon;
          return <button key={tab.id} type="button" onClick={() => setDetailTab(tab.id)} aria-current={detailTab === tab.id ? 'page' : undefined} className={detailTab === tab.id ? 'active' : ''}><Icon size={16} />{tab.label}{tab.id === 'messages' && unreadCounts[selectedUid] > 0 ? ` · ${unreadCounts[selectedUid]}` : ''}</button>;
        })}</nav>
        <div className="coach-client-workbench">
          <div className="min-w-0">
            {detailTab === 'nutrition' && <ClientNutritionPlan key={selectedUid} clientUid={selectedUid} />}
            {detailTab === 'messages' && <ClientMessages key={selectedUid} clientUid={selectedUid} />}
            {detailTab === 'workouts' && <ClientConsole key={selectedUid} clientUid={selectedUid} highlightDate={route.date} onDismissHighlight={route.date ? () => navigate({ date: '' }) : undefined} />}
            {detailTab === 'sixpack' && <ClientSixPack key={selectedUid} clientUid={selectedUid} />}
            {detailTab === 'insights' && <ClientInsights key={selectedUid} clientUid={selectedUid} />}
            {detailTab === 'habits' && <ClientHabitCycle key={selectedUid} clientUid={selectedUid} />}
            {detailTab === 'templates' && <ClientTrainingPlans key={selectedUid} clientUid={selectedUid} onNavigate={setDetailTab} />}
            {detailTab === 'trainingplan' && <ClientTrainingPlans key={selectedUid} clientUid={selectedUid} initialPlanId={route.planId} onClosePlan={() => navigate({ planId: '' })} onNavigate={setDetailTab} />}
            {detailTab === 'plan' && <AssignPlan key={selectedUid} clientUid={selectedUid} clientName={selectedName} />}
          </div>
          <WorkspaceOverview uid={selectedUid} state={workspaceState} onOpenCloud={(planId) => navigate({ detail: 'trainingplan', planId, date: '' })} />
        </div>
      </>}
    </div>
  );
}
