import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, CheckCircle2, ClipboardList, Download, FolderOpen, Plus, RefreshCw, Send, Users } from 'lucide-react';
import PlanDocument from '@plan/views/Plan/PlanDocument.jsx';
import PlanEditor from '@plan/views/Plan/PlanEditor.jsx';
import { filterCatalog, mergeCatalog } from '@plan/views/Plan/lib/catalog.js';
import { planReleaseIssues } from '@plan/views/Plan/lib/planReadiness.js';
import { importClientForge } from '@plan/views/Plan/lib/legacyPlan.js';

const base = new URL('../api/', window.location.href);
const path = (suffix) => new URL(suffix, base).href;
const catalog = mergeCatalog([]);
const searchCatalog = async (q) => ({ results: filterCatalog(catalog, { q }).slice(0, 80) });
const entry = new URLSearchParams(window.location.search);
const embedded = entry.get('embed') === '1';
const input = 'min-h-[48px] w-full rounded-xl border border-fit-line bg-fit-bg p-3 text-base';
const button = 'min-h-[44px] rounded-xl border border-fit-line px-4 py-2 text-sm font-semibold disabled:opacity-40';
async function api(suffix, method = 'GET', body) {
  const url = new URL(path(suffix));
  if (method === 'GET') url.searchParams.set('_read', crypto.randomUUID());
  const response = await fetch(url, { method, cache: 'no-store', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const value = await response.json();
  if (!response.ok) { const error = new Error(value.detail || `Anfrage fehlgeschlagen (${response.status})`); error.status = response.status; throw error; }
  return value;
}
const fmt = (date) => date ? new Date(date).toLocaleString('de-AT', { dateStyle: 'short', timeStyle: 'short' }) : '';
const todayISO = () => { const now = new Date(); return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };

export default function LocalCoachApp() {
  const [clients, setClients] = useState([]);
  const [clientId, setClientId] = useState(() => entry.get('client') || '');
  const [workspaceTab, setWorkspaceTab] = useState('plans');
  const [query, setQuery] = useState('');
  const [plans, setPlans] = useState([]);
  const [clientSummaries, setClientSummaries] = useState([]);
  const [summariesLoading, setSummariesLoading] = useState(false);
  const [viewing, setViewing] = useState(null);
  const [editing, setEditing] = useState(null);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [history, setHistory] = useState(null);
  const [releasing, setReleasing] = useState(null);
  const [message, setMessage] = useState('');
  const [coachNotes, setCoachNotes] = useState([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [noteDate, setNoteDate] = useState(todayISO);
  const [noteDraft, setNoteDraft] = useState('');
  const [noteDirty, setNoteDirty] = useState(false);
  const [noteEditingDate, setNoteEditingDate] = useState('');
  const [taskwarriorTasks, setTaskwarriorTasks] = useState([]);
  const [taskwarriorLoading, setTaskwarriorLoading] = useState(false);
  const [taskwarriorPlanId, setTaskwarriorPlanId] = useState('');
  const [taskwarriorReport, setTaskwarriorReport] = useState(null);
  const sequence = useRef(0);
  const summarySequence = useRef(0);
  const notesSequence = useRef(0);
  const taskwarriorSequence = useRef(0);
  const client = clients.find((item) => item.id === clientId);
  const clientPath = `client/${encodeURIComponent(clientId)}`;
  const planPath = (id) => `${clientPath}/plans/${encodeURIComponent(id)}`;
  const trackablePlans = plans.filter((plan) => plan.routines?.some((routine) => routine.weekdays?.length));

  async function loadClients() {
    setLoading(true); setError('');
    try {
      const data = await api('clients');
      const list = [...data.clients].sort((a, b) => a.name.localeCompare(b.name, 'de'));
      setClients(list);
      const request = ++summarySequence.current;
      setSummariesLoading(true);
      const summaries = await Promise.all(list.map(async (item) => {
        const client = `client/${encodeURIComponent(item.id)}`;
        const [plansResult, workoutsResult] = await Promise.allSettled([
          api(`${client}/plans`),
          api(`${client}/workout/logs?days=28`),
        ]);
        const workouts = workoutsResult.status === 'fulfilled' && Array.isArray(workoutsResult.value.workouts)
          ? workoutsResult.value.workouts
          : [];
        const lastWorkoutAt = workouts.map((workout) => workout.finished_at || workout.date || workout.id).filter(Boolean).sort().at(-1) || '';
        return {
          id: item.id,
          plansCount: plansResult.status === 'fulfilled' ? plansResult.value.plans.length : null,
          workoutsCount: workoutsResult.status === 'fulfilled' && workoutsResult.value.available !== false ? workouts.length : null,
          lastWorkoutAt,
        };
      }));
      if (request === summarySequence.current) setClientSummaries(summaries);
    }
    catch (err) { setError(err.message); }
    finally { setLoading(false); setSummariesLoading(false); }
  }
  useEffect(() => { loadClients(); }, []);
  useEffect(() => {
    const mine = ++sequence.current;
    setPlans([]); setViewing(null); setHistory(null); setReleasing(null); setCreating(false); setError(''); setNotice('');
    setCoachNotes([]); setNoteDate(todayISO()); setNoteDraft(''); setNoteDirty(false); setNoteEditingDate('');
    setTaskwarriorTasks([]); setTaskwarriorPlanId(''); setTaskwarriorReport(null);
    if (!clientId) return;
    setLoading(true);
    api(`${clientPath}/plans`).then((data) => { if (mine === sequence.current) setPlans(data.plans); }).catch((err) => { if (mine === sequence.current) setError(err.message); }).finally(() => { if (mine === sequence.current) setLoading(false); });
  }, [clientId]);
  useEffect(() => {
    if (!clientId || workspaceTab !== 'notes') return undefined;
    const request = ++notesSequence.current;
    setNotesLoading(true);
    api(`${clientPath}/coaching-notes?limit=50`)
      .then((data) => { if (request === notesSequence.current) setCoachNotes(Array.isArray(data.notes) ? data.notes : []); })
      .catch((err) => { if (request === notesSequence.current) setError(err.message); })
      .finally(() => { if (request === notesSequence.current) setNotesLoading(false); });
    return () => { notesSequence.current += 1; };
  }, [clientId, workspaceTab]);
  useEffect(() => {
    if (!clientId || workspaceTab !== 'taskwarrior') return undefined;
    const request = ++taskwarriorSequence.current;
    setTaskwarriorLoading(true);
    api(`${clientPath}/taskwarrior`)
      .then((data) => { if (request === taskwarriorSequence.current) setTaskwarriorTasks(Array.isArray(data.tasks) ? data.tasks : []); })
      .catch((err) => { if (request === taskwarriorSequence.current) setError(err.message); })
      .finally(() => { if (request === taskwarriorSequence.current) setTaskwarriorLoading(false); });
    return () => { taskwarriorSequence.current += 1; };
  }, [clientId, workspaceTab]);
  async function reload() { setPlans((await api(`${clientPath}/plans`)).plans); }
  async function act(fn) {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try { await fn(); } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  async function syncTaskwarrior() {
    const plan = trackablePlans.find((item) => item.id === taskwarriorPlanId);
    if (!plan) throw new Error('Wähle einen lokalen Plan mit festgelegten Trainingstagen.');
    const scheduledCount = plan.routines.reduce((total, routine) => total + (routine.weekdays?.length || 0) * (Number(plan.totalWeeks) || 10), 0);
    if (!confirm(`${scheduledCount} geplante Trainingstermine aus „${plan.name}“ in ${client.name}s lokaler Taskwarrior-Datenbank eintragen? Es werden keine Daten an Firebase gesendet.`)) return;
    await act(async () => {
      const result = await api(`${clientPath}/taskwarrior/sync`, 'POST', { planId: plan.id });
      setTaskwarriorReport(result.report);
      const data = await api(`${clientPath}/taskwarrior`);
      setTaskwarriorTasks(Array.isArray(data.tasks) ? data.tasks : []);
      setNotice('Trainingsvorkommen wurden in der lokalen Taskwarrior-Datenbank abgeglichen.');
    });
  }
  async function completeTaskwarriorTask(occurrenceKey) {
    await act(async () => {
      await api(`${clientPath}/taskwarrior/complete`, 'POST', { occurrenceKey });
      const data = await api(`${clientPath}/taskwarrior`);
      setTaskwarriorTasks(Array.isArray(data.tasks) ? data.tasks : []);
      setNotice('Workout in der lokalen Taskwarrior-Datenbank abgehakt.');
    });
  }
  async function create(body) {
    const plan = await api(`${clientPath}/plans`, 'POST', body);
    setCreating(false); setName(''); setEditing(plan); await reload();
  }
  async function release(plan) {
    const fresh = await api(planPath(plan.id));
    if (fresh.updatedAt !== plan.updatedAt) {
      await reload();
      throw new Error('Ein neuerer Planstand wurde geladen. Bitte prüfe ihn und gib die Version erneut frei.');
    }
    const issues = planReleaseIssues(fresh);
    if (issues.length) throw new Error(issues.join(' '));
    try { await api(`${planPath(plan.id)}/versions`, 'POST', { expectedUpdatedAt: fresh.updatedAt, message }); }
    catch (err) { if (err.status === 409) await reload(); throw err; }
    setReleasing(null); await reload(); setNotice('Version lokal freigegeben. Du kannst sie jetzt übergeben.');
  }
  function returnToPlans() { setEditing(null); act(reload); }
  function selectClient(id, tab = 'plans') {
    if (noteDirty && !confirm('Die ungespeicherte Betreuungsnotiz verwerfen?')) return false;
    setNoteDirty(false); setWorkspaceTab(tab); setClientId(id);
    return true;
  }
  function editNote(note) {
    if (noteDirty && !confirm('Die ungespeicherte Änderung verwerfen und diese Notiz laden?')) return;
    setNoteDate(note.date); setNoteDraft(note.note || ''); setNoteEditingDate(note.date); setNoteDirty(false);
  }
  async function saveNote() {
    const existing = coachNotes.find((note) => note.date === noteDate);
    if (existing && noteEditingDate !== noteDate && !confirm(`Für ${new Date(`${noteDate}T12:00:00`).toLocaleDateString('de-AT')} existiert bereits eine Betreuungsnotiz. Diesen Tageseintrag ersetzen?`)) return;
    await act(async () => {
      await api(`${clientPath}/coaching-note`, 'POST', { date: noteDate, note: noteDraft.trim() });
      const data = await api(`${clientPath}/coaching-notes?limit=50`);
      setCoachNotes(Array.isArray(data.notes) ? data.notes : []);
      setNoteEditingDate(noteDate); setNoteDirty(false);
      setNotice('Betreuungsnotiz lokal gesichert.');
    });
  }
  const filtered = clients.filter((item) => item.name.toLowerCase().includes(query.toLowerCase()));

  return <div className="min-h-screen bg-fit-bg text-fit-ink">
    {!embedded && <header className="border-b border-fit-line px-4 py-5 sm:px-8"><div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4"><div><a href="./" className="text-xs font-semibold uppercase tracking-widest text-fit-accent">VitalOS · Coach</a><h1 className="mt-1 text-2xl font-bold tracking-tight">Coach-Konsole</h1><p className="mt-2 text-sm text-fit-muted">Klienten öffnen, Trainingspläne bearbeiten und freigegebene Versionen übergeben.</p></div><span className="flex items-center gap-2 rounded-full border border-fit-line px-3 py-2 text-xs text-fit-muted"><CheckCircle2 size={15} className="text-fit-accent" /> Lokale Klientendaten</span></div></header>}
    <div className={`mx-auto grid max-w-7xl gap-6 p-4 pb-20 sm:p-8 ${embedded ? '' : 'lg:grid-cols-[260px_minmax(0,1fr)]'}`}>
      {!embedded && <aside className="min-w-0"><div className="mb-3 flex items-center justify-between"><h2 className="flex items-center gap-2 font-semibold"><Users size={17} /> Klienten</h2><button disabled={busy || !!editing || loading || summariesLoading} aria-label="Klienten aktualisieren" onClick={loadClients} className="min-h-[44px] p-3"><RefreshCw size={16} /></button></div><input aria-label="Klienten suchen" placeholder="Klienten suchen…" value={query} onChange={(e) => setQuery(e.target.value)} className={input} /><div className="mt-3 max-h-64 space-y-2 overflow-y-auto lg:max-h-[65vh]">{filtered.map((item) => <button key={item.id} disabled={busy || !!editing} aria-pressed={clientId === item.id} onClick={() => selectClient(item.id)} className={`min-h-[64px] w-full rounded-xl border p-3 text-left disabled:opacity-50 ${clientId === item.id ? 'border-fit-accent bg-fit-accent/10' : 'border-fit-line bg-fit-card'}`}><span className="block font-semibold">{item.name}</span><span className="mt-1 block text-xs text-fit-muted">{item.canDeliver ? 'App-Zuordnung vorhanden' : 'Lokale Planarbeit möglich'}</span></button>)}</div>{!loading && !filtered.length && <p className="mt-4 text-sm text-fit-muted">{clients.length ? 'Kein Treffer.' : 'Noch keine Klienten in der bestehenden Klientenverwaltung.'}</p>}</aside>}
      <main className="min-w-0 space-y-5">
        {error && <div role="alert" className="rounded-xl border border-fit-red/40 bg-fit-card p-4 text-sm text-fit-red">{error}<button className="ml-3 underline" disabled={busy || !!editing} onClick={() => clientId ? act(reload) : loadClients()}>Erneut versuchen</button></div>}
        {notice && <p role="status" className="rounded-xl border border-fit-accent/30 bg-fit-accent/10 p-4 text-sm">{notice}</p>}
        {!client && <section className="space-y-5">
          <header className="rounded-2xl border border-fit-line bg-fit-card p-6 sm:p-8"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm text-fit-muted">Deine lokale Übersicht</p><h2 className="mt-1 text-2xl font-semibold">Klientenarbeitsplatz</h2><p className="mt-2 max-w-xl text-sm leading-relaxed text-fit-muted">Öffne die Trainingsplanung oder springe direkt in die bestehende Klientenakte. Die Aktivität bezieht sich auf die letzten 28 Tage.</p></div><button className={button} disabled={loading || summariesLoading} onClick={loadClients}><RefreshCw size={15} className="mr-2 inline" /> Übersicht aktualisieren</button></div>
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-fit-line p-4"><p className="text-xs text-fit-muted">Klienten</p><p className="mt-1 text-2xl font-semibold">{clients.length}</p></div>
              <div className="rounded-xl border border-fit-line p-4"><p className="text-xs text-fit-muted">App-Zuordnung</p><p className="mt-1 text-2xl font-semibold">{clients.filter((item) => item.canDeliver).length}</p></div>
              <div className="rounded-xl border border-fit-line p-4"><p className="text-xs text-fit-muted">Trainingseinträge · 28 Tage</p><p className="mt-1 text-2xl font-semibold">{clientSummaries.reduce((total, item) => total + (item.workoutsCount || 0), 0)}</p></div>
              <div className="rounded-xl border border-fit-line p-4"><p className="text-xs text-fit-muted">Ohne Eintrag · 28 Tage</p><p className="mt-1 text-2xl font-semibold">{clientSummaries.filter((item) => item.workoutsCount === 0).length}</p></div>
            </div>
          </header>
          {loading && <p role="status" className="text-sm text-fit-muted">Klienten werden geladen…</p>}
          {!loading && !clients.length && <div className="rounded-2xl border border-dashed border-fit-line p-8 text-sm text-fit-muted">Die bestehende Klientenverwaltung enthält noch keine Klienten.</div>}
          <div className="grid gap-3 xl:grid-cols-2">{clients.map((item) => {
            const summary = clientSummaries.find((candidate) => candidate.id === item.id);
            return <article key={item.id} className="rounded-2xl border border-fit-line bg-fit-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-lg font-semibold">{item.name}</h3><p className="mt-1 text-xs text-fit-muted">{item.status || 'Aktiver Klient'} · {item.canDeliver ? 'App zugeordnet' : 'Lokale Betreuung'}</p></div><a className={button} href={`/${encodeURIComponent(item.id)}/`}>Klientenakte öffnen</a></div>
              <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm"><span className="text-fit-muted">Pläne: <strong className="text-fit-ink">{summariesLoading ? '…' : summary?.plansCount ?? '—'}</strong></span><span className="text-fit-muted">Trainingseinträge: <strong className="text-fit-ink">{summariesLoading ? '…' : summary?.workoutsCount ?? '—'}</strong></span><span className="text-fit-muted">Zuletzt: <strong className="text-fit-ink">{summary?.lastWorkoutAt ? new Date(summary.lastWorkoutAt).toLocaleDateString('de-AT') : summary?.workoutsCount === 0 ? 'kein Eintrag in 28 Tagen' : '—'}</strong></span></div>
              <div className="mt-4 flex flex-wrap gap-2"><button className={`${button} bg-fit-accent text-fit-bg`} onClick={() => selectClient(item.id)}>Trainingsplanung öffnen</button><button className={button} onClick={() => selectClient(item.id, 'notes')}>Betreuungsnotizen</button></div>
            </article>;
          })}</div>
        </section>}
        {client && <><header className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-widest text-fit-accent">Vital Coach · {workspaceTab === 'plans' ? 'Trainingsplanung' : workspaceTab === 'notes' ? 'Betreuung' : 'Premium-Tracking'}</p><h2 className="mt-1 text-2xl font-semibold">{client.name}</h2></div><a className={button} href={`/${encodeURIComponent(clientId)}/`}>Klientenakte öffnen</a></header>
          <nav aria-label="Klientenarbeitsbereich" className="flex flex-wrap gap-2 border-b border-fit-line pb-3"><button className={`${button} ${workspaceTab === 'plans' ? 'border-fit-accent bg-fit-accent/10' : ''}`} aria-current={workspaceTab === 'plans' ? 'page' : undefined} onClick={() => setWorkspaceTab('plans')}>Trainingspläne</button><button className={`${button} ${workspaceTab === 'notes' ? 'border-fit-accent bg-fit-accent/10' : ''}`} aria-current={workspaceTab === 'notes' ? 'page' : undefined} onClick={() => { if (workspaceTab === 'notes') return; setWorkspaceTab('notes'); }}>Betreuungsnotizen <span className="ml-1 text-xs text-fit-muted">{coachNotes.length}</span></button><button className={`${button} ${workspaceTab === 'taskwarrior' ? 'border-fit-accent bg-fit-accent/10' : ''}`} aria-current={workspaceTab === 'taskwarrior' ? 'page' : undefined} onClick={() => setWorkspaceTab('taskwarrior')}>Premium-Tracking</button></nav>
          {workspaceTab === 'notes' ? <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            <form className="h-fit space-y-4 rounded-2xl border border-fit-line bg-fit-card p-5" onSubmit={(event) => { event.preventDefault(); saveNote(); }}>
              <div><h3 className="text-lg font-semibold">{noteEditingDate ? 'Betreuungsnotiz bearbeiten' : 'Neue Betreuungsnotiz'}</h3><p className="mt-1 text-sm text-fit-muted">Private Notizen in der lokalen Klientenablage. Eine Notiz pro Klient und Tag.</p></div>
              <label className="block text-sm">Datum<input className={`${input} mt-1`} type="date" max={todayISO()} required value={noteDate} onChange={(event) => { setNoteDate(event.target.value); setNoteDirty(true); }} /></label>
              <label className="block text-sm">Notiz<textarea className={`${input} mt-1 min-h-48 resize-y`} maxLength={10000} required value={noteDraft} onChange={(event) => { setNoteDraft(event.target.value); setNoteDirty(true); }} placeholder="Beobachtung, nächster Schritt oder Gesprächsvorbereitung…" /></label>
              <div className="flex flex-wrap gap-2"><button className={`${button} bg-fit-accent text-fit-bg`} disabled={busy || !noteDraft.trim() || !noteDate}>{busy ? 'Speichert…' : noteEditingDate ? 'Änderung speichern' : 'Notiz sichern'}</button><button type="button" className={button} disabled={busy} onClick={() => { if (noteDirty && !confirm('Die ungespeicherte Änderung verwerfen?')) return; setNoteDate(todayISO()); setNoteDraft(''); setNoteEditingDate(''); setNoteDirty(false); }}>Neue Notiz</button></div>
            </form>
            <section aria-label="Gespeicherte Betreuungsnotizen" className="space-y-3"><div className="flex items-center justify-between"><h3 className="font-semibold">Gespeicherte Notizen</h3><button className={button} disabled={notesLoading} onClick={() => setWorkspaceTab('plans')}>Zur Planung</button></div>{notesLoading && <p role="status" className="text-sm text-fit-muted">Notizen werden geladen…</p>}{!notesLoading && !coachNotes.length && <p className="rounded-xl border border-dashed border-fit-line p-5 text-sm text-fit-muted">Noch keine Betreuungsnotizen für diesen Klienten.</p>}{coachNotes.map((note) => <article key={note.date} className="rounded-xl border border-fit-line bg-fit-card p-4"><div className="flex items-start justify-between gap-3"><p className="font-semibold">{new Date(`${note.date}T12:00:00`).toLocaleDateString('de-AT')}</p><button className="min-h-10 text-sm text-fit-accent underline" disabled={busy} onClick={() => editNote(note)}>Bearbeiten</button></div><p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">{note.note || 'Leerer Eintrag'}</p><p className="mt-3 text-xs text-fit-dim">Geändert {fmt(note.updated_at)}</p></article>)}</section>
          </section> : workspaceTab === 'taskwarrior' ? <section className="space-y-5">
            <header className="rounded-2xl border border-fit-line bg-fit-card p-5 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-4"><div><h3 className="flex items-center gap-2 text-lg font-semibold"><ClipboardList size={19} /> Workout-Tracking in Taskwarrior</h3><p className="mt-2 max-w-2xl text-sm leading-relaxed text-fit-muted">Geplante Einzeltrainings werden in der vorhandenen Taskwarrior-Datenbank im privaten Klienten-Workspace geführt. Änderungen bleiben lokal; dieser Abgleich sendet keine Klientenakte und keine Tasks an Firebase.</p></div><button className={button} disabled={taskwarriorLoading || busy} onClick={() => act(async () => { const data = await api(`${clientPath}/taskwarrior`); setTaskwarriorTasks(Array.isArray(data.tasks) ? data.tasks : []); })}><RefreshCw size={15} className="mr-2 inline" /> Aktualisieren</button></div>
              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4"><div className="rounded-xl border border-fit-line p-3"><p className="text-xs text-fit-muted">Offene Workouts</p><p className="mt-1 text-xl font-semibold">{taskwarriorTasks.filter((task) => task.status === 'pending').length}</p></div><div className="rounded-xl border border-fit-line p-3"><p className="text-xs text-fit-muted">Überfällig</p><p className="mt-1 text-xl font-semibold text-fit-red">{taskwarriorTasks.filter((task) => task.status === 'pending' && task.due?.slice(0, 10) < todayISO()).length}</p></div><div className="rounded-xl border border-fit-line p-3"><p className="text-xs text-fit-muted">Heute fällig</p><p className="mt-1 text-xl font-semibold text-fit-accent">{taskwarriorTasks.filter((task) => task.status === 'pending' && task.due?.slice(0, 10) === todayISO()).length}</p></div><div className="rounded-xl border border-fit-line p-3"><p className="text-xs text-fit-muted">Erledigt</p><p className="mt-1 text-xl font-semibold">{taskwarriorTasks.filter((task) => task.status === 'completed').length}</p></div></div>
            </header>
            <div className="grid gap-4 xl:grid-cols-[minmax(260px,0.8fr)_minmax(0,1.2fr)]">
              <section className="h-fit space-y-4 rounded-2xl border border-fit-line bg-fit-card p-5"><div><h4 className="font-semibold">Lokalen Plan verfolgen</h4><p className="mt-1 text-sm text-fit-muted">Erzeugt alle Wochentermine des gewählten Plans bis zum Ende seiner Laufzeit.</p></div>
                <label className="block text-sm">Plan<select className={`${input} mt-1`} value={taskwarriorPlanId} onChange={(event) => setTaskwarriorPlanId(event.target.value)}><option value="">Plan auswählen…</option>{trackablePlans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} · {plan.totalWeeks || 10} Wochen</option>)}</select></label>
                {taskwarriorPlanId && <p className="text-xs text-fit-muted">{trackablePlans.find((plan) => plan.id === taskwarriorPlanId)?.routines.filter((routine) => routine.weekdays?.length).length} Trainingstage mit festem Wochenrhythmus.</p>}
                <button className={`${button} w-full bg-fit-accent text-fit-bg`} disabled={busy || !trackablePlans.length || !taskwarriorPlanId} onClick={syncTaskwarrior}>{busy ? 'Gleicht ab…' : 'In Klienten-Taskwarrior abgleichen'}</button>
                {!trackablePlans.length && <p className="rounded-xl border border-dashed border-fit-line p-4 text-sm text-fit-muted">Kein lokaler Trainingsplan mit festen Wochentagen. Lege im Planeditor die Trainingstage fest, um Überfälligkeiten berechnen zu können.</p>}
                {taskwarriorReport && <p role="status" className="text-sm text-fit-muted">Neu {taskwarriorReport.created} · aktualisiert {taskwarriorReport.updated} · abgeschlossen {taskwarriorReport.completed} · entfernt {taskwarriorReport.deleted}</p>}
                <p className="border-t border-fit-line pt-3 text-xs text-fit-muted">Speicherort: Klienten-Workspace · tw-data. Taskwarrior bleibt die bearbeitbare Datenbank.</p>
              </section>
              <section aria-label="Geplante Workout-Tasks" className="space-y-3"><div className="flex items-center justify-between"><h4 className="font-semibold">Einzelne Workouts</h4><button className="min-h-10 text-sm text-fit-accent underline" onClick={() => setWorkspaceTab('plans')}>Zur Planung</button></div>
                {taskwarriorLoading && <p role="status" className="text-sm text-fit-muted">Taskwarrior-Aufgaben werden geladen…</p>}
                {!taskwarriorLoading && !taskwarriorTasks.length && <p className="rounded-xl border border-dashed border-fit-line p-5 text-sm text-fit-muted">Noch keine Workout-Tasks. Wähle links einen lokalen Plan und gleiche ihn ab.</p>}
                {taskwarriorTasks.map((task) => { const day = task.due?.slice(0, 10) || ''; const overdue = Boolean(day && day < todayISO()); const dueToday = Boolean(day && day === todayISO()); const status = task.status === 'completed' ? 'Erledigt' : overdue ? 'Überfällig' : dueToday ? 'Heute fällig' : 'Geplant'; const statusClass = task.status === 'completed' || dueToday ? 'text-fit-accent' : overdue ? 'text-fit-red' : 'text-fit-muted'; return <article key={task.uuid} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-fit-line bg-fit-card p-4"><div><p className="font-semibold">{task.description}</p><p className={`mt-1 text-xs ${statusClass}`}>{status}{day ? ` · ${new Date(`${day}T12:00:00`).toLocaleDateString('de-AT')}` : ''}</p></div>{task.status === 'pending' && <button className="min-h-[44px] rounded-full border border-fit-accent/50 px-4 text-sm font-semibold text-fit-accent disabled:opacity-40" disabled={busy} onClick={() => completeTaskwarriorTask(task.occkey)}>Workout erledigt</button>}</article>; })}
              </section>
            </div>
          </section> : <>
          {viewing ? <section className="space-y-4"><div className="flex flex-wrap items-center gap-2"><button className={button} onClick={() => setViewing(null)}><ArrowLeft size={15} className="mr-1 inline" /> Alle Pläne</button><button className={button} onClick={() => { setEditing(viewing); setViewing(null); }}>Plan bearbeiten</button></div><PlanDocument plan={viewing} clientName={client.name} /></section> : editing ? <PlanEditor key={`${clientId}:${editing.id}`} plan={editing} clientName={client.name} uid={clientId} actorUid="local-coach" draftNamespace="laptop" catalogSearch={searchCatalog} templates={[]} saveDraft={(draft) => api(planPath(editing.id), 'PUT', draft)} onClose={returnToPlans} onSaved={async () => { setEditing(null); setNotice('Entwurf lokal gesichert. Noch nicht an den Klienten gesendet.'); await reload(); }} /> : <>
            <section className="rounded-2xl border border-fit-line bg-fit-card p-4 sm:p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="flex items-center gap-2 font-semibold"><ClipboardList size={19} /> Trainingspläne</h3><p className="mt-1 text-sm text-fit-muted">Erstellen → lokal sichern → Version freigeben → übergeben</p></div><button className={`${button} bg-fit-accent text-fit-bg`} disabled={busy} onClick={() => setCreating(!creating)}><Plus size={15} className="mr-1 inline" /> Neuen Plan schmieden</button></div>
              {creating && <form onSubmit={(e) => { e.preventDefault(); act(() => create({ name: name.trim(), totalWeeks: 10, routines: [] })); }} className="mt-4 space-y-3"><label className="block text-sm">Planname<input aria-label="Neuer Planname" autoFocus maxLength={80} value={name} onChange={(e) => setName(e.target.value)} className={`${input} mt-1`} placeholder="z. B. Kraftaufbau · 3 Tage" /></label><button disabled={busy || !name.trim()} className={`${button} bg-fit-accent text-fit-bg`}>Plan gestalten</button></form>}
              {client.hasLegacyPlan && <button disabled={busy} className="mt-4 min-h-[44px] text-left text-sm text-fit-accent underline" onClick={() => act(async () => { const old = await api(`${clientPath}/legacy`); const body = importClientForge(old); if (!body.routines.length) throw new Error('Der bestehende ClientForge-Plan enthält keine Einheiten.'); await create(body); })}>Bestehenden ClientForge-Plan übernehmen</button>}
            </section>
            {loading && <p role="status" className="text-sm text-fit-muted">Pläne werden geladen…</p>}
            {!loading && !plans.length && <p className="rounded-xl border border-dashed border-fit-line p-6 text-sm text-fit-muted">Noch kein Trainingsplan. Starte leer oder übernimm den vorhandenen Plan.</p>}
            {plans.map((plan) => { const unpublished = !!plan.published && JSON.stringify({ name: plan.name, description: plan.description, totalWeeks: plan.totalWeeks, routines: plan.routines }) !== JSON.stringify(plan.published); const delivered = plan.delivery?.localVersion === plan.headVersion; const issues = planReleaseIssues(plan); return <article key={plan.id} className="space-y-4 rounded-2xl border border-fit-line bg-fit-card p-5"><div><p className="text-xs font-semibold text-fit-accent">{plan.headVersion ? `Freigegeben · Version ${plan.headVersion}` : 'Lokaler Entwurf'}{unpublished ? ' · neue Änderungen im Entwurf' : ''}</p><h3 className="mt-1 text-xl font-semibold">{plan.name}</h3><p className="mt-2 text-xs text-fit-muted">{plan.totalWeeks} Wochen · {plan.routines.length} Trainingstage · {plan.routines.reduce((n, d) => n + d.exercises.length, 0)} Übungen</p>{plan.description && <details className="mt-3 text-sm text-fit-muted"><summary className="min-h-[32px] cursor-pointer">Programmhinweise und Herkunft</summary><p className="mt-2 whitespace-pre-wrap">{plan.description}</p></details>}<p className="mt-3 text-xs text-fit-dim">Gesichert {fmt(plan.updatedAt)}</p></div>
              {!!issues.length && <aside className="rounded-xl border border-amber-400/40 bg-amber-400/5 p-4"><h4 className="font-semibold">Vor der Freigabe ergänzen</h4><ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{issues.map((issue) => <li key={issue}>{issue}</li>)}</ul><button className={`${button} mt-3`} disabled={busy} onClick={() => act(async () => { setReleasing(null); setEditing(await api(planPath(plan.id))); })}>Vorgaben ergänzen</button></aside>}
              <div className="flex flex-wrap gap-2"><button className={`${button} bg-fit-accent text-fit-bg`} disabled={busy} onClick={() => act(async () => setViewing(await api(planPath(plan.id))))}>Plan ansehen</button><button className={button} disabled={busy} onClick={() => act(async () => setEditing(await api(planPath(plan.id))))}>Bearbeiten</button><button className={button} disabled={busy || !!issues.length || (!!plan.published && !unpublished)} onClick={() => { setReleasing(plan); setMessage(''); }}>Version freigeben</button><button className={button} disabled={busy} onClick={() => act(async () => setHistory({ plan, versions: (await api(`${planPath(plan.id)}/versions`)).versions }))}>Versionen</button><a className={`${button} inline-flex items-center gap-1`} href={path(`${planPath(plan.id)}/export/md`)}><Download size={14} /> Markdown</a><a className={`${button} inline-flex items-center`} href={path(`${planPath(plan.id)}/export/json`)}>JSON</a></div>
              {!!plan.headVersion && <div className="flex flex-wrap items-center justify-between gap-3 border-t border-fit-line pt-4"><p className="text-xs text-fit-muted">{delivered ? `Version ${plan.headVersion} an die App übergeben · ${fmt(plan.delivery.at)}` : client.canDeliver ? `Version ${plan.headVersion} bereit zur Übergabe` : 'Für App-Versand fehlt noch die UID-Zuordnung in der Klientenverwaltung.'}{unpublished && ' Versand verwendet die freigegebene Version.'}</p><button className={`${button} flex items-center gap-2`} disabled={busy || !client.canDeliver || delivered} onClick={() => { if (!confirm(`Freigegebene Version ${plan.headVersion} von „${plan.published.name}“ an ${client.name} senden?`)) return; act(async () => { await api(`${planPath(plan.id)}/deliver`, 'POST', { version: plan.headVersion }); await reload(); setNotice('Plan an die Klienten-App übergeben.'); }); }}><Send size={14} /> An Klienten senden</button></div>}
              {releasing?.id === plan.id && <form className="space-y-3 border-t border-fit-line pt-4" onSubmit={(e) => { e.preventDefault(); act(() => release(plan)); }}><label className="block text-sm">Was ist neu?<input aria-label="Versionshinweis" className={`${input} mt-1`} value={message} maxLength={200} onChange={(e) => setMessage(e.target.value)} placeholder="z. B. Woche 3: mehr Volumen" /></label><button disabled={busy} className={`${button} bg-fit-accent text-fit-bg`}>Lokale Version freigeben</button><button type="button" className={button} onClick={() => setReleasing(null)}>Abbrechen</button></form>}
            </article>; })}
            {history && <section aria-label="Planversionen" className="space-y-3 rounded-2xl border border-fit-accent/30 bg-fit-card p-5"><div className="flex items-center justify-between"><h3 className="font-semibold">Versionen · {history.plan.name}</h3><button className={button} onClick={() => setHistory(null)}>Schließen</button></div>{!history.versions.length && <p className="text-sm text-fit-muted">Noch keine Version freigegeben.</p>}{history.versions.map((v) => <div key={v.number} className="rounded-xl border border-fit-line p-3"><p className="font-semibold">Version {v.number} · {v.message}</p><p className="mt-1 text-xs text-fit-muted">{fmt(v.createdAt)} · {v.snapshot.routines.length} Trainingstage</p><button className="mt-2 min-h-[44px] text-sm text-fit-accent underline" disabled={busy} onClick={() => { if (!confirm(`Version ${v.number} als neuen Arbeitsstand übernehmen?`)) return; act(async () => { const restored = await api(planPath(history.plan.id), 'PUT', { ...v.snapshot, expectedUpdatedAt: history.plan.updatedAt }); setHistory(null); setEditing(restored); await reload(); }); }}>Als Entwurf wiederherstellen</button></div>)}</section>}
          </>}
        </>}
        </>}
      </main>
    </div>
  </div>;
}
