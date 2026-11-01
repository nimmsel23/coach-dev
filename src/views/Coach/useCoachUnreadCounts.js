import { useEffect, useState } from 'react';
import { getAllUserProfiles, getUid, watchClientUnread } from '@db';

export function useCoachUnreadCounts() {
  const actor = getUid();
  const [counts, setCounts] = useState({});
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    const stops = [];
    setCounts({}); setError(false);
    getAllUserProfiles().then((profiles) => {
      if (!active) return;
      for (const uid of Object.keys(profiles)) {
        stops.push(watchClientUnread(uid, (count) => { if (active) setCounts((previous) => ({ ...previous, [uid]: count })); }, () => { if (active) setError(true); }));
      }
    }).catch(() => { if (active) setError(true); });
    return () => { active = false; stops.forEach((stop) => stop()); };
  }, [actor]);
  return { byClient: counts, total: Object.values(counts).reduce((sum, count) => sum + count, 0), error };
}
