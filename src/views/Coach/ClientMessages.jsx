import { readConversationDraft, saveConversationDraft } from '../../lib/conversationDrafts.js';
import { listClientTrainingPlans } from './trainingProgramStore.js';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { getMacrocycle, loadClientMessagePlan, getUid, markClientConversationRead, sendClientMessage, watchClientMessages } from '@db';
const PlanDocument = lazy(() => import('@plan/views/Plan/PlanDocument.jsx'));

const millis = (value) => value?.toMillis?.() || 0;
const time = (value) => value?.toDate?.().toLocaleString('de-AT') || 'Wird gesendet…';

export default function ClientMessages({ clientUid }) {
  const uid = getUid();
  const [state, setState] = useState({ messages: [], readers: {}, fromCache: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [initialDraft] = useState(() => readConversationDraft(uid, clientUid));
  const [text, setText] = useState(initialDraft.text);
  const [draftSaved, setDraftSaved] = useState(true);
  const [planView, setPlanView] = useState(null);
  const [openingPlan, setOpeningPlan] = useState(false);
  const subscription = useRef(null);
  const bottom = useRef(null);
  const nearBottom = useRef(true);
  const initialScroll = useRef(true);
  const ownSend = useRef(false);
  const [plans, setPlans] = useState([]);
  const [plan, setPlan] = useState(initialDraft.plan);
  const [sending, setSending] = useState(false);
  const lastIncoming = useRef(null);
  useEffect(() => {
    let alive = true;
    const stop = watchClientMessages(clientUid, (value) => { if (alive) { setState(value); setLoading(false); } }, (err) => { if (alive) { setError(`Nachrichten konnten nicht geladen werden: ${err.message}`); setLoading(false); } });
    listClientTrainingPlans(clientUid).then((values) => { if (alive) setPlans(values.filter((p) => p.headVersion > 0)); }).catch(() => {});
    subscription.current = stop;
    return () => { alive = false; subscription.current = null; stop.unsubscribe(); };
  }, [clientUid]);
  const latest = state.messages.filter((message) => message.senderUid !== uid).at(-1)?.id;
  useEffect(() => {
    if (planView || !latest || !lastIncoming.current) return undefined;
    let visible = false;
    let marked = false;
    const mark = () => {
      if (!marked && visible && document.visibilityState === 'visible') {
        marked = true;
        markClientConversationRead(clientUid).catch(() => { marked = false; setError('Lesestand konnte nicht gespeichert werden.'); });
      }
    };
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; mark(); }, { threshold: 0.05 });
    observer.observe(lastIncoming.current);
    document.addEventListener('visibilitychange', mark);
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', mark); };
  }, [clientUid, latest, planView]);
  useEffect(() => { setDraftSaved(saveConversationDraft(uid, clientUid, { text, plan })); }, [uid, clientUid, text, plan]);
  const lastId = state.messages.at(-1)?.id;
  useEffect(() => {
    if (planView || !bottom.current) return undefined;
    const observer = new IntersectionObserver(([entry]) => { nearBottom.current = entry.isIntersecting; });
    observer.observe(bottom.current);
    return () => observer.disconnect();
  }, [planView]);
  useEffect(() => {
    if (!planView && lastId && (initialScroll.current || nearBottom.current || ownSend.current)) { bottom.current?.scrollIntoView({ block: 'end' }); initialScroll.current = false; ownSend.current = false; }
  }, [lastId, planView]);
  async function older() {
    try { setError(''); await subscription.current?.loadOlder(); }
    catch { setError('Ältere Nachrichten konnten nicht geladen werden. Prüfe die Verbindung und versuche es erneut.'); }
  }
  async function openPlan(reference) {
    setOpeningPlan(true); setError('');
    try { setPlanView(await loadClientMessagePlan(clientUid, reference)); }
    catch (err) { setError(err.message); }
    finally { setOpeningPlan(false); }
  }
  async function send(event) {
    event.preventDefault(); setSending(true); setError('');
    try {
      let context = null;
      if (plan) {
        const current = (await getMacrocycle(clientUid, plan.id))?.macrocycle;
        if (!current?.published || current.headVersion !== plan.version) throw new Error('Veröffentlichte Planversion ist nicht mehr verfügbar. Öffne die Nachrichten erneut und prüfe den Plan.');
        context = { id: plan.id, name: current.published.name, version: current.headVersion };
      }
      await sendClientMessage(clientUid, text, context);
      saveConversationDraft(uid, clientUid, { text: '', plan: null }); ownSend.current = true; setText(''); setPlan(null);
    } catch (err) { setError(err.message || 'Nachricht konnte nicht gesendet werden.'); }
    finally { setSending(false); }
  }
  if (planView) return <div className="space-y-4"><button type="button" className="min-h-[44px] rounded-xl border border-fit-line px-4" onClick={() => setPlanView(null)}>← Zurück zu den Nachrichten</button><Suspense fallback={<p role="status">Plan lädt…</p>}><PlanDocument plan={planView} /></Suspense></div>;
  return <section className="space-y-4" aria-label="Gespräch mit dem Klienten">
    <header><h3 className="text-lg font-semibold">Nachrichten</h3><p className="text-xs text-fit-dim">Direkter Austausch mit diesem Klienten</p></header>
    {state.fromCache && <p role="status" className="text-xs text-fit-dim">Lokaler Stand · Verbindung wird abgeglichen.</p>}
    {error && <p role="alert" className="text-sm text-fit-red">{error}</p>}
    {loading ? <p role="status">Nachrichten laden…</p> : !state.messages.length && !error ? <p className="text-sm text-fit-dim">Noch keine Nachrichten. Du kannst etwa einen bereitgestellten Plan besprechen.</p> : null}
    {state.hasMore && <button type="button" disabled={state.loadingOlder} onClick={older} className="min-h-[44px] rounded-xl border border-fit-line px-4 text-sm">{state.loadingOlder ? 'Ältere Nachrichten laden…' : 'Ältere Nachrichten laden'}</button>}
    <ol className="space-y-3">{state.messages.map((message) => <li key={message.id} ref={message.id === latest ? lastIncoming : undefined} className={`rounded-xl border border-fit-line p-3 ${message.senderUid === uid ? 'bg-fit-accent/10' : 'bg-fit-bg2'}`}>
      <p className="text-xs text-fit-dim">{message.senderRole === 'coach' ? 'Coach' : 'Klient'} · {time(message.createdAt)}</p>
      {message.plan && <button type="button" disabled={openingPlan} onClick={() => openPlan(message.plan)} className="mt-1 min-h-[44px] text-left text-xs text-fit-accent">Plan öffnen: {message.plan.name} · v{message.plan.version}</button>}
      <p className="mt-2 whitespace-pre-wrap break-words text-sm">{message.body}</p>
      {message.senderUid === uid && <p className="mt-2 text-xs text-fit-dim">{message.pending ? 'Wird gesendet…' : millis(state.readers[clientUid]?.lastReadAt) >= millis(message.createdAt) && millis(message.createdAt) ? 'Vom Klienten gesehen' : 'Gespeichert'}</p>}
    </li>)}</ol><div ref={bottom} />
    {!draftSaved && <p role="alert" className="text-sm text-fit-red">Entwurf kann auf diesem Gerät nicht gespeichert werden. Der Text bleibt nur im offenen Fenster.</p>}
    {draftSaved && (text || plan) && <p role="status" className="text-xs text-fit-dim">Entwurf auf diesem Gerät gesichert.</p>}
    <form onSubmit={send} className="space-y-3 rounded-xl border border-fit-line p-3">
      <label className="block text-sm">Bezug<select disabled={sending} value={plan ? `${plan.id}:${plan.version}` : ''} onChange={(event) => { const chosen = plans.find((item) => `${item.id}:${item.headVersion}` === event.target.value); setPlan(chosen ? { id: chosen.id, name: chosen.name, version: chosen.headVersion } : null); }} className="mt-1 block min-h-[44px] w-full rounded-lg border border-fit-line bg-fit-bg p-2"><option value="">Allgemeine Nachricht</option>{plan && !plans.some((p) => p.id === plan.id && p.headVersion === plan.version) && <option value={`${plan.id}:${plan.version}`}>Gespeicherter Bezug: {plan.name} · v{plan.version} (bitte prüfen)</option>}{plans.map((item) => <option key={item.id} value={`${item.id}:${item.headVersion}`}>{item.name} · v{item.headVersion}</option>)}</select></label>
      <label className="block text-sm">Nachricht an den Klienten<textarea value={text} onChange={(event) => setText(event.target.value)} maxLength={4000} rows={4} disabled={sending} className="mt-1 block w-full rounded-lg border border-fit-line bg-fit-bg p-3" /></label>
      <button type="submit" disabled={sending || !text.trim()} className="min-h-[44px] rounded-xl bg-fit-accent px-4 text-sm font-semibold text-fit-bg disabled:opacity-50">{sending ? 'Wird gesendet…' : 'Nachricht senden'}</button>
    </form>
  </section>;
}
