import { useEffect, useMemo, useState } from 'react';
import { FileText, Printer } from 'lucide-react';
import { getLogbookSessions } from '@db';
import { classifySession } from '../../constants/ActivityConstants';
import { estimateDurationMinutes, normalizeSessionGate } from '../../lib/sessionGate.js';

// Trainingsprotokoll — Pendant zum Ernährungsprotokoll in fuel-dev
// (NutritionReportView): abgabefertiges Protokoll als weißes Blatt, Ausgabe per
// window.print() ("Als PDF speichern"). Die Pflichtaufgabe verlangt N (40)
// Einheiten ohne festen Zeitraum: ab einem Anker-Datum zählen die N Einheiten
// davor (inkl. Anker-Tag) bzw. danach. Gezählt werden nur Kraft/Hypertrophie;
// das Blatt enthält je Einheit nur Datum, Art, Ort und Dauer (keine Übungen/Sätze).

const DAY_NAMES = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const NAME_STORAGE_KEY = 'fitness-report-name';

function isoToday() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function fmtDE(iso) {
  const d = new Date(`${iso}T12:00:00`);
  return `${DAY_NAMES[d.getDay()]}, ${d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}`;
}

// Art = gewählte Trainingsart, sonst Aktivitätstyp (Ausdauer) bzw. Kraft.
function sessionArt(s) {
  if (s?.trainingsart) return s.trainingsart;
  const { isActivity, label } = classifySession(s);
  return isActivity ? label : 'Kraft';
}
// Dauer in Minuten: gespeicherter Wert, sonst aus der Workout-Stoppuhr.
function sessionMinutes(s) {
  const direct = Number(s?.duration);
  if (direct > 0) return Math.round(direct);
  // nur beendete Stoppuhr (nie gestoppte gilt nach 3 h automatisch als beendet)
  if (!normalizeSessionGate(s?.sessionGate).endedAt) return 0;
  try { return Number(estimateDurationMinutes(s.sessionGate)) || 0; } catch { return 0; }
}
const COUNTED_ART = new Set(['Kraft', 'Hypertrophie']);

