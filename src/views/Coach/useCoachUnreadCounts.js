import { useEffect, useMemo, useState } from 'react';
import { getAllUserProfiles, getUid, watchClientUnread } from '@db';

function clientLabel(profile, uid) {
  return profile?.displayName || profile?.email || uid;
}

export function useCoachUnreadCounts() {
  const actor = getUid();
  const [counts, setCounts] = useState({});
  const [profiles, setProfiles] = useState({});
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    const stops = [];
    setCounts({}); setError(false);
    getAllUserProfiles().then((data) => {
      if (!active) return;
      const next = data || {};
      setProfiles(next);
      for (const uid of Object.keys(next)) {
        stops.push(watchClientUnread(uid, (count) => { if (active) setCounts((previous) => ({ ...previous, [uid]: count })); }, () => { if (active) setError(true); }));
      }
    }).catch(() => { if (active) setError(true); });
    return () => { active = false; stops.forEach((stop) => stop()); };
  }, [actor]);

  const unreadClients = useMemo(() => Object.entries(counts)
    .filter(([, count]) => count > 0)
    .map(([uid, unread]) => ({
      uid,
      unread,
      name: clientLabel(profiles[uid], uid),
    }))
    .sort((a, b) => b.unread - a.unread || a.name.localeCompare(b.name)), [counts, profiles]);

  return {
    byClient: counts,
    unreadClients,
    total: Object.values(counts).reduce((sum, count) => sum + count, 0),
    error,
  };
}
