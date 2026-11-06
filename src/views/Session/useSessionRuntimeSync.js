/**
 * useSessionRuntimeSync — localStorage-Runtime-Draft-Sync + Queue-Flushed-
 * Listener, aus useSession.js herausgelöst (PHASE3_TODO.md Stück 4,
 * Fortsetzung 2026-09-06, rein mechanisch, keine Logik/Werte verändert).
 *
 * Braucht Zugriff auf sehr viele Felder des Haupthooks (date, sessionId,
 * block, exercises, effort, location, duration, notes, trainingsart,
 * sessionMode, activity, hasActivity, slots, sessionGate, dirty) — statt
 * 14 Einzel-Parametern wird das als ein gebündeltes `sessionState`-Objekt
 * hereingereicht (Trade-off explizit statt erzwungener Einzel-Props: eine
 * flache 14-Feld-Parameterliste wäre nicht lesbarer gewesen, das Bündel
 * macht wenigstens sichtbar, dass es sich um "praktisch der ganze
 * Session-State" handelt). `savingRef`, `buildSessionPayload`, `dateRef`,
 * `setDaySessions`, `setSessionId`, `loadSessionData` kommen separat, da
 * sie keine reinen Session-Feld-Werte sind (Ref/Funktion/Setter).
 *
 * Race-Guard (PHASE3_TODO.md Stück 4, DB-Layer-Audit-Bugfund, unbedingt
 * mitgenommen): der Draft-Effect unten schreibt bei JEDER relevanten
 * State-Änderung syncState:'local' in den Runtime-Draft — lief bisher
 * unabhängig davon, ob gerade ein echter API-Save (save()) in Flight ist.
 * Ändert sich während eines laufenden Saves noch ein State-Feld (z.B.
 * weitergetippte Notiz), konnte der Draft-Effect ein von save() gerade
 * gesetztes 'saving'/'queued' wieder auf 'local' zurückstufen — kein
 * Datenverlust (der API-Call selbst lief unbeeinflusst weiter), aber ein
 * falscher Sync-Status im Runtime-Draft, der bei einem Reload mitten im
 * Save kurz "unsynced" statt "wird synchronisiert" anzeigen konnte. Guard:
 * Draft-Effect überspringt den Schreibvorgang, solange `savingRef.current`
 * (in useSession.js zwischen `try` und `finally` von save() gesetzt).
 */

import { useEffect } from 'react';
import { listSessionsForDate } from '@db';
import {
  saveSessionRuntimeDraft,
  clearQueuedSessionRuntimeDraftsForDate,
  mergeSessionRuntimeDrafts,
} from '../../lib/sessionRuntimeStore.js';

export function useSessionRuntimeSync({
  sessionState, savingRef, buildSessionPayload, dateRef, setDaySessions, setSessionId, loadSessionData,
}) {
  const {
    date, sessionId, block, exercises, effort, location, duration, notes,
    trainingsart, sessionMode, activity, hasActivity, slots, sessionGate, dirty,
  } = sessionState;

  useEffect(() => {
    if (!dirty) return;
    // Guard siehe JSDoc-Kopf oben: kein 'local'-Downgrade während ein
    // echter API-Save (save()) bereits eigene syncState-Updates schreibt.
    if (savingRef.current) return;
    saveSessionRuntimeDraft(date, buildSessionPayload(), sessionId, { syncState: 'local' });
  }, [
    dirty, date, sessionId, block, exercises, effort, location, duration, notes,
    trainingsart, sessionMode, activity, hasActivity, slots, sessionGate,
  ]);

  useEffect(() => {
    function handleQueueFlushed(event) {
      const items = Array.isArray(event?.detail?.items) ? event.detail.items : [];
      const touchedCurrentDate = items.some((item) => {
        if (item?.method !== 'POST') return false;
        const url = String(item?.url || '');
        return url.includes('/session') && url.includes(`date=${date}`);
      });
      if (!touchedCurrentDate) return;
      clearQueuedSessionRuntimeDraftsForDate(date);
      listSessionsForDate(date)
        .then((list) => mergeSessionRuntimeDrafts(date, list))
        .then((list) => {
          if (dateRef.current !== date) return;
          setDaySessions(list);
          const current = list.find((session) => session.id === sessionId) || list[0] || null;
          if (current) {
            setSessionId(current.id);
            loadSessionData(current);
          }
        })
        .catch(() => {});
    }
    window.addEventListener('fitness:queue-flushed', handleQueueFlushed);
    return () => window.removeEventListener('fitness:queue-flushed', handleQueueFlushed);
  }, [date, sessionId]);
}
