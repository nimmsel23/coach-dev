import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import ClientMessages from '../../src/views/Coach/ClientMessages.jsx';
import CoachConversation from '/@client-conversation';
import '../../src/styles.css';
function Fixture() {
  const [side, setSide] = useState('coach');
  const [client, setClient] = useState('client-a');
  return <main className="mx-auto max-w-xl p-3"><nav className="flex flex-wrap gap-2 mb-4">
    <button className="min-h-[44px]" onClick={() => setSide('coach')}>Coach-Seite</button><button className="min-h-[44px]" onClick={() => setSide('client')}>Klienten-Seite</button>
    {side === 'coach' && <label>Klient<select aria-label="Klient wechseln" value={client} onChange={(e) => setClient(e.target.value)}><option value="client-a">Klient A</option><option value="client-b">Klient B</option></select></label>}
  </nav>{side === 'coach' ? <ClientMessages key={client} clientUid={client} /> : <CoachConversation uid="client-a" />}</main>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
