import { useEffect, useMemo, useState } from 'react';
import { Activity, AlertCircle, Clock3, Eye, Users } from 'lucide-react';
import { watchFitnessTraction } from '../../lib/traction.js';

const COACH_UIDS = new Set(['59ole36uNpNwml5H6VDYCXyCME92', 'pJay0LeAwDN93Q4NT6i5FNxrQHH2']);
const SECTION_LABELS = {
  session: 'Training', today: 'Training heute', timer: '6Pack', skills: 'Skills', plan: 'Plan',
  history: 'History', logbuch: 'Logbuch', review: 'Review', muscles: 'Muskeln', readiness: 'Readiness',
  verlauf: 'Verlauf', protokoll: 'Protokoll', learn: 'Lernen', exercises: 'Übungen', anatomy: 'Anatomie',
  quiz: 'Quiz', strength: 'Stärke', atlas: 'Atlas', touren: 'Radtouren', settings: 'Setup',
  focus: 'Fokus', anamnese: 'Anamnese', inbox: 'Inbox', gate: 'Start', other: 'Sonstiges',
};

function millis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function ago(value) {
  const minutes = Math.max(0, Math.floor((Date.now() - millis(value)) / 60000));
  if (minutes < 1) return 'gerade eben';
  if (minutes < 60) return `vor ${minutes} Min.`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `vor ${hours} Std.`;
  return `vor ${Math.floor(hours / 24)} Tagen`;
}

