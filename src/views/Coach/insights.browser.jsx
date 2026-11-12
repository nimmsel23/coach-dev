import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import ClientInsights from './ClientInsights.jsx';
import { fixtureState } from './insights.browser-db.js';
import '../../styles.css';

function Fixture() {
  const [uid, setUid] = useState('Klient A');
  window.insightsFixture = fixtureState;
  return <main className="mx-auto max-w-3xl p-3">
    <button type="button" className="min-h-11" onClick={() => setUid('Klient B')}>Klient B wählen</button>
    <h1>{uid}</h1>
    <ClientInsights key={uid} clientUid={uid} />
  </main>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
