import ClientMessages from './ClientMessages';
import { lazy, Suspense, useState, useEffect } from 'react';
import { MessageSquare, Users, Star, UserCheck, Dumbbell, Layers, RotateCw, Sparkles, Flame } from 'lucide-react';
import { getAllUserProfiles, getUserProfile, updateUserProfile } from '@db';
import ClientWorkoutsFeed from './ClientWorkoutsFeed';
import AssignPlan from './AssignPlan';
import ClientTrainingPlans from './ClientTrainingPlans';
import ClientHabitCycle from './ClientHabitCycle';
import ClientInsights from './ClientInsights';
import ClientSixPack from './ClientSixPack';
import { useCoachRoute } from './useCoachRoute.js';
const PlanDeliveryOverview = lazy(() => import('@plan/views/Plan/components/PlanDeliveryOverview.jsx'));

const STATUS_OPTIONS = [
  { id: 'client', label: 'Klient', hint: 'Zahlend & committed — volle Coach-Aufmerksamkeit', icon: Star, color: 'text-fit-accent' },
  { id: 'friend', label: 'Freund/Test', hint: 'Testet die App — kein aktives Coaching-Commitment', icon: UserCheck, color: 'text-fit-dim' },
];

const DETAIL_TABS = [
  { id: 'trainingplan', label: 'Trainingsplan', icon: Layers },
  { id: 'messages', label: 'Nachrichten', icon: MessageSquare },
  { id: 'workouts', label: 'Verlauf & Feedback', icon: Dumbbell },
  { id: 'sixpack', label: '6Pack', icon: Flame },
];
const EXTRA_TABS = [
  { id: 'insights', label: 'KI-Insights', icon: Sparkles },
  { id: 'habits', label: 'Habits', icon: RotateCw },
  { id: 'plan', label: 'Rotation (alt)', icon: Layers },
];

