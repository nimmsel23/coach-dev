import { useState, useEffect, useRef } from 'react';
import { Layers, Plus, Trash2, ChevronDown, Search, Loader2 } from 'lucide-react';
import {
  getClientRoutinesProgress, getClientRoutine, searchExercises,
  createClientRoutine, addClientRoutineExercise, deleteClientRoutine,
} from '@db';

// Coach-Schreib-UI für Klienten-Templates: Template anlegen, Übungen
// hinzufügen. Bewusst schlank gehalten — kein Reorder/Template-Sets-
// Feintuning wie im Klienten-eigenen RoutineBuilder, das bleibt Sache des
// Klienten selbst. Ziel-Häufigkeit (x-mal in y Tagen) wird NICHT mehr hier
// gesetzt — das gehört auf die Trainingsplan-Ebene (Makro, mehrere
// Templates gebündelt), siehe views/Coach/ClientTrainingPlans.jsx. Vorher
// gab es hier eine zweite, parallele Ziel-Setzen-Mechanik direkt auf
// Templates — Duplikat zur echten Bündelung, entfernt.
function ExerciseAdder({ onAdd, exclude }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (q.length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await searchExercises(q, 10);
        const all = res?.results || [];
        setResults(all.filter((ex) => !exclude.includes(ex.id || ex.exercise_id)));
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q, exclude]);

  useEffect(() => {
    function onOutside(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, []);

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-fit-dim" />
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Übung suchen und hinzufügen…"
          className="w-full pl-9 pr-3 py-2 rounded-xl bg-fit-bg border border-fit-line text-sm text-fit-ink focus:outline-none focus:border-fit-accent"
        />
        {loading && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-fit-accent animate-spin" />}
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-20 top-full mt-1 left-0 right-0 bg-fit-card border border-fit-line rounded-xl shadow-lg overflow-hidden max-h-56 overflow-y-auto">
          {results.map((ex) => (
            <button
              key={ex.id || ex.exercise_id}
              onClick={() => { onAdd(ex); setQ(''); setResults([]); setOpen(false); }}
              className="w-full text-left px-3 py-2 text-sm text-fit-ink hover:bg-fit-bg2 transition-colors truncate"
            >
              {ex.name || ex.display_name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function RoutineRow({ routine, clientUid, onAddExercise, onDelete, refreshKey }) {
  const [open, setOpen] = useState(false);
  const [exercises, setExercises] = useState(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setExercises(null);
    getClientRoutine(clientUid, routine.id).then((d) => {
      if (alive) setExercises(d.routine?.exercises || []);
    });
    return () => { alive = false; };
  }, [open, routine.id, clientUid, refreshKey]);

  return (
    <div className="rounded-xl bg-fit-bg2 border border-fit-line/50 overflow-hidden">
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-fit-bg/50 transition-colors">
        <div className="min-w-0 text-left">
          <div className="text-sm font-semibold text-fit-ink truncate">{routine.name}</div>
        </div>
        <ChevronDown size={16} className={`text-fit-dim shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="px-3 pb-3 pt-1 border-t border-fit-line/30 space-y-3">
          <div className="flex items-center justify-end">
            <button onClick={() => onDelete(routine)} className="p-1.5 text-fit-dim hover:text-red-400 transition-colors">
              <Trash2 size={14} />
            </button>
          </div>

          {exercises === null ? (
            <div className="text-xs text-fit-dim text-center py-2">Lädt…</div>
          ) : exercises.length > 0 ? (
            <div className="space-y-1">
              {exercises.map((ex) => (
                <div key={ex.id} className="text-xs text-fit-ink bg-fit-bg px-2.5 py-1.5 rounded-lg">{ex.name}</div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-fit-dim text-center py-1">Noch keine Übungen</div>
          )}

          <ExerciseAdder
            exclude={(exercises || []).map((ex) => ex.exercise_id)}
            onAdd={(ex) => onAddExercise(routine, ex)}
          />
        </div>
      )}
    </div>
  );
}

export default function ClientPlan({ clientUid }) {
  const [routines, setRoutines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  async function load() {
    setLoading(true);
    const { routines } = await getClientRoutinesProgress(clientUid);
    setRoutines(routines);
    setLoading(false);
  }

  useEffect(() => { load(); }, [clientUid]);

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await createClientRoutine(clientUid, { name: newName.trim() });
      setNewName('');
      load();
    } finally {
      setCreating(false);
    }
  }

  async function handleAddExercise(routine, ex) {
    await addClientRoutineExercise(clientUid, routine.id, {
      exercise_id: ex.id || ex.exercise_id,
      name: ex.name || ex.display_name,
      primaryMuscles: ex.primary_muscles || ex.primaryMuscles || [],
      secondaryMuscles: ex.secondary_muscles || ex.secondaryMuscles || [],
      yuhonas_id: ex.yuhonas_id || null,
      trackingType: 'weight_reps',
    });
    setRefreshKey((k) => k + 1);
    load();
  }

  async function handleDelete(routine) {
    if (!confirm(`"${routine.name}" wirklich löschen?`)) return;
    await deleteClientRoutine(clientUid, routine.id);
    load();
  }

  if (loading) return (
    <div className="flex items-center justify-center py-16">
      <div className="w-6 h-6 border-2 border-fit-accent/30 border-t-fit-accent rounded-full animate-spin" />
    </div>
  );

  const nonSkillRoutines = routines.filter((r) => r.category !== 'calisthenics-skill');

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          placeholder="z.B. Push"
          className="flex-1 bg-fit-bg2 border border-fit-line rounded-xl px-3 py-2 text-sm text-fit-ink focus:outline-none focus:border-fit-accent"
        />
        <button
          onClick={handleCreate}
          disabled={creating || !newName.trim()}
          className="flex items-center gap-1.5 px-3.5 py-2 bg-fit-accent text-fit-bg rounded-xl text-sm font-semibold disabled:opacity-50 transition-all"
        >
          <Plus size={15} /> Routine
        </button>
      </div>

      {nonSkillRoutines.length === 0 ? (
        <div className="card py-12 flex flex-col items-center justify-center text-center" style={{ opacity: 0.5 }}>
          <Layers size={36} className="mb-3 text-fit-dim" />
          <p className="text-xs" style={{ color: 'var(--dim)' }}>Noch keine Templates für diesen Klienten</p>
        </div>
      ) : (
        <div className="space-y-2">
          {nonSkillRoutines.map((r) => (
            <RoutineRow
              key={r.id}
              routine={r}
              clientUid={clientUid}
              onAddExercise={handleAddExercise}
              onDelete={handleDelete}
              refreshKey={refreshKey}
            />
          ))}
        </div>
      )}
    </div>
  );
}
