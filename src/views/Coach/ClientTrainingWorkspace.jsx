import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, BookOpen, Check, ChevronRight, Plus, RefreshCw } from 'lucide-react';
import { createRoutine, getClientRoutinesProgress, getUid } from '@db';
import ClientWorkoutResults from './ClientWorkoutResults.jsx';
import CoachRoutineEditor from './CoachRoutineEditor.jsx';
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
  const [program, setProgram] = useState(null);
  const [templateEditor, setTemplateEditor] = useState(null);
  const [templateChoice, setTemplateChoice] = useState('');
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

  async function addWorkout() {
    const template = templates.find((item) => item.id === templateChoice);
    if (!template || program.workouts.some((item) => item.templateId === template.id)) return;
    setProgram({
      ...program,
      workouts: [...program.workouts, {
        templateId: template.id,
        label: template.name,
        targetCount: 2,
        targetPeriodDays: 7,
        weekdays: [],
        restHoursAfter: 0,
      }],
    });
    setTemplateChoice('');
  }

  async function createTemplate() {
    try {
      const created = await createRoutine({ name: 'Neue Einheit' }, coachUid);
      setTemplateEditor(created.id);
    } catch (err) { setError(err.message); }
  }

  if (templateEditor) return <CoachRoutineEditor
    key={`${coachUid}:${templateEditor}`}
    coachUid={coachUid}
    routineId={templateEditor}
    onBack={async () => { setTemplateEditor(null); await load(); }}
  />;

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
                  <Check size={17} className="text-green-500" aria-label="Veröffentlicht" />
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
        <div className="rounded-2xl border border-fit-line bg-fit-card p-4">
          <label className="mb-3 block text-xs font-semibold text-fit-muted">PROGRAMMNAME<input className={`${field} mt-1`} value={program.name} onChange={(e) => setProgram({ ...program, name: e.target.value })} /></label>
          <label className="mb-3 block text-xs font-semibold text-fit-muted">ZIEL<input className={`${field} mt-1`} placeholder="z. B. Kraftaufbau, Wiedereinstieg" value={program.goal || ''} onChange={(e) => setProgram({ ...program, goal: e.target.value })} /></label>
          <label className="mb-3 block text-xs font-semibold text-fit-muted">DAUER IN WOCHEN<input type="number" min="1" max="104" className={`${field} mt-1`} value={program.durationWeeks || 1} onChange={(e) => setProgram({ ...program, durationWeeks: Number(e.target.value) })} /></label>
          <label className="block text-xs font-semibold text-fit-muted">HINWEISE FÜR DEN KLIENTEN<textarea className={`${field} mt-1 min-h-20`} value={program.description || ''} onChange={(e) => setProgram({ ...program, description: e.target.value })} /></label>
        </div>

        <div className="rounded-2xl border border-fit-line bg-fit-card p-4">
          <div className="mb-3 flex items-center justify-between"><h3 className="font-semibold text-fit-ink">Wochenplan</h3><span className="text-xs text-fit-muted">Einstellungen je Einheit</span></div>
          <div className="mb-3 flex gap-2"><select aria-label="Workout auswählen" className={`${field} min-w-0`} value={templateChoice} onChange={(e) => setTemplateChoice(e.target.value)}><option value="">Einheit auswählen…</option>{templates.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><button disabled={!templateChoice} onClick={addWorkout} className="rounded-xl bg-fit-accent px-3 text-fit-bg disabled:opacity-40"><Plus size={17} /></button></div>
          {!program.workouts?.length && <p className="text-sm text-fit-muted">Füge eine vorbereitete Einheit hinzu. Jede Einheit wird bei der Zuweisung als eigener Klienten-Snapshot kopiert.</p>}
          <div className="space-y-3">{program.workouts?.map((item, index) => <article key={`${item.templateId}:${index}`} className="rounded-xl bg-fit-bg p-3">
            <div className="mb-2 flex items-center justify-between gap-2"><strong className="truncate text-sm text-fit-ink">{item.label}</strong><button aria-label={`${item.label} entfernen`} onClick={() => setProgram({ ...program, workouts: program.workouts.filter((_, i) => i !== index) })} className="text-xs text-fit-red">Entfernen</button></div>
            <div className="grid grid-cols-2 gap-2"><label className="text-xs text-fit-muted">Zielhäufigkeit<input type="number" min="1" className={`${field} mt-1`} value={item.targetCount} onChange={(e) => setProgram({ ...program, workouts: program.workouts.map((w, i) => i === index ? { ...w, targetCount: Number(e.target.value) } : w) })} /></label><label className="text-xs text-fit-muted">pro Zeitraum (Tage)<input type="number" min="1" className={`${field} mt-1`} value={item.targetPeriodDays} onChange={(e) => setProgram({ ...program, workouts: program.workouts.map((w, i) => i === index ? { ...w, targetPeriodDays: Number(e.target.value) } : w) })} /></label></div>
          </article>)}</div>
        </div>

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
