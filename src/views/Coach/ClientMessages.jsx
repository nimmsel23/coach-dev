import { listClientTrainingPlans } from './trainingProgramStore.js';
import { useEffect, useRef, useState } from 'react';
import { getMacrocycle, getUid, markClientConversationRead, sendClientMessage, watchClientMessages } from '@db';

const millis = (value) => value?.toMillis?.() || 0;
const time = (value) => value?.toDate?.().toLocaleString('de-AT') || 'Wird gesendet…';

export default function ClientMessages({ clientUid }) {
  const uid = getUid();
  const [state, setState] = useState({ messages: [], readers: {}, fromCache: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const [plans, setPlans] = useState([]);
  const [planId, setPlanId] = useState('');
  const [sending, setSending] = useState(false);
  const lastIncoming = useRef(null);
  useEffect(() => {
    let alive = true;
    const stop = watchClientMessages(clientUid, (value) => { if (alive) { setState(value); setLoading(false); } }, (err) => { if (alive) { setError(`Nachrichten konnten nicht geladen werden: ${err.message}`); setLoading(false); } });
    listClientTrainingPlans(clientUid).then((values) => { if (alive) setPlans(values.filter((p) => p.headVersion > 0)); }).catch(() => {});
    return () => { alive = false; stop(); };
  }, [clientUid]);
  const latest = state.messages.filter((message) => message.senderUid !== uid).at(-1)?.id;
  useEffect(() => {
    if (!latest || !lastIncoming.current) return undefined;
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
  }, [clientUid, latest]);
  async function send(event) {
    event.preventDefault(); setSending(true); setError('');
    try {
      const plan = plans.find((item) => item.id === planId);
      let context = null;
      if (plan) {
        const current = (await getMacrocycle(clientUid, plan.id))?.macrocycle;
        if (!current?.published || current.headVersion !== plan.headVersion) throw new Error('Veröffentlichte Planversion ist nicht mehr verfügbar. Öffne die Nachrichten erneut und prüfe den Plan.');
        context = { id: plan.id, name: current.published.name, version: current.headVersion };
      }
      await sendClientMessage(clientUid, text, context);
      setText('');
    } catch (err) { setError(err.message || 'Nachricht konnte nicht gesendet werden.'); }
    finally { setSending(false); }
  }
  return <section className="space-y-4" aria-label="Gespräch mit dem Klienten">
    <header><h3 className="text-lg font-semibold">Nachrichten</h3><p className="text-xs text-fit-dim">Direkter Austausch mit diesem Klienten · letzte 100 Nachrichten</p></header>
    {state.fromCache && <p role="status" className="text-xs text-fit-dim">Lokaler Stand · Verbindung wird abgeglichen.</p>}
    {error && <p role="alert" className="text-sm text-fit-red">{error}</p>}
    {loading ? <p role="status">Nachrichten laden…</p> : !state.messages.length && !error ? <p className="text-sm text-fit-dim">Noch keine Nachrichten. Du kannst etwa einen bereitgestellten Plan besprechen.</p> : null}
    <ol className="space-y-3">{state.messages.map((message) => <li key={message.id} ref={message.id === latest ? lastIncoming : undefined} className={`rounded-xl border border-fit-line p-3 ${message.senderUid === uid ? 'bg-fit-accent/10' : 'bg-fit-bg2'}`}>
      <p className="text-xs text-fit-dim">{message.senderRole === 'coach' ? 'Coach' : 'Klient'} · {time(message.createdAt)}</p>
      {message.plan && <p className="mt-1 text-xs text-fit-accent">Trainingsplan: {message.plan.name} · v{message.plan.version}</p>}
      <p className="mt-2 whitespace-pre-wrap break-words text-sm">{message.body}</p>
      {message.senderUid === uid && <p className="mt-2 text-xs text-fit-dim">{message.pending ? 'Wird gesendet…' : millis(state.readers[clientUid]?.lastReadAt) >= millis(message.createdAt) && millis(message.createdAt) ? 'Vom Klienten gesehen' : 'Gespeichert'}</p>}
    </li>)}</ol>
    <form onSubmit={send} className="space-y-3 rounded-xl border border-fit-line p-3">
      <label className="block text-sm">Bezug<select disabled={sending} value={planId} onChange={(event) => setPlanId(event.target.value)} className="mt-1 block min-h-[44px] w-full rounded-lg border border-fit-line bg-fit-bg p-2"><option value="">Allgemeine Nachricht</option>{plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} · v{plan.headVersion}</option>)}</select></label>
      <label className="block text-sm">Nachricht an den Klienten<textarea value={text} onChange={(event) => setText(event.target.value)} maxLength={4000} rows={4} disabled={sending} className="mt-1 block w-full rounded-lg border border-fit-line bg-fit-bg p-3" /></label>
      <button type="submit" disabled={sending || !text.trim()} className="min-h-[44px] rounded-xl bg-fit-accent px-4 text-sm font-semibold text-fit-bg disabled:opacity-50">{sending ? 'Wird gesendet…' : 'Nachricht senden'}</button>
    </form>
  </section>;
}