export default function TrainingProtocol() {
  const [direction, setDirection] = useState('before'); // before = die N Einheiten bis Datum, after = ab Datum
  const [anchorIso, setAnchorIso] = useState(isoToday());
  const [count, setCount] = useState(40);
  const [sessions, setSessions] = useState(null);
  const [name, setName] = useState(() => {
    try { return localStorage.getItem(NAME_STORAGE_KEY) || ''; } catch { return ''; }
  });

  useEffect(() => {
    let alive = true;
    getLogbookSessions()
      .then((h) => { if (alive) setSessions(Array.isArray(h) ? h : []); })
      .catch(() => { if (alive) setSessions([]); });
    return () => { alive = false; };
  }, []);

  const changeName = (v) => {
    setName(v);
    try { localStorage.setItem(NAME_STORAGE_KEY, v); } catch { /* ignore */ }
  };

  // Ein Trainingstag = eine Einheit (Pflichtaufgabe), auch bei mehreren Sessions am Tag.
  const days = useMemo(() => {
    const n = Math.max(1, Math.min(500, Math.floor(Number(count)) || 40));
    const byDate = new Map();
    for (const s of (sessions || []).filter((x) => x?.date && COUNTED_ART.has(sessionArt(x))).sort((a, b) => a.date.localeCompare(b.date))) {
      if (!byDate.has(s.date)) byDate.set(s.date, []);
      byDate.get(s.date).push(s);
    }
    const all = [...byDate.entries()];
    return direction === 'before'
      ? all.filter(([d]) => d <= anchorIso).slice(-n)
      : all.filter(([d]) => d >= anchorIso).slice(0, n);
  }, [sessions, direction, anchorIso, count]);

  const summary = useMemo(() => ({
    days: days.length,
    minutes: days.reduce((a, [, list]) => a + list.reduce((m, s) => m + sessionMinutes(s), 0), 0),
  }), [days]);

  const fromIso = days[0]?.[0] || anchorIso;
  const toIso = days[days.length - 1]?.[0] || anchorIso;

  return (
    <div className="space-y-6">
      <div className="no-print rounded-3xl border border-fit-line bg-fit-card p-6 space-y-4">
        <div className="flex items-center gap-3">
          <FileText className="h-6 w-6 text-fit-accent" />
          <div>
            <h2 className="text-xl font-bold tracking-tight">Trainingsprotokoll</h2>
            <p className="text-sm text-fit-dim">Abgabefertiges Protokoll über eine feste Anzahl Einheiten (Pflichtaufgabe: 40). Datum und Richtung wählen, dann drucken bzw. als PDF speichern.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex gap-2">
            {[['before', 'Vorherige Einheiten'], ['after', 'Folgende Einheiten']].map(([v, l]) => (
              <button key={v} onClick={() => setDirection(v)}
                className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${direction === v ? 'bg-fit-accent text-black' : 'border border-fit-line text-fit-dim hover:text-ink'}`}>
                {l}
              </button>
            ))}
          </div>
          <label className="grid gap-1 text-xs text-fit-dim">{direction === 'before' ? 'Bis Datum (inkl.)' : 'Ab Datum (inkl.)'}
            <input type="date" value={anchorIso} onChange={(e) => setAnchorIso(e.target.value)}
              className="rounded-2xl border border-fit-line bg-transparent px-3 py-2 text-sm text-ink" />
          </label>
          <label className="grid gap-1 text-xs text-fit-dim">Einheiten
            <input type="number" min={1} max={500} value={count} onChange={(e) => setCount(e.target.value)}
              className="w-24 rounded-2xl border border-fit-line bg-transparent px-3 py-2 text-sm text-ink" />
          </label>
          <label className="grid gap-1 text-xs text-fit-dim flex-1 min-w-[200px]">Name (auf dem Protokoll)
            <input type="text" value={name} placeholder="Vor- und Nachname" onChange={(e) => changeName(e.target.value)}
              className="rounded-2xl border border-fit-line bg-transparent px-3 py-2 text-sm text-ink" />
          </label>
          <button onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-full bg-fit-accent px-5 py-2.5 text-sm font-semibold text-black">
            <Printer className="h-4 w-4" /> Drucken / als PDF
          </button>
        </div>
        <p className="text-xs text-fit-dim">{summary.days} von {Math.max(1, Math.floor(Number(count)) || 40)} gewünschten Einheiten gefunden (1 Trainingstag = 1 Einheit).</p>
      </div>

      <div className="report-sheet mx-auto max-w-[820px] rounded-2xl p-10">
        {sessions === null ? (
          <p style={{ fontStyle: 'italic', color: '#6b7280' }}>Daten werden geladen…</p>
        ) : (
          <>
            <header style={{ borderBottom: '2px solid #14181f', paddingBottom: 10, marginBottom: 12 }}>
              <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>Trainingsprotokoll</h1>
              <p style={{ margin: '8px 0 0' }}><strong>Name:</strong> {name || '—'}</p>
              <p style={{ margin: '2px 0 0' }}><strong>Umfang:</strong> {summary.days} Einheiten · {summary.days ? `${fmtDE(fromIso)} – ${fmtDE(toIso)}` : '—'}</p>
            </header>

            {days.length === 0 ? (
              <p style={{ fontStyle: 'italic', color: '#6b7280', marginTop: 18 }}>Keine Einheiten gefunden.</p>
            ) : (
              <table style={{ marginTop: 12 }}>
                <thead>
                  <tr>
                    <th style={{ width: '6%' }}>Nr.</th>
                    <th style={{ width: '24%' }}>Datum</th>
                    <th style={{ width: '18%' }}>Art</th>
                    <th>Ort</th>
                    <th className="num" style={{ width: '14%' }}>Dauer</th>
                  </tr>
                </thead>
                <tbody>
                  {days.map(([iso, list], i) => {
                    const uniq = (arr) => [...new Set(arr.filter(Boolean))];
                    const min = list.reduce((m, s) => m + sessionMinutes(s), 0);
                    return (
                      <tr key={iso}>
                        <td className="num">{i + 1}</td>
                        <td>{fmtDE(iso)}</td>
                        <td>{uniq(list.map(sessionArt)).join(', ')}</td>
                        <td>{uniq(list.map((s) => s.location)).join('; ') || '–'}</td>
                        <td className="num">{min ? `${min} min` : '–'}</td>
                      </tr>
                    );
                  })}
                  <tr className="day-total">
                    <td colSpan={4}>Gesamt ({summary.days} Einheiten)</td>
                    <td className="num">{summary.minutes} min</td>
                  </tr>
                </tbody>
              </table>
            )}

            <footer style={{ marginTop: 24, paddingTop: 8, borderTop: '1px solid #c8ccd4', color: '#6b7280' }}>
              Erstellt am {fmtDE(isoToday())} · Fitness
            </footer>
          </>
        )}
      </div>
    </div>
  );
}
