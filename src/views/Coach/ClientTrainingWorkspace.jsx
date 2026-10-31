import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, BookOpen, Check, ChevronRight, Plus, RefreshCw } from 'lucide-react';
import { createRoutine, getClientRoutinesProgress, getUid, getMacrocycle } from '@db';
const PlanDocument = lazy(() => import('@plan/views/Plan/PlanDocument.jsx'));
const ProgramEditor = lazy(() => import('@plan/views/Plan/ProgramEditor.jsx'));
const TrainingPlans = lazy(() => import('@plan/views/Plan/TrainingPlans.jsx'));
import ClientWorkoutResults from './ClientWorkoutResults.jsx';
import { clientView } from '@plan/views/Plan/lib/planVersions.js';
const CoachRoutineEditor = lazy(() => import('./CoachRoutineEditor.jsx'));
import {
  assignCoachProgram,
  listClientTrainingPlans,
  listCoachPrograms,
  listCoachWorkoutTemplates,
  publishCoachProgram,
  saveCoachProgram,
} from './trainingProgramStore.js';

const field = 'w-full rounded-xl border border-fit-line bg-fit-bg px-3 py-2.5 text-sm text-fit-ink';

export default function ClientTrainingWorkspace({ clientUid }) {
  const coachUid = getUid();
  const [screen, setScreen] = useState('client');
  const [programs, setPrograms] = useState([]);
  const [plans, setPlans] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [workouts, setWorkouts] = useState([]);
  const [planView, setPlanView] = useState(null);
  const [composing, setComposing] = useState(false);
  const [program, setProgram] = useState(null);
  const [templateEditor, setTemplateEditor] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const selectedClient = useRef(clientUid);
  selectedClient.current = clientUid;

  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const [nextPrograms, nextPlans, nextTemplates, clientProgress] = await Promise.all([
        listCoachPrograms(coachUid),
        listClientTrainingPlans(clientUid),
        listCoachWorkoutTemplates(coachUid),
        getClientRoutinesProgress(clientUid),
      ]);
      if (selectedClient.current !== clientUid) return;
      setPrograms(nextPrograms);
      setPlans(nextPlans || []);
      setTemplates(nextTemplates);
      setWorkouts(clientProgress.workouts || []);
    } catch (err) {
      if (selectedClient.current === clientUid) setError(err.message || 'Trainingspläne konnten nicht geladen werden.');
    } finally {
      if (selectedClient.current === clientUid) setBusy(false);
    }
  }, [clientUid, coachUid]);

  useEffect(() => {
    setScreen('client');
    setPlanView(null);
    setComposing(false);
    setProgram(null);
    setTemplateEditor(null);
    setPlans([]);
    setWorkouts([]);
    setNotice('');
    load();
  }, [clientUid, load]);

  async function createProgram() {
    try {
      const saved = await saveCoachProgram(coachUid, {
        name: 'Neues Trainingsprogramm', durationWeeks: 8, workouts: [],
      });
      await load();
      setProgram(saved);
      setScreen('editor');
      setComposing(true);
    } catch (err) { setError(err.message); }
  }

  async function saveProgram() {
    setBusy(true);
    setError('');
    try {
      const saved = await saveCoachProgram(coachUid, program);
      setProgram({ ...program, ...saved });
      setPrograms(await listCoachPrograms(coachUid));
      setNotice('Entwurf gespeichert.');
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function publish() {
    setBusy(true);
    setError('');
    try {
      const saved = await saveCoachProgram(coachUid, program);
      const version = await publishCoachProgram(coachUid, saved);
      const updated = { ...saved, headVersion: version.number, publishedAt: version.publishedAt };
      setProgram(updated);
      setPrograms(await listCoachPrograms(coachUid));
      setNotice(`Version ${version.number} veröffentlicht. Sie wird erst nach Zuweisung für einen Klienten sichtbar.`);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function assign() {
    if (!window.confirm(`„${program.name}“ v${program.headVersion} an diesen Klienten bereitstellen?`)) return;
    setBusy(true);
    setError('');
    try {
      await assignCoachProgram({ coachUid, clientUid, program });
      await load();
      setScreen('client');
      setNotice('Trainingsplan wurde für den Klienten bereitgestellt.');
    } catch (err) { setError(err.message || 'Zuweisung fehlgeschlagen.'); }
    finally { setBusy(false); }
  }

  async function createTemplate() {
    try {
      const created = await createRoutine({ name: 'Neue Einheit' }, coachUid);
      setTemplateEditor(created.id);
    } catch (err) { setError(err.message); }
  }

  async function openClientPlan(id) {
    const selected = clientUid;
    setBusy(true); setError('');
    try {
      const data = await getMacrocycle(selected, id);
      if (selectedClient.current !== selected) return;
      const value = data?.macrocycle;
      if (!value) throw new Error('Plan konnte nicht geladen werden.');
      setPlanView(clientView(value));
    } catch (err) { if (selectedClient.current === selected) setError(err.message); }
    finally { if (selectedClient.current === selected) setBusy(false); }
  }
  if (planView) return <div className="space-y-4"><button className="min-h-[44px] rounded-xl border border-fit-line px-4 text-sm" onClick={() => setPlanView(null)}>← Zur Klientenübersicht</button><Suspense fallback={<p role="status">Plan lädt…</p>}><PlanDocument plan={planView} /></Suspense></div>;

  if (composing && program) return <Suspense fallback={<p role="status">Editor lädt…</p>}><ProgramEditor key={`${coachUid}:${program.id}`} coachUid={coachUid} program={program} templates={templates} onClose={() => setComposing(false)} onSave={(value) => saveCoachProgram(coachUid, value)} onSaved={async (saved) => { setProgram(saved); setComposing(false); setNotice('Entwurf gespeichert. Prüfe ihn und veröffentliche eine Version.'); await load(); }} /></Suspense>;
  if (screen === 'individual') return <Suspense fallback={<p role="status">Pläne laden…</p>}><div className="space-y-4"><button className="min-h-[44px] text-sm text-fit-muted" onClick={() => { setScreen('client'); load(); }}>← Zur Klientenübersicht</button><h2 className="text-xl font-semibold">Individuelle Klientenpläne</h2><TrainingPlans clientUid={clientUid} templates={[]} workouts={workouts} onChanged={load} /></div></Suspense>;

  if (templateEditor) return <Suspense fallback={<p role="status">Vorlage lädt…</p>}><CoachRoutineEditor
    key={`${coachUid}:${templateEditor}`}
    coachUid={coachUid}
    routineId={templateEditor}
    onBack={async () => { setTemplateEditor(null); await load(); }}
  /></Suspense>;

  return (
    <div className="space-y-4">
      <header className="rounded-2xl border border-fit-line bg-fit-card p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-fit-accent">Training · Klientenbetreuung</p>
            <h2 className="mt-1 text-lg font-semibold text-fit-ink">Trainingspläne</h2>
            <p className="mt-1 text-sm text-fit-muted">Erstelle Programme einmal in deiner Bibliothek und weise eine veröffentlichte Version gezielt zu.</p>
          </div>
          <button aria-label="Aktualisieren" onClick={load} disabled={busy} className="rounded-lg p-2 text-fit-muted hover:bg-fit-bg">
            <RefreshCw size={16} className={busy ? 'animate-spin' : ''} />
          </button>
        </div>
      </header>

      {error && <div role="alert" className="rounded-xl border border-red-500/30 p-3 text-sm text-fit-red">{error}</div>}
      {notice && <div role="status" className="rounded-xl border border-green-500/30 p-3 text-sm text-green-500">{notice}</div>}

      {screen === 'client' && <>
        <button disabled={busy} onClick={() => setScreen('individual')} className="min-h-[64px] w-full rounded-2xl border border-fit-accent/30 bg-fit-accent/5 p-4 text-left disabled:opacity-50"><span className="block font-semibold text-fit-accent">Individuellen Plan gestalten</span><span className="mt-1 block text-xs text-fit-muted">Trainingstage und Übungen direkt für diesen Klienten bearbeiten</span></button>
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-fit-ink">Aktuelle Pläne</h3>
            <button onClick={() => setScreen('library')} className="flex items-center gap-2 rounded-xl bg-fit-accent px-3 py-2 text-sm font-semibold text-fit-bg">
              <BookOpen size={15} /> Programm auswählen
            </button>
          </div>
          {plans.filter((item) => item.status === 'published').length === 0
            ? <p className="rounded-xl border border-dashed border-fit-line p-4 text-sm text-fit-muted">Für diesen Klienten ist noch kein Trainingsplan bereitgestellt.</p>
            : plans.filter((item) => item.status === 'published').map((item) => (
              <article key={item.id} className="rounded-xl border border-fit-line bg-fit-card p-4">
                <div className="flex items-center justify-between gap-3">
                  <div><h4 className="font-semibold text-fit-ink">{item.name}</h4><p className="mt-1 text-xs text-fit-muted">{item.description || `${item.totalWeeks || '–'} Wochen`} · Version {item.headVersion || 1}</p></div>
                  <button disabled={busy} onClick={() => openClientPlan(item.id)} className="min-h-[44px] rounded-xl border border-fit-line px-3 text-sm text-fit-accent">Plan ansehen</button>
                </div>
              </article>
            ))}
        </section>
        <ClientWorkoutResults workouts={workouts} />
      </>}

      {screen === 'library' && <section className="space-y-3">
        <button onClick={() => setScreen('client')} className="flex items-center gap-2 text-sm text-fit-muted"><ArrowLeft size={15} /> Zur Klientenübersicht</button>
        <div className="flex items-center justify-between"><h3 className="font-semibold text-fit-ink">Meine Programmbibliothek</h3>
          <button onClick={createProgram} className="flex items-center gap-1 rounded-xl bg-fit-accent px-3 py-2 text-sm font-semibold text-fit-bg"><Plus size={15} /> Neues Programm</button></div>
        {programs.length === 0 && <p className="rounded-xl border border-dashed border-fit-line p-4 text-sm text-fit-muted">Hier legst du wiederverwendbare Programme an. Sie werden erst durch eine gezielte Zuweisung im Klientenprofil sichtbar.</p>}
        {programs.map((item) => <button key={item.id} onClick={() => { setProgram(item); setScreen('editor'); }} className="flex w-full items-center justify-between rounded-xl border border-fit-line bg-fit-card p-4 text-left">
          <span><strong className="block text-fit-ink">{item.name}</strong><span className="text-xs text-fit-muted">{item.workouts?.length || 0} Einheiten · {item.headVersion ? `veröffentlicht v${item.headVersion}` : 'noch Entwurf'}</span></span><ChevronRight size={16} />
        </button>)}
        <button onClick={createTemplate} className="w-full rounded-xl border border-fit-line px-3 py-3 text-sm text-fit-accent">+ Neue Workout-Einheit erstellen</button>
        <div className="space-y-2">{templates.map((item) => <button key={item.id} onClick={() => setTemplateEditor(item.id)} className="w-full rounded-lg bg-fit-bg p-3 text-left text-sm text-fit-ink hover:bg-fit-bg2">{item.name} <span className="text-xs text-fit-muted">· {item.exerciseCount || 0} Übungen · Bearbeiten</span></button>)}</div>
      </section>}

      {screen === 'editor' && program && <section className="space-y-4">
        <button onClick={() => { setScreen('library'); setNotice(''); }} className="flex items-center gap-2 text-sm text-fit-muted"><ArrowLeft size={15} /> Zur Programmbibliothek</button>
        <div className="rounded-2xl border border-fit-line bg-fit-card p-4"><h3 className="text-lg font-semibold">{program.name}</h3><p className="mt-2 text-sm text-fit-muted">{program.durationWeeks} Wochen · {program.workouts?.length || 0} Trainingstage</p>{program.description && <p className="mt-2 whitespace-pre-wrap text-sm">{program.description}</p>}<button disabled={busy} onClick={() => setComposing(true)} className="mt-4 min-h-[48px] w-full rounded-xl bg-fit-accent p-3 font-semibold text-fit-bg">Trainingstage und Übungen bearbeiten</button></div>

        <div className="flex flex-wrap gap-2">
          <button disabled={busy} onClick={saveProgram} className="rounded-xl border border-fit-line px-4 py-2.5 text-sm font-semibold text-fit-ink">Entwurf speichern</button>
          <button disabled={busy || !program.workouts?.length} onClick={publish} className="rounded-xl bg-fit-accent px-4 py-2.5 text-sm font-semibold text-fit-bg">Version veröffentlichen</button>
          {program.headVersion > 0 && <button disabled={busy} onClick={assign} className="rounded-xl border border-green-500/40 px-4 py-2.5 text-sm font-semibold text-green-500">v{program.headVersion} diesem Klienten zuweisen</button>}
        </div>
        {program.headVersion > 0 && <p className="text-xs text-fit-muted">Zuweisungen bleiben unverändert, auch wenn du später eine neue Programmversion veröffentlichst.</p>}
      </section>}
    </div>
  );
}
