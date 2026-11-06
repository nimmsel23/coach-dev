import { useEffect, useState } from 'react';
import {
  doc,
} from 'firebase/firestore';
import { getDoc } from '../lib/db/firestore/offline.js';
import { db } from '../firebase.js';
import { isLocalMode } from '@db';

// Matches the actual role mechanisms in vitalos/firestore.rules. No email heuristics.
export function usePlanCoach(user) {
  const [coach, setCoach] = useState(false);
  useEffect(() => {
    let alive = true;
    setCoach(false);
    if (!user) return;
    if (isLocalMode()) { setCoach(true); return; }
    (async () => {
      if (user.uid === '59ole36uNpNwml5H6VDYCXyCME92') return true;
      const token = await user.getIdTokenResult();
      if (token.claims.coach === true) return true;
      const role = await getDoc(doc(db, 'roles', user.uid));
      return role.exists() && role.data().role === 'coach';
    })().then((allowed) => { if (alive) setCoach(allowed); }).catch(() => {});
    return () => { alive = false; };
  }, [user]);
  return coach;
}
