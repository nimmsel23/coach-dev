/**
 * useLogbook — lädt die komplette Session-Historie einmal und aggregiert sie
 * (logbookStats.buildLogbook). Bewusst eigener Fetch statt useSession():
 * Logbuch braucht die ganze Historie, nicht das 60er-Fenster des Einzelsession-Tabs.
 * Firestore: getLogbookSessions() liest Monats-Digests (workoutIndex.js) statt
 * jeder einzelnen Session; lokal bleibt es getSessionHistory(2000).
 */

import { useEffect, useMemo, useState } from 'react';
import { getLogbookSessions } from '@db';
import { localToday } from '@utils';
import { mergeSessionRuntimeDraftsIntoHistory } from '../../lib/sessionRuntimeStore.js';
import { buildLogbook } from './logbookStats.js';

export function useLogbook() {
  const [state, setState] = useState({ loading: true, error: false, sessions: [] });

  useEffect(() => {
    let alive = true;
    getLogbookSessions()
      .then((h) => {
        if (!alive) return;
        const list = Array.isArray(h) ? h : [];
        setState({ loading: false, error: false, sessions: mergeSessionRuntimeDraftsIntoHistory(list) });
      })
      .catch(() => { if (alive) setState({ loading: false, error: true, sessions: [] }); });
    return () => { alive = false; };
  }, []);

  const today = localToday();
  const book = useMemo(() => buildLogbook(state.sessions, today), [state.sessions, today]);
  return { loading: state.loading, error: state.error, book, today };
}
