import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db, isLocalMode } from '@db';

const ALPHA_COACH_UID = '59ole36uNpNwml5H6VDYCXyCME92';

export function useCoachAccess(user) {
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let active = true;
    setAllowed(false);
    if (!user) return () => { active = false; };
    if (isLocalMode()) {
      setAllowed(true);
      return () => { active = false; };
    }

    async function check() {
      if (user.uid === ALPHA_COACH_UID) return true;
      const token = await user.getIdTokenResult();
      if (token.claims.coach === true) return true;
      const role = await getDoc(doc(db, 'roles', user.uid));
      return role.exists() && role.data().role === 'coach';
    }
    check().then((result) => { if (active) setAllowed(result); }).catch(() => {});
    return () => { active = false; };
  }, [user]);

  return allowed;
}
