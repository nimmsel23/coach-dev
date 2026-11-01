import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { doc, setDoc } from 'firebase/firestore';
import PlanFeedback from '/@plan-feedback';
import PlanDeliveryOverview from '/@plan-overview';
import { createPlanResponseStore } from '/@plan-response-store';
import { coachDb, clientDb, plan } from './communication-fixture-db.js';
import '../../src/styles.css';
for (const version of [2, 3]) await setDoc(doc(coachDb, `fitness/client-a/macrocycles/plan-a/versions/v${version}`), { number: version, snapshot: { name: plan.name, routines: [] } });
const coach = createPlanResponseStore({ db: coachDb, getActor: () => ({ uid: 'coach-browser' }) });
const client = createPlanResponseStore({ db: clientDb, getActor: () => ({ uid: 'client-a' }) });
function Fixture() {
  const [side, setSide] = useState('client');
  const [version, setVersion] = useState(2);
  return <main className="mx-auto max-w-xl p-3"><nav className="mb-3 flex flex-wrap gap-3"><button onClick={() => setSide('coach')}>Coach-Seite</button><button onClick={() => setSide('client')}>Klienten-Seite</button><button onClick={() => setVersion(version === 2 ? 3 : 2)}>Version wechseln</button></nav>{side === 'coach' && <PlanDeliveryOverview clientUid="client-a" plans={[{ ...plan, headVersion: version, status: 'published' }]} store={coach} onOpen={() => {}} />}<PlanFeedback key={`${side}:${version}`} clientUid="client-a" plan={{ ...plan, headVersion: version }} coach={side === 'coach'} store={side === 'coach' ? coach : client} /></main>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
