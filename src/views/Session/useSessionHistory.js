/**
 * useSessionHistory — History-Load-State (letzte N Sessions, Merge mehrerer
 * Docs desselben Tages, prevMap, restHours, Pagination), aus useSession.js
 * herausgelöst (PHASE3_TODO.md Stück 4, Fortsetzung 2026-09-06, rein
 * mechanisch, keine Logik/Werte verändert).
 *
 * Braucht `block`/`date` von außen (Basis-Session-Felder bleiben im
 * Haupthook) — `historyLimit` selbst ist rein interner State dieses Hooks
 * (nicht von außen hereingereicht), wird aber mit zurückgegeben, weil
 * `loadMoreHistory()` ihn erhöht und Konsumenten (`SessionHistory.jsx` via
 * `hasMoreHistory`/`onLoadMoreHistory`) den aktuellen Stand kennen müssen.
 *
 * `setRecentSessions` wird zurückgegeben, weil der Haupthook (in `save()`
 * und `useSessionCrud.js`s `handleDeleteSession()`) den DateStrip-Cache
 * direkt nach einem Save/Delete aktualisiert, ohne auf den nächsten
 * History-Fetch zu warten.
 */

import { useState, useEffect } from 'react';
import { getSessionHistory } from '@db';
import { mergeSessionRuntimeDraftsIntoHistory } from '../../lib/sessionRuntimeStore.js';
import { previousExerciseEntries } from '../../lib/db/shared/previousExercise.js';

export function useSessionHistory({ block, date, sessionId, daySessions }) {
  const [restHours, setRestHours] = useState(null);
  const [recentSessions, setRecentSessions] = useState({});
  const [historyLimit, setHistoryLimit] = useState(60);
  const [hasMoreHistory, setHasMoreHistory] = useState(false);
  const [prevMap, setPrevMap] = useState([]);

  // historyLimit ist stateful (statt fix 60) — SessionHistory.jsx bekommt
  // einen "Mehr laden"-Button, der ihn hochsetzt, weil sowohl die lokale
  // Route als auch die Firestore-Query (`limit(n)`) hart bei n abschneiden,
  // ohne Pagination. Betrifft Firebase-Prod genauso wie lokal (Matthias
  // konnte im Date-Picker/Verlauf nicht weiter als ~60 Sessions zurück).
  useEffect(() => {
    let active = true;
    setPrevMap([]);
    getSessionHistory(historyLimit).then(sessions => {
      if (!active) return;
      const hydratedSessions = mergeSessionRuntimeDraftsIntoHistory(sessions);
      setHasMoreHistory(sessions.length >= historyLimit);
      const sessByDate = {};
      hydratedSessions.forEach(s => {
        const existing = sessByDate[s.date];
        if (existing) {
          // Mehrere Docs am selben Tag (z.B. Legs + HIIT-Finisher im selben Doc
          // gespeichert, aber historisch auf zwei Docs verteilt) mergen statt
          // überschreiben. Eine explizit als eigene Cardio-Session geloggte
          // zweite Session (sessionMode === 'cardio', z.B. ein separat
          // geloggter Spaziergang) ist aber KEIN Finisher der ersten Session —
          // deren activity darf nicht als Finisher-Badge übernommen werden.
          const mainDoc = (existing.exercises?.length > 0) ? existing
            : (s.exercises?.length > 0) ? s : existing;
          const otherDoc = mainDoc === existing ? s : existing;
          const finisherActivity = otherDoc.sessionMode !== 'cardio' ? otherDoc.activity : null;
          sessByDate[s.date] = {
            ...mainDoc,
            exercises: [...(existing.exercises || []), ...(s.exercises || [])],
            activity: mainDoc.activity || finisherActivity,
          };
        } else {
          sessByDate[s.date] = s;
        }
      });
      setRecentSessions(sessByDate);
      const currentSession = (daySessions || []).find((session) => session.id === sessionId);
      setPrevMap(previousExerciseEntries(hydratedSessions, date, currentSession));
      if (block) {
        const lastSame = sessions.find(s => s.date < date && (s.block === block || s.trainingsart === block));
        if (lastSame) {
          const hours = Math.round((new Date(date) - new Date(lastSame.date)) / (1000 * 60 * 60));
          setRestHours(hours);
        } else {
          setRestHours(null);
        }
      }
    }).catch(() => {});
    return () => { active = false; };
  }, [block, date, historyLimit, sessionId, daySessions]);

  function loadMoreHistory() {
    setHistoryLimit(current => current + 60);
  }

  return { recentSessions, setRecentSessions, restHours, hasMoreHistory, loadMoreHistory, historyLimit, prevMap };
}
