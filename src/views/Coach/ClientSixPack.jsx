import { useEffect, useMemo, useState } from 'react';
import { Check, Flag, Flame } from 'lucide-react';
import { getClientSixpack } from '@db';
import {
  DAYS_PER_WEEK, PROGRAM_WEEKS, dayInWeek, dayStatus, pickSixpackSessions, sessionMinutes, summarizeProgram, weekOf,
} from './sixpackProgress.js';

// Schreibgeschützter Spiegel der 6Pack-App (~/6pack-dev, TrackScreen): gleiche
// Farben und Tag-Zeilen, damit der Coach sieht, was der Klient sieht.
const RED = '#e2001a';

const formatDate = (iso) => {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

function Stat({ label, value, hint }) {
  return (
    <div className="card px-4 py-3">
      <div className="text-xs" style={{ color: 'var(--dim)' }}>{label}</div>
      <div className="text-xl font-black text-fit-ink">{value}</div>
      {hint && <div className="text-xs" style={{ color: 'var(--dim)' }}>{hint}</div>}
    </div>
  );
}

export default function ClientSixPack({ clientUid }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [week, setWeek] = useState(1);

  useEffect(() => {
    let alive = true;
    setData(null);
    setError('');
    getClientSixpack(clientUid)
      .then((res) => {
        if (!alive) return;
        setData(res);
        setWeek(weekOf(summarizeProgram(res.program).currentDay));
      })
      .catch((err) => alive && setError(err.message || '6Pack-Daten konnten nicht geladen werden.'));
    return () => { alive = false; };
  }, [clientUid]);

  const summary = useMemo(() => summarizeProgram(data?.program), [data]);
  const sessions = useMemo(() => pickSixpackSessions(data?.sessions || []), [data]);

  if (error) return <p role="alert" className="text-sm text-fit-red">{error}</p>;
  if (!data) return <div className="flex items-center justify-center py-20"><div className="spinner" /></div>;

  if (!summary.started && sessions.length === 0) {
    return (
      <div className="card flex flex-col items-center py-12 text-center">
        <Flame size={36} className="mb-3 text-fit-dim" />
        <h3 className="text-base font-semibold text-fit-ink">Noch kein 6Pack</h3>
        <p className="mt-1 text-xs" style={{ color: 'var(--dim)' }}>Dieser Klient hat das 6Pack-Programm noch nicht gestartet.</p>
      </div>
    );
  }

  const days = Array.from({ length: DAYS_PER_WEEK }, (_, i) => (week - 1) * DAYS_PER_WEEK + i + 1);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          label="Aktuell"
          value={summary.finished ? 'Fertig' : `Woche ${summary.currentWeek} · Tag ${summary.currentDayInWeek}`}
        />
        <Stat label="Trainingstage" value={`${summary.trainingDone}/${summary.trainingTotal}`} hint={`${summary.percent} %`} />
        <Stat label="Zuletzt trainiert" value={summary.lastCompletedOn ? formatDate(summary.lastCompletedOn) : '–'} />
        <Stat label="Einheiten geloggt" value={sessions.length} />
      </div>

      <section className="overflow-hidden rounded-xl" style={{ border: '1px solid #000' }}>
        <div className="flex overflow-x-auto" style={{ background: '#0e0e0e' }}>
          {Array.from({ length: PROGRAM_WEEKS }, (_, i) => i + 1).map((w) => (
            <button
              key={w}
              onClick={() => setWeek(w)}
              className="flex-1 shrink-0 px-3 py-2.5 text-xs font-black uppercase tracking-[0.08em]"
              style={{ color: w === week ? RED : 'var(--dim)', borderBottom: `2px solid ${w === week ? RED : 'transparent'}` }}
            >
              Week {w}
            </button>
          ))}
        </div>
        {days.map((day) => {
          const st = dayStatus(data.program, day);
          return (
            <div key={day} className="flex items-center justify-between px-4 py-3.5" style={{ background: st.current ? RED : '#1a1a1a', borderBottom: '1px solid #000' }}>
              <span className="text-sm font-bold" style={{ color: '#fff' }}>
                Day {dayInWeek(day)}
                {st.done && st.doneOn && !st.rest && <span className="ml-2 text-xs font-normal" style={{ opacity: 0.6 }}>{formatDate(st.doneOn)}</span>}
              </span>
              <span className="flex items-center gap-3">
                {st.current && <Flag size={16} fill="#fff" color="#fff" aria-label="Aktueller Tag" />}
                {st.rest ? (
                  <span className="text-xs font-black uppercase tracking-[0.1em]" style={{ color: '#fff', opacity: 0.7 }}>Rest</span>
                ) : (
                  <span className="flex h-6 w-6 items-center justify-center rounded-full" style={{ border: '2px solid #fff', background: st.done ? '#fff' : 'transparent' }}>
                    {st.done && <Check size={13} color={RED} strokeWidth={4} />}
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-fit-ink">Geloggte 6Pack-Einheiten</h3>
        {sessions.length === 0 && <p className="text-xs" style={{ color: 'var(--dim)' }}>Noch keine Einheit geloggt.</p>}
        {sessions.slice(0, 30).map((s) => {
          const minutes = sessionMinutes(s);
          const label = s.program?.adhoc ? 'Freies Workout' : s.program?.day ? `Woche ${weekOf(s.program.day)} · Tag ${dayInWeek(s.program.day)}` : '6Pack';
          return (
            <article key={s.id} className="card px-4 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-semibold text-fit-ink">{label}</span>
                <span className="text-xs" style={{ color: 'var(--dim)' }}>{formatDate(s.date)}</span>
              </div>
              <div className="mt-0.5 text-xs" style={{ color: 'var(--dim)' }}>
                {[
                  minutes && `${minutes} min`,
                  s.exercises?.length && `${s.exercises.length} Übungen`,
                  s.effort != null && `RPE ${s.effort}`,
                  s.activity?.type === 'hiit' && `Finisher ${s.activity.duration} min`,
                ].filter(Boolean).join(' · ')}
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}
