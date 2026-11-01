import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase.js';
import { watchCoachUnread } from '../lib/coachConversation.js';

export function useCoachUnread() {
  const [value, setValue] = useState({ count: 0, error: false });
  useEffect(() => {
    let stopMessages = () => {};
    let active = true;
    let generation = 0;
    const stopAuth = onAuthStateChanged(auth, (user) => {
      if (!active) return;
      const request = ++generation;
      stopMessages(); setValue({ count: 0, error: false });
      if (!user) return;
      stopMessages = watchCoachUnread((count) => { if (active && request === generation) setValue({ count, error: false }); }, () => { if (active && request === generation) setValue({ count: 0, error: true }); });
    });
    return () => { active = false; stopAuth(); stopMessages(); };
  }, []);
  return value;
}
