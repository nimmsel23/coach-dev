import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, CheckCircle2, ClipboardList, Download, FolderOpen, Plus, RefreshCw, Send, Users } from 'lucide-react';
import PlanEditor from '@plan/views/Plan/PlanEditor.jsx';
import { filterCatalog, mergeCatalog } from '@plan/views/Plan/lib/catalog.js';
import { importClientForge } from '@plan/views/Plan/lib/legacyPlan.js';

const base = new URL('../api/coach/local/', window.location.href);
const path = (suffix) => new URL(suffix, base).href;
const searchCatalog = async (q) => ({ results: filterCatalog(mergeCatalog([]), { q }).slice(0, 80) });
const input = 'min-h-[48px] w-full rounded-xl border border-fit-line bg-fit-bg p-3 text-base';
const button = 'min-h-[44px] rounded-xl border border-fit-line px-4 py-2 text-sm font-semibold disabled:opacity-40';
async function api(suffix, method = 'GET', body) {
  const response = await fetch(path(suffix), { method, cache: 'no-store', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const value = await response.json();
  if (!response.ok) throw new Error(value.detail || `Anfrage fehlgeschlagen (${response.status})`);
  return value;
}
const fmt = (date) => date ? new Date(date).toLocaleString('de-AT', { dateStyle: 'short', timeStyle: 'short' }) : '';

export default function LocalCoachApp() {
  const [clients, setClients] = useState([]);
  const [clientId, setClientId] = useState('');
  const [query, setQuery] = useState('');
  const [plans, setPlans] = useState([]);
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
  const sequence = useRef(0);
  const client = clients.find((item) => item.id === clientId);
  const clientPath = `clients/${encodeURIComponent(clientId)}`;
  const planPath = (id) => `${clientPath}/plans/${encodeURIComponent(id)}`;

  async function loadClients() {
    setLoading(true); setError('');
    try { const data = await api('clients'); setClients(data.clients); }
    catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { loadClients(); }, []);
  useEffect(() => {
    const mine = ++sequence.current;
    setPlans([]); setHistory(null); setReleasing(null); setCreating(false); setError(''); setNotice('');
    if (!clientId) return;
    setLoading(true);
    api(`${clientPath}/plans`).then((data) => { if (mine === sequence.current) setPlans(data.plans); }).catch((err) => { if (mine === sequence.current) setError(err.message); }).finally(() => { if (mine === sequence.current) setLoading(false); });
  }, [clientId]);
  async function reload() { setPlans((await api(`${clientPath}/plans`)).plans); }
  async function act(fn) {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try { await fn(); } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  async function create(body) {
    const plan = await api(`${clientPath}/plans`, 'POST', body);
    setCreating(false); setName(''); setEditing(plan); await reload();
  }
  function returnToPlans() { setEditing(null); act(reload); }
  const filtered = clients.filter((item) => item.name.toLowerCase().includes(query.toLowerCase()));

  return <div className="min-h-screen bg-fit-bg text-fit-ink">
    <header className="border-b border-fit-line px-4 py-5 sm:px-8"><div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4"><div><a href="./" className="text-xs font-semibold uppercase tracking-widest text-fit-accent">Coach · Lokal</a><h1 className="mt-1 text-2xl font-bold tracking-tight">Trainingspläne gestalten</h1><p className="mt-2 text-sm text-fit-muted">Deine Klienten. Deine Pläne. Lokal arbeiten und bewusst übergeben.</p></div><span className="flex items-center gap-2 rounded-full border border-fit-line px-3 py-2 text-xs text-fit-muted"><CheckCircle2 size={15} className="text-fit-accent" /> Ohne Firebase-Anmeldung</span></div></header>
    <div className="mx-auto grid max-w-7xl gap-6 p-4 pb-20 sm:p-8 lg:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="min-w-0"><div className="mb-3 flex items-center justify-between"><h2 className="flex items-center gap-2 font-semibold"><Users size={17} /> Klienten</h2><button disabled={busy || !!editing} aria-label="Klienten aktualisieren" onClick={loadClients} className="min-h-[44px] p-3"><RefreshCw size={16} /></button></div><input aria-label="Klienten suchen" placeholder="Klienten suchen…" value={query} onChange={(e) => setQuery(e.target.value)} className={input} /><div className="mt-3 max-h-64 space-y-2 overflow-y-auto lg:max-h-[65vh]">{filtered.map((item) => <button key={item.id} disabled={busy || !!editing} aria-pressed={clientId === item.id} onClick={() => setClientId(item.id)} className={`min-h-[64px] w-full rounded-xl border p-3 text-left disabled:opacity-50 ${clientId === item.id ? 'border-fit-accent bg-fit-accent/10' : 'border-fit-line bg-fit-card'}`}><span className="block font-semibold">{item.name}</span><span className="mt-1 block text-xs text-fit-muted">{item.canDeliver ? 'App-Zuordnung vorhanden' : 'Lokale Planarbeit möglich'}</span></button>)}</div>{!loading && !filtered.length && <p className="mt-4 text-sm text-fit-muted">{clients.length ? 'Kein Treffer.' : 'Noch keine Klienten in der bestehenden Klientenverwaltung.'}</p>}</aside>
      <main className="min-w-0 space-y-5">
        {error && <div role="alert" className="rounded-xl border border-fit-red/40 bg-fit-card p-4 text-sm text-fit-red">{error}<button className="ml-3 underline" disabled={busy || !!editing} onClick={() => clientId ? act(reload) : loadClients()}>Erneut versuchen</button></div>}
        {notice && <p role="status" className="rounded-xl border border-fit-accent/30 bg-fit-accent/10 p-4 text-sm">{notice}</p>}
        {!client && <section className="rounded-2xl border border-fit-line bg-fit-card p-8"><FolderOpen className="mb-4 text-fit-accent" size={30} /><h2 className="text-xl font-semibold">Ein gemeinsamer Arbeitsplatz</h2><p className="mt-3 max-w-lg text-sm leading-relaxed text-fit-muted">Wähle einen Klienten und erstelle seinen Trainingsplan. Entwürfe und Versionen bleiben auf deinem Laptop. Eine freigegebene Version kannst du herunterladen oder gezielt in seine App senden.</p>{loading && <p role="status" className="mt-4 text-sm">Klienten werden geladen…</p>}</section>}
        {client && <><header><p className="text-xs font-semibold uppercase tracking-widest text-fit-accent">Trainingsplanung</p><h2 className="mt-1 text-2xl font-semibold">{client.name}</h2></header>
          {editing ? <PlanEditor key={`${clientId}:${editing.id}`} plan={editing} uid={clientId} actorUid="local-coach" draftNamespace="laptop" catalogSearch={searchCatalog} templates={[]} saveDraft={(draft) => api(planPath(editing.id), 'PUT', draft)} onClose={returnToPlans} onSaved={async () => { setEditing(null); setNotice('Entwurf lokal gesichert. Noch nicht an den Klienten gesendet.'); await reload(); }} /> : <>
            <section className="rounded-2xl border border-fit-line bg-fit-card p-4 sm:p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="flex items-center gap-2 font-semibold"><ClipboardList size={19} /> Trainingspläne</h3><p className="mt-1 text-sm text-fit-muted">Erstellen → lokal sichern → Version freigeben → übergeben</p></div><button className={`${button} bg-fit-accent text-fit-bg`} disabled={busy} onClick={() => setCreating(!creating)}><Plus size={15} className="mr-1 inline" /> Neuer Trainingsplan</button></div>
              {creating && <form onSubmit={(e) => { e.preventDefault(); act(() => create({ name: name.trim(), totalWeeks: 10, routines: [] })); }} className="mt-4 space-y-3"><label className="block text-sm">Planname<input aria-label="Neuer Planname" autoFocus maxLength={80} value={name} onChange={(e) => setName(e.target.value)} className={`${input} mt-1`} placeholder="z. B. Kraftaufbau · 3 Tage" /></label><button disabled={busy || !name.trim()} className={`${button} bg-fit-accent text-fit-bg`}>Plan gestalten</button></form>}
              {client.hasLegacyPlan && <button disabled={busy} className="mt-4 min-h-[44px] text-left text-sm text-fit-accent underline" onClick={() => act(async () => { const old = await api(`${clientPath}/legacy`); const body = importClientForge(old); if (!body.routines.length) throw new Error('Der bestehende ClientForge-Plan enthält keine Einheiten.'); await create(body); })}>Bestehenden ClientForge-Plan übernehmen</button>}
            </section>
            {loading && <p role="status" className="text-sm text-fit-muted">Pläne werden geladen…</p>}
            {!loading && !plans.length && <p className="rounded-xl border border-dashed border-fit-line p-6 text-sm text-fit-muted">Noch kein Trainingsplan. Starte leer oder übernimm den vorhandenen Plan.</p>}
            {plans.map((plan) => { const unpublished = !!plan.published && JSON.stringify({ name: plan.name, description: plan.description, totalWeeks: plan.totalWeeks, routines: plan.routines }) !== JSON.stringify(plan.published); const delivered = plan.delivery?.localVersion === plan.headVersion; return <article key={plan.id} className="space-y-4 rounded-2xl border border-fit-line bg-fit-card p-5"><div><p className="text-xs font-semibold text-fit-accent">{plan.headVersion ? `Freigegeben · Version ${plan.headVersion}` : 'Lokaler Entwurf'}{unpublished ? ' · neue Änderungen im Entwurf' : ''}</p><h3 className="mt-1 text-xl font-semibold">{plan.name}</h3><p className="mt-2 text-xs text-fit-muted">{plan.totalWeeks} Wochen · {plan.routines.length} Trainingstage · {plan.routines.reduce((n, d) => n + d.exercises.length, 0)} Übungen</p>{plan.description && <p className="mt-3 whitespace-pre-wrap text-sm text-fit-muted">{plan.description}</p>}<p className="mt-3 text-xs text-fit-dim">Gesichert {fmt(plan.updatedAt)}</p></div>
              <div className="flex flex-wrap gap-2"><button className={`${button} bg-fit-accent text-fit-bg`} disabled={busy} onClick={() => act(async () => setEditing(await api(planPath(plan.id))))}>Bearbeiten</button><button className={button} disabled={busy || (!!plan.published && !unpublished)} onClick={() => { setReleasing(plan); setMessage(''); }}>Version freigeben</button><button className={button} disabled={busy} onClick={() => act(async () => setHistory({ plan, versions: (await api(`${planPath(plan.id)}/versions`)).versions }))}>Versionen</button><a className={`${button} inline-flex items-center gap-1`} href={path(`${planPath(plan.id)}/export/md`)}><Download size={14} /> Markdown</a><a className={`${button} inline-flex items-center`} href={path(`${planPath(plan.id)}/export/json`)}>JSON</a></div>
              {!!plan.headVersion && <div className="flex flex-wrap items-center justify-between gap-3 border-t border-fit-line pt-4"><p className="text-xs text-fit-muted">{delivered ? `Version ${plan.headVersion} an die App übergeben · ${fmt(plan.delivery.at)}` : client.canDeliver ? `Version ${plan.headVersion} bereit zur Übergabe` : 'Für App-Versand fehlt noch die UID-Zuordnung in der Klientenverwaltung.'}{unpublished && ' Versand verwendet die freigegebene Version.'}</p><button className={`${button} flex items-center gap-2`} disabled={busy || !client.canDeliver || delivered} onClick={() => { if (!confirm(`Freigegebene Version ${plan.headVersion} von „${plan.published.name}“ an ${client.name} senden?`)) return; act(async () => { await api(`${planPath(plan.id)}/deliver`, 'POST', { version: plan.headVersion }); await reload(); setNotice('Plan an die Klienten-App übergeben.'); }); }}><Send size={14} /> An Klienten senden</button></div>}
              {releasing?.id === plan.id && <form className="space-y-3 border-t border-fit-line pt-4" onSubmit={(e) => { e.preventDefault(); act(async () => { await api(`${planPath(plan.id)}/versions`, 'POST', { expectedUpdatedAt: plan.updatedAt, message }); setReleasing(null); await reload(); setNotice('Version lokal freigegeben. Du kannst sie jetzt übergeben.'); }); }}><label className="block text-sm">Was ist neu?<input aria-label="Versionshinweis" className={`${input} mt-1`} value={message} maxLength={200} onChange={(e) => setMessage(e.target.value)} placeholder="z. B. Woche 3: mehr Volumen" /></label><button disabled={busy} className={`${button} bg-fit-accent text-fit-bg`}>Lokale Version freigeben</button><button type="button" className={button} onClick={() => setReleasing(null)}>Abbrechen</button></form>}
            </article>; })}
            {history && <section aria-label="Planversionen" className="space-y-3 rounded-2xl border border-fit-accent/30 bg-fit-card p-5"><div className="flex items-center justify-between"><h3 className="font-semibold">Versionen · {history.plan.name}</h3><button className={button} onClick={() => setHistory(null)}>Schließen</button></div>{!history.versions.length && <p className="text-sm text-fit-muted">Noch keine Version freigegeben.</p>}{history.versions.map((v) => <div key={v.number} className="rounded-xl border border-fit-line p-3"><p className="font-semibold">Version {v.number} · {v.message}</p><p className="mt-1 text-xs text-fit-muted">{fmt(v.createdAt)} · {v.snapshot.routines.length} Trainingstage</p><button className="mt-2 min-h-[44px] text-sm text-fit-accent underline" disabled={busy} onClick={() => { if (!confirm(`Version ${v.number} als neuen Arbeitsstand übernehmen?`)) return; act(async () => { const restored = await api(planPath(history.plan.id), 'PUT', { ...v.snapshot, expectedUpdatedAt: history.plan.updatedAt }); setHistory(null); setEditing(restored); await reload(); }); }}>Als Entwurf wiederherstellen</button></div>)}</section>}
          </>}
        </>}
      </main>
    </div>
  </div>;
}
