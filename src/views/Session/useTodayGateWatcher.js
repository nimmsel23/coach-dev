/**
 * useTodayGateWatcher — hält Stoppuhr-Notification und 1h-Reminder am Leben,
 * wenn der Session-Tab nicht gemountet ist (anderer Haupt-Tab).
 *
 * useSessionGateLifecycle hängt in views/Session/index.jsx und deckt damit alle
 * Session-Sub-Tabs ab; App.jsx rendert <Session> aber nur auf dem Session-Tab.
 * Dieser Watcher liest dann das heutige Gate selbst (Server/Firestore + lokale
 * Runtime-Drafts) und gibt es an denselben Lifecycle-Hook weiter.
 */

import { useEffect, useState } from 'react';
import { localToday } from '@utils';
import { listSessionsForDate } from '@db';
import { mergeSessionRuntimeDrafts } from '../../lib/sessionRuntimeStore.js';
import { normalizeSessionGate, isSessionGateActive } from '../../lib/sessionGate.js';
import { useSessionGateLifecycle } from './useSessionGateLifecycle.js';

const POLL_MS = 60 * 1000;

export function useTodayGateWatcher(enabled) {
  const [gate, setGate] = useState(undefined); // undefined = noch nicht geladen
  const date = localToday();

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    async function refresh() {
      try {
        const list = mergeSessionRuntimeDrafts(date, await listSessionsForDate(date));
        const gates = list.map((s) => normalizeSessionGate(s.sessionGate)).filter((g) => g.startedAt);
        // Aktives Gate hat Vorrang; sonst das zuletzt gestartete (Abschluss-Status).
        const pick = gates.find(isSessionGateActive)
          || gates.sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)))[0]
          || null;
        if (!cancelled) setGate(pick);
      } catch { /* Netz weg: letzten Stand behalten */ }
    }
    refresh();
    const timer = window.setInterval(refresh, POLL_MS);
    function onVisible() { if (document.visibilityState === 'visible') refresh(); }
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [enabled, date]);

  // Nur aktiv, solange der Watcher zuständig ist; sonst übernimmt die Session.
  // Erst nach dem ersten Laden aktiv, sonst würde ein leerer Zwischenstand die
  // laufende Notification kurz löschen.
  useSessionGateLifecycle(gate ?? null, date, enabled && gate !== undefined);
}
