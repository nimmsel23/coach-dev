import { useEffect, useState } from 'react';
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { clientActivity } from './clientActivity.js';

export function useClientActivity(uids) {
  const [seen, setSeen] = useState({});
  const [now, setNow] = useState(Date.now());
  const key = JSON.stringify([...uids].sort());
  useEffect(() => {
    if (!db) return undefined;
    const stops = JSON.parse(key).map((uid) => onSnapshot(
      query(collection(db, 'fitness', uid, 'tractionDaily'), orderBy('lastSeenAt', 'desc'), limit(1)),
      { includeMetadataChanges: true },
      (snapshot) => setSeen((previous) => ({ ...previous,
        [uid]: snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites
          ? null : snapshot.docs[0]?.data()?.lastSeenAt || null,
      })),
      () => setSeen((previous) => ({ ...previous, [uid]: null })),
    ));
    return () => stops.forEach((stop) => stop());
  }, [key]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60000);
    return () => window.clearInterval(timer);
  }, []);
  return Object.fromEntries(uids.map((uid) => [uid, clientActivity(seen[uid], now)]));
}