// Klient wählen -> alles zu diesem Klienten (Workouts + Trainingsplan) in
// einer Ansicht. Löst den früher dokumentierten "kein gemeinsamer State
// zwischen Tabs"-Punkt: vorher waren Klienten-Workouts, Trainingspläne und
// Klienten-Verwaltung drei unabhängige Tabs, jeder mit eigener
// Klientenauswahl bzw. gar keiner.
export default function ClientsPanel({ unreadCounts = {} }) {
  const [profiles, setProfiles] = useState({});
  const [statuses, setStatuses] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);
  const [error, setError] = useState('');
  const [extras, setExtras] = useState(false);
  const [route, navigate] = useCoachRoute();
  const selectedUid = route.client;
  const detailTab = route.detail;
  const setSelectedUid = (uid) => navigate({ sub: 'clients', client: uid, detail: 'trainingplan', date: '', planId: '' });
  const setDetailTab = (detail) => navigate({ sub: 'clients', detail, date: '', planId: '' });
  const openPlan = (uid, planId) => navigate({ sub: 'clients', client: uid, detail: 'trainingplan', planId, date: '' });

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const p = await getAllUserProfiles();
      setProfiles(p);
      const entries = await Promise.all(
        Object.keys(p).map(async (uid) => [uid, (await getUserProfile(uid))?.clientStatus || 'friend'])
      );
      setStatuses(Object.fromEntries(entries));
    } catch (err) { setError(err.message || "Klienten konnten nicht geladen werden."); } finally {
      setLoading(false);
    }
  }

  async function setStatus(uid, status) {
    const previous = statuses[uid];
    setError('');
    setSaving(uid);
    setStatuses(prev => ({ ...prev, [uid]: status }));
    try {
      await updateUserProfile(uid, { clientStatus: status });
    } catch (err) {
      setStatuses((prev) => ({ ...prev, [uid]: previous }));
      setError(err.message || "Status konnte nicht gespeichert werden.");
    } finally {
      setSaving(null);
    }
  }

  const uids = Object.keys(profiles).sort((a, b) => {
    const nameA = profiles[a].displayName || profiles[a].email || a;
    const nameB = profiles[b].displayName || profiles[b].email || b;
    return nameA.localeCompare(nameB);
  });

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="spinner" />
    </div>
  );

  if (error && uids.length === 0) return <div role="alert" className="p-6 text-fit-red">{error}<button onClick={load} className="ml-3 underline">Erneut versuchen</button></div>;

  if (uids.length === 0) return (
    <div className="card py-16 flex flex-col items-center justify-center text-center">
      <Users size={40} className="mb-3 text-fit-dim" />
      <h3 className="text-base font-semibold text-fit-ink">Keine Nutzer</h3>
      <p className="text-xs mt-1" style={{ color: 'var(--dim)' }}>Es haben sich noch keine Klienten registriert</p>
    </div>
  );

  const selectedProfile = selectedUid ? profiles[selectedUid] : null;
  const selectedName = selectedProfile ? (selectedProfile.displayName || selectedProfile?.email || selectedUid) : '';

  return (
    <div className="vos-panel flex-col md:flex-row h-[calc(100dvh-15rem)] lg:h-[calc(100dvh-9rem)] min-h-[480px]">
      {/* Klientenliste */}
      <div className="vos-panel-side w-full md:w-72 md:border-r border-b md:border-b-0 border-fit-line/30 flex flex-col shrink-0 max-h-56 md:max-h-none overflow-y-auto">
        <div className="vos-panel-head vos-bar px-4 py-3 sticky top-0">
          {uids.length} Klient{uids.length === 1 ? '' : 'en'}
        </div>
        <ul className="divide-y divide-fit-line/20">
          {uids.map((uid) => {
            const profile = profiles[uid];
            const name = profile.displayName || profile.email || uid;
            const status = statuses[uid] || 'friend';
            const statusOpt = STATUS_OPTIONS.find(o => o.id === status);
            const StatusIcon = statusOpt?.icon;
            const isSelected = selectedUid === uid;
            return (
              <li
                key={uid}
                className={`vos-list-row px-4 py-3 cursor-pointer flex items-start gap-2.5 ${isSelected ? 'selected' : ''}`}
                onClick={() => setSelectedUid(uid)}
              >
                <span className={`vos-led ${status} mt-1.5`} />
                <div className="min-w-0">
                  <div className={`text-sm font-semibold truncate ${isSelected ? 'text-fit-accent' : 'text-fit-ink'}`}>{name}</div>
                  {unreadCounts[uid] > 0 && <span className="text-xs font-semibold text-fit-accent" aria-label={`${unreadCounts[uid] >= 100 ? '99+' : unreadCounts[uid]} ungelesene Nachrichten`}>{unreadCounts[uid] >= 100 ? '99+' : unreadCounts[uid]} neu</span>}
                  {statusOpt && (
                    <div className="flex items-center gap-1.5 mt-1">
                      <StatusIcon size={11} className={statusOpt.color} />
                      <span className="text-xs" style={{ color: 'var(--dim)', opacity: 0.6 }}>{statusOpt.label}</span>
                    </div>
                  )}
                  <Suspense fallback={<p className="text-xs text-fit-muted">Planstatus lädt…</p>}><PlanDeliveryOverview clientUid={uid} compact onOpen={(planId) => openPlan(uid, planId)} /></Suspense>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Klienten-Detail */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {!selectedUid ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center space-y-3 p-8" style={{ opacity: 0.5 }}>
            <Users className="w-10 h-10 text-fit-dim" />
            <h3 className="text-base font-semibold text-fit-dim">Klient wählen</h3>
            <p className="text-xs max-w-sm leading-relaxed">
              Wähle links einen Klienten, um Workouts, Feedback und Trainingsplan an einem Ort zu sehen.
            </p>
          </div>
        ) : (
          <>
            <div className="p-4 border-b border-fit-line/30 flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-3.5 min-w-0">
                <span className="vos-avatar">{selectedName.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase()}</span>
                <div className="min-w-0">
                  <h3 className="text-base font-semibold text-fit-ink truncate">{selectedName}</h3>
                  {selectedProfile?.email && selectedProfile?.email !== selectedName && (
                    <p className="text-xs truncate" style={{ color: 'var(--dim)', opacity: 0.6 }}>{selectedProfile?.email}</p>
                  )}
                </div>
              </div>
              <div className="flex gap-1 p-1 bg-fit-bg2 rounded-full border border-fit-line/40 shrink-0">
                {STATUS_OPTIONS.map(opt => {
                  const Icon = opt.icon;
                  const active = (statuses[selectedUid] || 'friend') === opt.id;
                  return (
                    <button
                      key={opt.id}
                      title={opt.hint}
                      disabled={saving === selectedUid}
                      onClick={() => setStatus(selectedUid, opt.id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all disabled:opacity-50 ${active ? 'bg-fit-accent text-fit-bg' : 'text-fit-dim hover:text-fit-ink'}`}
                    >
                      <Icon size={12} className={active ? '' : opt.color} />
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="vos-tabstrip px-4 py-2.5 border-b border-fit-line/30 shrink-0">
              {[...DETAIL_TABS, ...(extras || EXTRA_TABS.some((t) => t.id === detailTab) ? EXTRA_TABS : [])].map(tab => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setDetailTab(tab.id)}
                    className={`vos-chip ${detailTab === tab.id ? 'active' : ''}`}
                  >
                    <Icon size={13} /> {tab.label}
                  </button>
                );
              })}
            </div>

            <div className="px-4 pt-2"><button onClick={() => setExtras(!extras)} className="text-xs text-fit-muted">{extras ? 'Weniger Bereiche' : 'Weitere Bereiche'}</button></div>
            {error && <p role="alert" className="px-4 pt-2 text-sm text-fit-red">{error}</p>}
            <div className="flex-1 overflow-y-auto p-4">
              {detailTab === 'messages' && <ClientMessages key={selectedUid} clientUid={selectedUid} />}
              {detailTab === 'workouts' && <ClientWorkoutsFeed clientUid={selectedUid} />}
              {detailTab === 'sixpack' && <ClientSixPack key={selectedUid} clientUid={selectedUid} />}
              {detailTab === 'insights' && <ClientInsights clientUid={selectedUid} />}
              {detailTab === 'habits' && <ClientHabitCycle clientUid={selectedUid} />}
              {detailTab === 'templates' && <ClientTrainingPlans key={selectedUid} clientUid={selectedUid} onNavigate={setDetailTab} />}
              {detailTab === 'trainingplan' && <ClientTrainingPlans key={selectedUid} clientUid={selectedUid} initialPlanId={route.planId} onClosePlan={() => navigate({ planId: '' })} onNavigate={setDetailTab} />}
              {detailTab === 'plan' && <AssignPlan clientUid={selectedUid} clientName={selectedName} />}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
