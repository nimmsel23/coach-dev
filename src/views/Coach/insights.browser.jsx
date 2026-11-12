import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import AuthGateModal from '../../components/AuthGateModal.jsx';
import ClientInsights from './ClientInsights.jsx';
import ClientWorkoutsFeed from './ClientWorkoutsFeed.jsx';
import ClientHabitCycle from './ClientHabitCycle.jsx';
import { useCoachUnreadCounts } from './useCoachUnreadCounts.js';
import { fixtureState } from './insights.browser-db.js';
import '../../styles.css';

function UnreadAuthFixture() {
  const [actor, setActor] = useState(null);
  fixtureState.denyUid = true;
  const unread = useCoachUnreadCounts(actor);
  return <div><p>Ungelesen: {unread.total}</p>
    <button onClick={() => setActor('authorized-coach')}>Coach freigeben</button>
    <button onClick={() => setActor(null)}>Abmelden</button>
  </div>;
}
function LoginFixture() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [registering, setRegistering] = useState(false);
  return <><button onClick={() => setOpen(true)}>Login öffnen</button><AuthGateModal open={open} onClose={() => setOpen(false)} productName="VitalOS Coach" requiredAccess
    authEmail={email} setAuthEmail={setEmail} authPassword={password} setAuthPassword={setPassword}
    authRegistering={registering} setAuthRegistering={setRegistering} onSubmit={(event) => event.preventDefault()} onGoogleSignIn={() => {}} /></>;
}
function Fixture() {
  const [uid, setUid] = useState('Klient A');
  window.insightsFixture = fixtureState;
  return <main className="mx-auto max-w-3xl p-3">
    <button type="button" className="min-h-11" onClick={() => setUid('Klient B')}>Klient B wählen</button>
    <h1>{uid}</h1>
    {new URLSearchParams(window.location.search).has('login') ? <LoginFixture /> : new URLSearchParams(window.location.search).has('auth') ? <UnreadAuthFixture /> : new URLSearchParams(window.location.search).has('feed') ? <ClientWorkoutsFeed /> : new URLSearchParams(window.location.search).has('habits') ? <ClientHabitCycle key={uid} clientUid={uid} /> : <ClientInsights key={uid} clientUid={uid} />}
  </main>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
