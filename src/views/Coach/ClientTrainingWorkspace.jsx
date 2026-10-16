import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Pencil, ArrowRight, RefreshCw } from 'lucide-react';
import { createPlanApi } from '@plan/views/Plan/api.js';
import RoutineBuilder from '@plan/views/Plan/RoutineBuilder.jsx';
import TrainingPlans from '@plan/views/Plan/TrainingPlans.jsx';
import ClientWorkoutResults from './ClientWorkoutResults.jsx';

// Selection belongs to ClientsPanel. All writes use an explicit, fixed client UID.
export default function ClientTrainingWorkspace({ clientUid, mode = 'plan', onNavigate }) {
  const api = useMemo(() => createPlanApi(clientUid), [clientUid]);
  const [routines, setRoutines] = useState([]);
  const [workouts, setWorkouts] = useState([]);
  const [editing, setEditing] = useState(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const selected = useRef(clientUid);
  selected.current = clientUid;

  async function load() {
    if (!clientUid) return;
    setBusy(true);
    setError('');
    try {
      const [r, w] = await Promise.all([api.get('/routines'), api.get('/workouts')]);
      if (selected.current !== clientUid) return;
      setRoutines(r.routines || []);
      setWorkouts(w.workouts || []);
    } catch (err) {
      if (selected.current === clientUid) setError(err.message);
    } finally {
      if (selected.current === clientUid) setBusy(false);
    }
  }
  useEffect(() => {
    setRoutines([]); setWorkouts([]); setEditing(null); setName(''); load();
  }, [clientUid]);

  async function create(event) {
    event.preventDefault();
    if (busy || !name.trim()) return;
    setBusy(true); setError('');
    try {
      const result = await api.post('/routines', { name: name.trim() });
      if (selected.current !== clientUid) return;
      setName(''); setEditing(result.id);
    } catch (err) { if (selected.current === clientUid) setError(err.message); }
    finally { if (selected.current === clientUid) setBusy(false); }
  }

  if (editing) return (
    <RoutineBuilder key={`${clientUid}:${editing}`} routineId={editing} apiClient={api}
      onBack={() => { setEditing(null); load(); }} />
  );
  return (
    <div className="space-y-5">
      <header className="rounded-2xl border border-fit-line bg-fit-card p-4">
        <h2 className="text-lg font-semibold">{mode === 'templates' ? 'Workouts vorbereiten' : 'Trainingsplan bereitstellen'}</h2>
        <p className="mt-2 text-sm text-fit-muted">{mode === 'templates'
          ? 'Erstelle die Einheiten deines Klienten aus dem Yuhonas-Katalog. Lege Sätze, Wiederholungen, Pausen und Hinweise im gemeinsamen Plan-Editor fest.'
          : 'Bündle vorbereitete Workout-Vorlagen, lege das Trainingspensum fest und stelle den Plan bereit. Der Klient startet die Einheiten in Plan und protokolliert seine tatsächlichen Sätze.'}</p>
        <button onClick={() => onNavigate?.(mode === 'templates' ? 'trainingplan' : 'templates')}
          className="mt-3 flex items-center gap-2 text-sm font-semibold text-fit-accent">
          {mode === 'templates' ? 'Weiter zum Trainingsplan' : 'Workout-Vorlagen bearbeiten'} <ArrowRight size={15} />
        </button>
      </header>
      {error && <div role="alert" className="rounded-xl border border-red-500/30 p-3 text-sm text-fit-red">{error}
        <button onClick={load} className="ml-2 underline">Erneut versuchen</button>
      </div>}
      <button onClick={load} disabled={busy} className="flex items-center gap-2 text-xs text-fit-muted"><RefreshCw size={13} /> {busy ? 'Lädt…' : 'Daten aktualisieren'}</button>
      {mode === 'templates' ? <>
        <form onSubmit={create} className="flex gap-2">
          <input aria-label="Neue Workout-Vorlage" value={name} onChange={(e) => setName(e.target.value)}
            placeholder="z. B. Push A" className="min-w-0 flex-1 rounded-xl border border-fit-line bg-fit-card p-3 text-sm" />
          <button disabled={busy || !name.trim()} className="flex items-center gap-2 rounded-xl bg-fit-accent px-4 text-sm font-semibold text-fit-bg disabled:opacity-50"><Plus size={16} /> Erstellen</button>
        </form>
        {!busy && !routines.length && <p className="rounded-xl border border-dashed border-fit-line p-5 text-sm text-fit-muted">Erstelle die erste Workout-Vorlage und füge Übungen hinzu. Anschließend kannst du sie einem Trainingsplan hinzufügen.</p>}
        <div className="space-y-2">{routines.map((r) => <button key={r.id} onClick={() => setEditing(r.id)} className="flex w-full items-center justify-between rounded-xl border border-fit-line bg-fit-card p-4 text-left">
          <span><span className="block font-semibold">{r.name}</span><span className="text-xs text-fit-muted">{r.exerciseCount || 0} Übungen · Satzvorgaben bearbeiten</span></span><Pencil size={16} />
        </button>)}</div>
      </> : <TrainingPlans key={clientUid} clientUid={clientUid} templates={routines} workouts={workouts} onChanged={load} />}
      <ClientWorkoutResults workouts={workouts} />
      <a href="https://vos-plan.web.app" target="_blank" rel="noopener noreferrer" className="inline-block text-xs text-fit-accent">Plan-App öffnen ↗</a>
    </div>
  );
}
