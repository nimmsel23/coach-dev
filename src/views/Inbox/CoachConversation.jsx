import { useEffect, useRef, useState } from 'react';
import { markCoachConversationRead, sendCoachMessage, watchCoachMessages } from '../../lib/coachConversation.js';

const millis = (value) => value?.toMillis?.() || 0;
const time = (value) => value?.toDate?.().toLocaleString('de-AT') || 'Wird gesendet…';

export default function CoachConversation({ uid }) {
  const [state, setState] = useState({ messages: [], readers: {}, fromCache: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const [plan, setPlan] = useState(null);
  const [sending, setSending] = useState(false);
  const lastIncoming = useRef(null);
  useEffect(() => {
    let alive = true;
    const stop = watchCoachMessages((value) => { if (alive) { setState(value); setLoading(false); } }, (err) => { if (alive) { setError(`Nachrichten konnten nicht geladen werden: ${err.message}`); setLoading(false); } });
    return () => { alive = false; stop(); };
  }, [uid]);
  const latest = state.messages.filter((message) => message.senderUid !== uid).at(-1)?.id;
  useEffect(() => {
    if (!latest || !lastIncoming.current) return undefined;
    let visible = false;
    let marked = false;
    const mark = () => {
      if (!marked && visible && document.visibilityState === 'visible') {
        marked = true;
        markCoachConversationRead().catch(() => { marked = false; setError('Lesestand konnte nicht gespeichert werden.'); });
      }
    };
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; mark(); }, { threshold: 0.05 });
    observer.observe(lastIncoming.current);
    document.addEventListener('visibilitychange', mark);
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', mark); };
  }, [latest]);
  async function send(event) {
    event.preventDefault(); setSending(true); setError('');
    try { await sendCoachMessage(text, plan); setText(''); setPlan(null); }
    catch (err) { setError(err.message || 'Nachricht konnte nicht gesendet werden.'); }
    finally { setSending(false); }
  }
  const seenAt = Math.max(0, ...Object.entries(state.readers).filter(([reader]) => reader !== uid).map(([, value]) => millis(value.lastReadAt)));
  return <section className="space-y-4" aria-label="Gespräch mit deinem Coach">
    {state.fromCache && <p role="status" className="text-sm text-fit-dim">Lokaler Stand · Verbindung wird abgeglichen.</p>}
    {error && <p role="alert" className="text-sm text-fit-red">{error}</p>}
    {loading ? <p role="status">Nachrichten laden…</p> : !state.messages.length && !error ? <p className="card p-4 text-sm">Noch keine Nachrichten. Stelle deinem Coach eine Frage zu deinem Training oder Plan.</p> : null}
    <ol className="space-y-3">{state.messages.map((message) => <li key={message.id} ref={message.id === latest ? lastIncoming : undefined} className={`rounded-xl border border-fit-line p-4 ${message.senderUid === uid ? 'bg-fit-accent/10' : 'bg-fit-bg2'}`}>
      <p className="text-xs text-fit-dim">{message.senderRole === 'coach' ? 'Dein Coach' : 'Du'} · {time(message.createdAt)}</p>
      {message.plan && <p className="mt-1 text-xs text-fit-accent">Trainingsplan: {message.plan.name} · v{message.plan.version}</p>}
      <p className="mt-2 whitespace-pre-wrap break-words text-sm">{message.body}</p>
      {message.senderUid === uid ? <p className="mt-2 text-xs text-fit-dim">{message.pending ? 'Wird gesendet…' : millis(message.createdAt) && seenAt >= millis(message.createdAt) ? 'Vom Coach gesehen' : 'Gespeichert'}</p> : message.plan && <button type="button" disabled={sending} onClick={() => setPlan(message.plan)} className="mt-2 min-h-[44px] text-sm text-fit-accent">Zu diesem Plan antworten</button>}
    </li>)}</ol>
    <form onSubmit={send} className="space-y-3 rounded-xl border border-fit-line p-4">
      {plan && <p className="text-sm">Bezug: {plan.name} · v{plan.version} <button className="min-h-[44px] text-fit-accent" type="button" disabled={sending} onClick={() => setPlan(null)}>Bezug entfernen</button></p>}
      <label className="block text-sm">Nachricht an deinen Coach<textarea value={text} onChange={(event) => setText(event.target.value)} maxLength={4000} rows={4} disabled={sending} className="mt-2 block w-full rounded-xl border border-fit-line bg-fit-bg p-3" /></label>
      <button type="submit" disabled={sending || !text.trim()} className="min-h-[44px] rounded-xl bg-fit-accent px-4 text-sm font-semibold text-fit-bg disabled:opacity-50">{sending ? 'Wird gesendet…' : 'Nachricht senden'}</button>
    </form>
  </section>;
}