export default function TractionPanel() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());

  useEffect(() => watchFitnessTraction((next) => {
    setRecords(next);
    setLoading(false);
    setError('');
  }, (err) => {
    setError(err?.code === 'permission-denied'
      ? 'Firestore-Regeln verweigern den Coach-Zugriff auf Nutzungsdaten.'
      : 'Nutzungsdaten konnten nicht geladen werden.');
    setLoading(false);
  }), []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  const stats = useMemo(() => {
    const clients = records.filter((record) => record.uid && !COACH_UIDS.has(record.uid));
    const activeCutoff = now - 10 * 60 * 1000;
    const latestByUser = new Map();
    const sectionCounts = new Map();
    const daily = new Map();
    let views = 0;
    let opens = 0;
    for (const record of clients) {
      const seen = millis(record.lastSeenAt);
      const previous = latestByUser.get(record.uid);
      if (!previous || seen > millis(previous.lastSeenAt)) latestByUser.set(record.uid, record);
      views += Object.values(record.sections || {}).reduce((sum, count) => sum + Number(count || 0), 0);
      opens += Number(record.appOpens || 0);
      for (const [section, count] of Object.entries(record.sections || {})) {
        sectionCounts.set(section, (sectionCounts.get(section) || 0) + Number(count || 0));
      }
      if (!daily.has(record.date)) daily.set(record.date, new Set());
      daily.get(record.date).add(record.uid);
    }
    return {
      active: [...latestByUser.values()].filter((record) => millis(record.lastSeenAt) >= activeCutoff).length,
      users: latestByUser.size,
      views,
      opens,
      latest: [...latestByUser.entries()].map(([uid, record]) => ({ uid, ...record }))
        .sort((a, b) => millis(b.lastSeenAt) - millis(a.lastSeenAt)),
      sections: [...sectionCounts].sort((a, b) => b[1] - a[1]),
      daily: [...daily].sort((a, b) => a[0].localeCompare(b[0])),
    };
  }, [records, now]);

  const maxDaily = Math.max(1, ...stats.daily.map(([, users]) => users.size));

  return (
    <section className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold text-fit-accent">Nutzung · live</p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-fit-ink">Wie Fitness verwendet wird</h2>
          <p className="mt-1 max-w-xl text-sm text-fit-dim">Aktivität der letzten sieben Tage. Die Ansicht aktualisiert sich direkt aus Firestore.</p>
        </div>
        <span className="flex items-center gap-2 rounded-full border border-fit-line bg-fit-card px-3 py-2 text-xs text-fit-dim">
          <span className="h-2 w-2 animate-pulse rounded-full bg-fit-green" /> Live-Verbindung
        </span>
      </header>

      {error && <div role="alert" className="flex items-center gap-2 rounded-xl border border-fit-red/30 bg-fit-red/5 p-4 text-sm text-fit-red"><AlertCircle size={17} />{error}</div>}

      {loading ? <div className="card p-8 text-sm text-fit-dim">Nutzungsdaten werden geladen …</div> : (
        <>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <Metric icon={Activity} label="Gerade aktiv" value={stats.active} detail="zuletzt aktiv in 10 Min." accent />
            <Metric icon={Users} label="Nutzer, 7 Tage" value={stats.users} detail="eindeutige Konten" />
            <Metric icon={Eye} label="Bereichsaufrufe" value={stats.views} detail={`${stats.opens} App-Öffnungen`} />
            <Metric icon={Clock3} label="Datentage" value={stats.daily.length} detail="mit Nutzung" />
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
            <div className="card p-4 md:p-5">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-semibold text-fit-ink">Eindeutige Nutzer pro Tag</h3>
                <span className="text-xs text-fit-dim">letzte 7 Tage</span>
              </div>
              {stats.daily.length ? <div className="mt-6 flex h-36 items-end gap-2">
                {stats.daily.map(([date, users]) => (
                  <div key={date} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2">
                    <span className="text-xs tabular-nums text-fit-dim">{users.size}</span>
                    <div className="w-full max-w-16 rounded-t-md bg-fit-accent/85" style={{ height: `${Math.max(6, users.size / maxDaily * 92)}%` }} />
                    <span className="text-[10px] text-fit-dim">{date.slice(5)}</span>
                  </div>
                ))}
              </div> : <Empty>Noch keine Nutzung erfasst.</Empty>}
            </div>

            <div className="card p-4 md:p-5">
              <h3 className="font-semibold text-fit-ink">Beliebte Bereiche</h3>
              {stats.sections.length ? <div className="mt-4 space-y-3">
                {stats.sections.slice(0, 8).map(([section, count]) => (
                  <div key={section}>
                    <div className="mb-1 flex justify-between text-xs"><span className="text-fit-ink">{SECTION_LABELS[section] || section}</span><span className="tabular-nums text-fit-dim">{count}</span></div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-fit-bg2"><div className="h-full rounded-full bg-fit-accent" style={{ width: `${Math.max(3, count / Math.max(1, stats.sections[0][1]) * 100)}%` }} /></div>
                  </div>
                ))}
              </div> : <Empty>Noch keine Bereichsaufrufe.</Empty>}
            </div>
          </div>

          <div className="card overflow-hidden">
            <div className="border-b border-fit-line px-4 py-4 md:px-5"><h3 className="font-semibold text-fit-ink">Letzte Aktivität</h3></div>
            {stats.latest.length ? <div className="divide-y divide-fit-line">
              {stats.latest.slice(0, 20).map((record) => (
                <div key={record.uid} className="flex items-center justify-between gap-3 px-4 py-3 md:px-5">
                  <div className="min-w-0"><div className="truncate text-sm font-medium text-fit-ink">Nutzer · {record.uid.slice(0, 7)}</div><div className="mt-0.5 text-xs text-fit-dim">{SECTION_LABELS[record.lastSection] || record.lastSection || 'Bereich unbekannt'}</div></div>
                  <div className="shrink-0 text-right text-xs text-fit-dim">{ago(record.lastSeenAt)}<div className="mt-0.5">{Number(record.sections?.[record.lastSection] || 0)} Aufrufe heute</div></div>
                </div>
              ))}
            </div> : <Empty>Nach den ersten App-Öffnungen erscheinen Nutzer hier.</Empty>}
          </div>
          <p className="text-xs leading-relaxed text-fit-dim">Erfasst werden nur App-Öffnungen, Bereichsaufrufe und letzter Aktivitätszeitpunkt. Trainingsdaten, Übungen und Notizen werden nicht in die Nutzungsübersicht übernommen.</p>
        </>
      )}
    </section>
  );
}

function Metric({ icon: Icon, label, value, detail, accent = false }) {
  return <div className="card p-4 md:p-5"><div className="flex items-center justify-between text-fit-dim"><span className="text-xs">{label}</span><Icon size={17} className={accent ? 'text-fit-accent' : ''} /></div><div className="mt-3 text-3xl font-bold tabular-nums text-fit-ink">{value}</div><div className="mt-1 text-xs text-fit-dim">{detail}</div></div>;
}

function Empty({ children }) {
  return <p className="mt-5 rounded-lg border border-dashed border-fit-line px-4 py-8 text-center text-sm text-fit-dim">{children}</p>;
}
