/**
 * useLogbook — lädt die komplette Session-Historie einmal und aggregiert sie
 * (logbookStats.buildLogbook). Bewusst eigener Fetch statt useSession():
 * Logbuch braucht die ganze Historie (2000 Einträge wie TrainingProtocol),
 * nicht das 60er-Fenster des Einzelsession-Tabs.
 */

import { useEffect, useMemo, useState } from 'react';
import { getSessionHistory } from '@db';
import { localToday } from '@utils';
import { mergeSessionRuntimeDraftsIntoHistory } from '../../lib/sessionRuntimeStore.js';
import { buildLogbook } from './logbookStats.js';

export function useLogbook() {
  const [state, setState] = useState({ loading: true, error: false, sessions: [] });

  useEffect(() => {
    let alive = true;
    getSessionHistory(2000)
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
