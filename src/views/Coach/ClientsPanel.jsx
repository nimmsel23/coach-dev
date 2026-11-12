import ClientMessages from './ClientMessages';
import { useState, useEffect } from 'react';
import { Users } from 'lucide-react';
import { getAllUserProfiles, updateUserProfile } from '@db';
import ClientWorkoutsFeed from './ClientWorkoutsFeed';
import ClientConsole from './ClientConsole';
import AssignPlan from './AssignPlan';
import ClientTrainingPlans from './ClientTrainingPlans';
import ClientHabitCycle from './ClientHabitCycle';
import ClientInsights from './ClientInsights';
import ClientSixPack from './ClientSixPack';
import { useCoachRoute } from './useCoachRoute.js';
import { CLIENT_MORE_IDS, CLIENT_MORE_TABS, CLIENT_PRIMARY_TABS } from './clientSubTabs.js';

const STATUS_OPTIONS = [
  { id: 'client', label: 'Klient', hint: 'Zahlend & committed' },
  { id: 'friend', label: 'Freund/Test', hint: 'Kein aktives Coaching' },
  { id: 'hidden', label: 'Ausgeblendet', hint: 'Nicht in der Liste' },
];

export default function ClientsPanel({ unreadCounts = {} }) {
  const [profiles, setProfiles] = useState({});
  const [statuses, setStatuses] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);
  const [error, setError] = useState('');
  const [manageUsers, setManageUsers] = useState(false);
  const [route, navigate] = useCoachRoute();
  const selectedUid = route.client;
  const detailTab = route.detail;

  const setSelectedUid = (uid) => navigate({ sub: 'clients', client: uid, detail: 'workouts', date: '', planId: '' });
  const setDetailTab = (detail) => navigate({ sub: 'clients', detail, date: '', planId: '' });

  useEffect(() => {
    load();
    const onCache = (event) => {
      const { key, data } = event.detail || {};
      if (key !== 'profiles:all' || !data) return;
      setProfiles(data);
      const entries = Object.keys(data).map((uid) => [
        uid,
        data[uid]?.clientStatus || (data[uid]?.authUserOnly ? 'hidden' : 'friend'),
      ]);
      setStatuses(Object.fromEntries(entries));
      setLoading(false);
    };
    window.addEventListener('vos-coach-cache', onCache);
    return () => window.removeEventListener('vos-coach-cache', onCache);
  }, []);

  async function load() {
    setLoading(true);
    try {
      const p = await getAllUserProfiles();
      setProfiles(p);
      const entries = Object.keys(p).map((uid) => [
        uid,
        p[uid]?.clientStatus || (p[uid]?.authUserOnly ? 'hidden' : 'friend'),
      ]);
      setStatuses(Object.fromEntries(entries));
    } catch (err) {
      setError(err.message || 'Klienten konnten nicht geladen werden.');
    } finally {
      setLoading(false);
    }
  }

  async function setStatus(uid, status) {
    const previous = statuses[uid];
    setError('');
    setSaving(uid);
    setStatuses((prev) => ({ ...prev, [uid]: status }));
    try {
      const saved = await updateUserProfile(uid, { clientStatus: status });
      if (!saved) throw new Error('Auswahl konnte nicht gespeichert werden.');
      if (status === 'hidden' && selectedUid === uid) {
        navigate({ sub: 'clients', client: '', detail: 'workouts', date: '' });
      }
    } catch (err) {
      setStatuses((prev) => ({ ...prev, [uid]: previous }));
      setError(err.message || 'Status konnte nicht gespeichert werden.');
    } finally {
      setSaving(null);
    }
  }

  const allUids = Object.keys(profiles).sort((a, b) => {
    const nameA = profiles[a].displayName || profiles[a].email || a;
    const nameB = profiles[b].displayName || profiles[b].email || b;
    return nameA.localeCompare(nameB);
  });
  const uids = allUids.filter((uid) => manageUsers || (statuses[uid] || 'friend') !== 'hidden');
  const visibleCount = allUids.filter((uid) => (statuses[uid] || 'friend') !== 'hidden').length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="spinner" />
      </div>
    );
  }

  if (error && allUids.length === 0) {
    return (
      <div role="alert" className="p-6 text-fit-red">
        {error}
        <button type="button" onClick={load} className="ml-3 underline">Erneut versuchen</button>
      </div>
    );
  }

  if (allUids.length === 0) {
    return (
      <div className="card flex flex-col items-center justify-center py-16 text-center">
        <Users size={40} className="mb-3 text-fit-dim" />
        <h3 className="text-base font-semibold text-fit-ink">Keine Nutzer</h3>
        <p className="mt-1 text-xs text-fit-muted">Es haben sich noch keine Klienten registriert</p>
      </div>
    );
  }

  const selectedProfile = selectedUid ? profiles[selectedUid] : null;
  const selectedName = selectedProfile
    ? (selectedProfile.displayName || selectedProfile.email || selectedUid)
    : '';
  const moreActive = CLIENT_MORE_IDS.has(detailTab);

  return (
    <div className="vos-panel h-[calc(100dvh-15rem)] min-h-[480px] flex-col md:flex-row lg:h-[calc(100dvh-9rem)]">
      <aside className="vos-panel-side flex max-h-56 w-full shrink-0 flex-col overflow-y-auto border-b border-fit-line/30 md:max-h-none md:w-64 md:border-b-0 md:border-r">
        <div className="vos-panel-head vos-bar sticky top-0 flex items-center justify-between gap-2 px-3 py-2.5">
          <span className="text-xs text-fit-muted">{visibleCount} Klienten</span>
          <button
            type="button"
            aria-pressed={manageUsers}
            onClick={() => setManageUsers((value) => !value)}
            className="text-xs text-fit-accent underline"
          >
            {manageUsers ? 'Fertig' : 'Verwalten'}
          </button>
        </div>
        {uids.length === 0 && (
          <p className="px-3 py-4 text-sm text-fit-muted">Alle ausgeblendet — „Verwalten“ öffnen.</p>
        )}
        <ul className="divide-y divide-fit-line/20">
          {uids.map((uid) => {
            const profile = profiles[uid];
            const name = profile.displayName || profile.email || uid;
            const status = statuses[uid] || 'friend';
            const isSelected = selectedUid === uid;
            const unread = unreadCounts[uid] || 0;
            return (
              <li key={uid}>
                <button
                  type="button"
                  onClick={() => setSelectedUid(uid)}
                  className={`vos-list-row flex w-full items-center gap-2.5 px-3 py-2.5 text-left ${isSelected ? 'selected' : ''}`}
                >
                  <span className={`vos-led ${status} shrink-0`} />
                  <span className={`min-w-0 flex-1 truncate text-sm font-semibold ${isSelected ? 'text-fit-accent' : 'text-fit-ink'}`}>
                    {name}
                  </span>
                  {unread > 0 && (
                    <span className="shrink-0 text-xs font-semibold text-fit-accent">
                      {unread >= 100 ? '99+' : unread}
                    </span>
                  )}
                </button>
                {manageUsers && (
                  <div className="flex flex-wrap gap-1 px-3 pb-2" onClick={(event) => event.stopPropagation()}>
                    {STATUS_OPTIONS.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        disabled={saving === uid}
                        aria-pressed={status === option.id}
                        title={option.hint}
                        onClick={() => setStatus(uid, option.id)}
                        className={`rounded-full border px-2 py-0.5 text-[10px] disabled:opacity-50 ${
                          status === option.id
                            ? 'border-fit-accent bg-fit-accent/10 text-fit-accent'
                            : 'border-fit-line/40 text-fit-muted'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {!selectedUid ? (
          <>
            <header className="flex shrink-0 items-center justify-between gap-2 border-b border-fit-line/30 px-3 py-2.5">
              <h3 className="text-base font-semibold text-fit-ink">Letzte Kraftsessions</h3>
              <span className="text-xs text-fit-muted">Klient links wählen für Plan & Chat</span>
            </header>
            {error && <p role="alert" className="px-3 pt-2 text-sm text-fit-red">{error}</p>}
            <div className="flex-1 overflow-y-auto p-3">
              <ClientWorkoutsFeed
                initialTypeFilter="workout"
                onSelectClient={setSelectedUid}
              />
            </div>
          </>
        ) : (
          <>
            <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-fit-line/30 px-3 py-2.5">
              <div className="flex min-w-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => navigate({ sub: 'clients', client: '', detail: 'workouts', date: '', planId: '' })}
                  className="shrink-0 text-xs text-fit-muted underline"
                >
                  Alle
                </button>
                <h3 className="truncate text-base font-semibold text-fit-ink">{selectedName}</h3>
              </div>
              <label className="sr-only" htmlFor="client-status">Status</label>
              <select
                id="client-status"
                value={statuses[selectedUid] || 'friend'}
                disabled={saving === selectedUid}
                onChange={(event) => setStatus(selectedUid, event.target.value)}
                className="rounded-full border border-fit-line/40 bg-fit-bg2 px-2.5 py-1 text-xs text-fit-ink disabled:opacity-50"
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>{opt.label}</option>
                ))}
              </select>
            </header>

            {/* Desktop: SubTabs leben in der Coach-Sidebar. Mobile behält die Chips. */}
            <nav className="flex shrink-0 flex-wrap items-center gap-1 border-b border-fit-line/30 px-3 py-2 lg:hidden" aria-label="Klient-Bereiche">
              {CLIENT_PRIMARY_TABS.map((tab) => {
                const Icon = tab.icon;
                const active = detailTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setDetailTab(tab.id)}
                    className={`vos-chip ${active ? 'active' : ''}`}
                  >
                    <Icon size={13} /> {tab.label}
                  </button>
                );
              })}
              <label className="sr-only" htmlFor="client-more">Weitere Bereiche</label>
              <select
                id="client-more"
                value={moreActive ? detailTab : ''}
                onChange={(event) => {
                  if (event.target.value) setDetailTab(event.target.value);
                }}
                className={`ml-auto rounded-full border px-2.5 py-1 text-xs ${
                  moreActive
                    ? 'border-fit-accent bg-fit-accent/10 text-fit-accent'
                    : 'border-fit-line/40 bg-fit-bg2 text-fit-muted'
                }`}
              >
                <option value="">Mehr…</option>
                {CLIENT_MORE_TABS.map((tab) => (
                  <option key={tab.id} value={tab.id}>{tab.label}</option>
                ))}
              </select>
            </nav>

            {error && <p role="alert" className="px-3 pt-2 text-sm text-fit-red">{error}</p>}

            <div className="flex-1 overflow-y-auto p-3">
              {detailTab === 'messages' && <ClientMessages key={selectedUid} clientUid={selectedUid} />}
              {detailTab === 'workouts' && (
                <ClientConsole
                  key={selectedUid}
                  clientUid={selectedUid}
                  highlightDate={route.date}
                  onDismissHighlight={route.date ? () => navigate({ date: '' }) : undefined}
                />
              )}
              {detailTab === 'sixpack' && <ClientSixPack key={selectedUid} clientUid={selectedUid} />}
              {detailTab === 'insights' && <ClientInsights key={selectedUid} clientUid={selectedUid} />}
              {detailTab === 'habits' && <ClientHabitCycle key={selectedUid} clientUid={selectedUid} />}
              {detailTab === 'templates' && (
                <ClientTrainingPlans key={selectedUid} clientUid={selectedUid} onNavigate={setDetailTab} />
              )}
              {detailTab === 'trainingplan' && (
                <ClientTrainingPlans
                  key={selectedUid}
                  clientUid={selectedUid}
                  initialPlanId={route.planId}
                  onClosePlan={() => navigate({ planId: '' })}
                  onNavigate={setDetailTab}
                />
              )}
              {detailTab === 'plan' && <AssignPlan clientUid={selectedUid} clientName={selectedName} />}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
