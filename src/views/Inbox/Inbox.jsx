import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../../firebase.js';
import CoachConversation from './CoachConversation.jsx';

export default function Inbox() {
  const [uid, setUid] = useState(null);
  const [ready, setReady] = useState(false);
  useEffect(() => onAuthStateChanged(auth, (user) => { setUid(user?.uid || null); setReady(true); }), []);
  return <div className="space-y-5 pb-24">
    <header><h1 className="text-2xl font-bold">Nachrichten</h1><p className="mt-1 text-sm text-fit-dim">Dein direkter Austausch mit dem Coach</p></header>
    {!ready ? <p role="status">Anmeldung prüfen…</p> : uid ? <CoachConversation key={uid} uid={uid} /> : <p className="card p-4 text-sm">Melde dich mit deinem Cloud-Konto an, um mit deinem Coach zu schreiben.</p>}
  </div>;
}
