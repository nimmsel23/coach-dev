import { useEffect, useMemo, useState } from 'react';
import { Activity, AlertCircle, Clock3, Eye, Users } from 'lucide-react';
import { collectionGroup, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { getAllUserProfiles } from '@db';

const COACH_UIDS = new Set(['59ole36uNpNwml5H6VDYCXyCME92', 'pJay0LeAwDN93Q4NT6i5FNxrQHH2']);
const LABELS = {
  session: 'Training', today: 'Training heute', timer: '6Pack', skills: 'Skills', plan: 'Plan',
  history: 'History', logbuch: 'Logbuch', review: 'Review', muscles: 'Muskeln', readiness: 'Readiness',
  verlauf: 'Verlauf', protokoll: 'Protokoll', learn: 'Lernen', exercises: 'Übungen', anatomy: 'Anatomie',
  quiz: 'Quiz', strength: 'Stärke', atlas: 'Atlas', settings: 'Setup',
  focus: 'Fokus', anamnese: 'Anamnese', inbox: 'Inbox', gate: 'Start', other: 'Sonstiges',
};

function dateKey(date) {
  const values = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Vienna', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date).map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function millis(value) {
  if (typeof value?.toMillis === 'function') return value.toMillis();
  const time = Date.parse(value || '');
  return Number.isFinite(time) ? time : 0;
}

function ago(value) {
  const minutes = Math.max(0, Math.floor((Date.now() - millis(value)) / 60000));
  if (minutes < 1) return 'gerade eben';
  if (minutes < 60) return `vor ${minutes} Min.`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `vor ${hours} Std.`;
  return `vor ${Math.floor(hours / 24)} Tagen`;
}

function membership(profile) {
  const status = profile?.clientStatus || (profile?.authUserOnly ? 'hidden' : 'friend');
  return {
    status,
    visible: Boolean(profile && status !== 'hidden' && !profile.authUserOnly),
  };
}

export default function TractionPanel() {
  const [records, setRecords] = useState([]);
  const [profiles, setProfiles] = useState({});
  const [profilesLoaded, setProfilesLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    let active = true;
    getAllUserProfiles().then((value) => {
      if (active) setProfiles(value || {});
    }).catch(() => {}).finally(() => {
      if (active) setProfilesLoaded(true);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const since = new Date();
    since.setDate(since.getDate() - 6);
    const usageQuery = query(collectionGroup(db, 'tractionDaily'), where('date', '>=', dateKey(since)));
    return onSnapshot(usageQuery, (snapshot) => {
      setRecords(snapshot.docs.map((entry) => ({
        uid: entry.ref.parent.parent?.id || '',
        ...entry.data(),
      })));
      setLoading(false);
      setError('');
    }, (cause) => {
      setLoading(false);
      setError(cause.code === 'permission-denied'
        ? 'Die Firestore-Regeln erlauben diese Coach-Abfrage noch nicht.'
        : 'Die Nutzungsdaten konnten nicht geladen werden.');
    });
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  const stats = useMemo(() => {
    // Alle Konten zählen — Coach-UIDs nicht verstecken (sonst wirkt der Tab leer,
    // obwohl nur Coach-Self-Traffic in tractionDaily liegt).
    const usable = records.filter((record) => record.uid);
    const latest = new Map();
    const sections = new Map();
    const days = new Map();
    let views = 0;
    let opens = 0;
    let coachAccounts = 0;
    for (const record of usable) {
      const previous = latest.get(record.uid);
      if (!previous || millis(record.lastSeenAt) > millis(previous.lastSeenAt)) latest.set(record.uid, record);
      for (const [section, count] of Object.entries(record.sections || {})) {
        const numericCount = Number(count || 0);
        views += numericCount;
        sections.set(section, (sections.get(section) || 0) + numericCount);
      }
      opens += Number(record.appOpens || 0);
      if (!days.has(record.date)) days.set(record.date, new Set());
      days.get(record.date).add(record.uid);
    }
    for (const uid of latest.keys()) {
      if (COACH_UIDS.has(uid)) coachAccounts += 1;
    }
    const latestEntries = [...latest.entries()]
      .map(([uid, record]) => ({ uid, ...record, isCoach: COACH_UIDS.has(uid) }))
      .sort((a, b) => millis(b.lastSeenAt) - millis(a.lastSeenAt));
    let anonymousIndex = 0;
    const latestActivity = latestEntries.map((record) => {
      return {
        ...record,
        anonymousIndex: record.isCoach || membership(profiles[record.uid]).visible ? 0 : ++anonymousIndex,
      };
    });

    return {
      active: [...latest.values()].filter((record) => millis(record.lastSeenAt) >= now - 10 * 60000).length,
      users: latest.size,
      coachAccounts,
      views,
      opens,
      latest: latestActivity,
      sections: [...sections.entries()].sort((a, b) => b[1] - a[1]),
      days: [...days.entries()].sort((a, b) => a[0].localeCompare(b[0])),
      docs: usable.length,
    };
  }, [records, now, profiles]);

  const maxDaily = Math.max(1, ...stats.days.map(([, users]) => users.size));
  const maxSection = Math.max(1, stats.sections[0]?.[1] || 0);

  return (
    <div className="space-y-5 p-4 md:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-fit-accent">Fitness · Live-Nutzung</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Aktivität der Nutzer</h1>
          <p className="mt-1 max-w-2xl text-sm text-fit-muted">Live-Ansicht aus den letzten sieben Tagen, aktualisiert direkt aus Firestore.</p>
        </div>
        <span className={`flex items-center gap-2 rounded-full border px-3 py-2 text-xs ${error ? 'border-fit-red/40 text-fit-red' : loading ? 'border-fit-line text-fit-muted' : 'border-fit-line text-fit-muted'}`}>
          <span className={`h-2 w-2 rounded-full ${error ? 'bg-fit-red' : loading ? 'bg-fit-muted' : 'animate-pulse bg-fit-green'}`} />
          {error ? 'Firestore-Fehler' : loading ? 'Verbindet …' : `${stats.docs} Tagesdatensätze`}
        </span>
      </header>

      {error && <div role="alert" className="flex items-center gap-2 rounded-xl border border-fit-red/30 bg-fit-red/5 p-4 text-sm text-fit-red"><AlertCircle size={17} />{error}</div>}
      {loading ? <div className="card p-6 text-sm text-fit-muted">Nutzung wird geladen …</div> : (
        <>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <Metric icon={Activity} label="Gerade aktiv" value={stats.active} detail="Aktivität in den letzten 10 Min." />
            <Metric icon={Users} label="Nutzer, 7 Tage" value={stats.users} detail={stats.coachAccounts ? `${stats.coachAccounts} davon Coach-Konto` : 'eindeutige Konten'} />
            <Metric icon={Eye} label="Bereichsaufrufe" value={stats.views} detail={`${stats.opens} App-Öffnungen`} />
            <Metric icon={Clock3} label="Nutzungstage" value={stats.days.length} detail="mit Aktivität" />
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
            <section className="card p-4 md:p-5">
              <div className="flex items-center justify-between gap-3"><h2 className="font-semibold">Nutzer pro Tag</h2><span className="text-xs text-fit-muted">eindeutige Konten</span></div>
              {stats.days.length ? <div className="mt-6 flex h-36 items-end gap-2">
                {stats.days.map(([date, users]) => <div key={date} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2"><span className="text-xs tabular-nums text-fit-muted">{users.size}</span><div className="w-full max-w-16 rounded-t-md bg-fit-accent" style={{ height: `${Math.max(6, users.size / maxDaily * 92)}%` }} /><span className="text-[10px] text-fit-muted">{date.slice(5)}</span></div>)}
              </div> : <Empty>Nach den ersten App-Öffnungen erscheinen hier Tageswerte.</Empty>}
            </section>
            <section className="card p-4 md:p-5">
              <h2 className="font-semibold">Beliebte Bereiche</h2>
              {stats.sections.length ? <div className="mt-4 space-y-3">{stats.sections.slice(0, 8).map(([section, count]) => <div key={section}><div className="mb-1 flex justify-between gap-3 text-xs"><span>{LABELS[section] || section}</span><span className="tabular-nums text-fit-muted">{count}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-fit-bg2"><div className="h-full rounded-full bg-fit-accent" style={{ width: `${Math.max(3, count / maxSection * 100)}%` }} /></div></div>)}</div> : <Empty>Noch keine Bereichsaufrufe.</Empty>}
            </section>
          </div>

            <section className="card overflow-hidden">
            <div className="border-b border-fit-line px-4 py-4 md:px-5"><h2 className="font-semibold">Letzte Aktivität</h2></div>
            {stats.latest.length ? <div className="divide-y divide-fit-line">{stats.latest.slice(0, 20).map((record) => {
              const profile = profiles[record.uid];
              const { status, visible } = membership(profile);
              const name = record.isCoach
                ? (profile?.displayName || profile?.email || 'Coach-Konto')
                : visible
                  ? (profile.displayName || profile.email || 'Coach-Kontakt')
                  : `Nicht zugeordnetes Konto · ${record.anonymousIndex}`;
              const relation = record.isCoach
                ? 'Coach (eigenes Konto)'
                : visible
                  ? (status === 'client' ? 'Klient' : 'Freund / Kontakt')
                  : profilesLoaded ? 'Nicht in der Coach-Liste' : 'Coach-Zuordnung lädt …';
              return <div key={record.uid} className="flex items-center justify-between gap-3 px-4 py-3 md:px-5"><div className="min-w-0"><p className="truncate text-sm font-medium">{name}</p><p className="mt-0.5 text-xs text-fit-muted">{relation} · {LABELS[record.lastSection] || record.lastSection || 'Bereich unbekannt'}</p></div><div className="shrink-0 text-right text-xs text-fit-muted">{ago(record.lastSeenAt)}<p className="mt-0.5">{Number(record.sections?.[record.lastSection] || 0)} Aufrufe am {record.date}</p></div></div>;
            })}</div> : <Empty>Im neuen Tracker gibt es noch keine Aktivitäten.</Empty>}
          </section>
          <p className="text-xs leading-relaxed text-fit-muted">Erfasst werden App-Öffnungen, Bereichsaufrufe und Aktivitätszeitpunkte — inkl. Coach-Konten, klar gekennzeichnet. Workout-Inhalte, Übungen und Notizen fließen nicht in diese Ansicht ein.</p>
        </>
      )}
    </div>
  );
}

function Metric({ icon: Icon, label, value, detail }) {
  return <article className="card p-4 md:p-5"><div className="flex items-center justify-between text-fit-muted"><span className="text-xs">{label}</span><Icon size={17} /></div><div className="mt-3 text-3xl font-semibold tabular-nums">{value}</div><p className="mt-1 text-xs text-fit-muted">{detail}</p></article>;
}

function Empty({ children }) {
  return <p className="mt-5 rounded-lg border border-dashed border-fit-line px-4 py-8 text-center text-sm text-fit-muted">{children}</p>;
}
