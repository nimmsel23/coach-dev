/**
 * useSessionGateLifecycle — App-Benachrichtigungen des Session-Gates
 * (laufende Stoppuhr, Abschlussstatus, 1h-Reminder).
 *
 * Vorher in SessionGateCard.jsx — und damit nur aktiv, solange das Gate-Sheet
 * offen war (SessionGateSheet rendert bei !open nichts). Wer das Workout über
 * die Bar im Header startete und das Sheet nie öffnete, bekam weder die
 * Stoppuhr-Notification noch den 1h-Reminder. Der Hook hängt jetzt im
 * SessionEditor und läuft unabhängig davon, welche Oberfläche offen ist.
 *
 * `enabled=false` schaltet den Hook ab (z.B. wenn useTodayGateWatcher zuständig ist).
 * Nur für HEUTE: Auf anderen Tagen würde "Workout geloggt" für eine alte
 * Session erscheinen bzw. ein fehlendes Gate die Notification von heute löschen.
 */

import { useEffect } from 'react';
import { localToday } from '@utils';
import {
  normalizeSessionGate,
  isSessionGateActive,
  getSessionGateElapsedMs,
  formatSessionGateElapsed,
} from '../../lib/sessionGate.js';

const NOTIFICATION_TAG = 'fitness-workout-session';
const HOUR_REMINDER_TAG = 'fitness-workout-hour-reminder';
const HOUR_REMINDER_MS = 60 * 60 * 1000;
// localStorage statt In-Memory-Ref: die Session kann eine App-Session
// überleben (Reload, Tab-Kill) — ohne Persistenz würde der Reminder bei
// jedem Reopen erneut feuern, solange >1h aktiv ist.
const HOUR_REMINDER_STORAGE_KEY = 'fitness-workout-hour-reminder-sent-for';

async function sendSessionGateNotification(sessionGate, date) {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return;
  if (!('serviceWorker' in navigator) || typeof Notification === 'undefined') return;

  const gate = normalizeSessionGate(sessionGate);
  const registration = window.__swRegistration || await navigator.serviceWorker.getRegistration();
  if (!registration?.active) return;

  if (Notification.permission !== 'granted') {
    if (!gate.startedAt) {
      registration.active.postMessage({ type: 'CLEAR_WORKOUT_TIMER_NOTIFICATION', tag: NOTIFICATION_TAG });
    }
    return;
  }

  if (!gate.startedAt) {
    registration.active.postMessage({ type: 'CLEAR_WORKOUT_TIMER_NOTIFICATION', tag: NOTIFICATION_TAG });
    registration.active.postMessage({ type: 'CLEAR_WORKOUT_TIMER_NOTIFICATION', tag: HOUR_REMINDER_TAG });
    return;
  }

  const elapsedLabel = formatSessionGateElapsed(getSessionGateElapsedMs(gate));
  registration.active.postMessage({
    type: 'SHOW_WORKOUT_TIMER_NOTIFICATION',
    tag: NOTIFICATION_TAG,
    title: isSessionGateActive(gate) ? 'Workout läuft' : 'Workout geloggt',
    body: isSessionGateActive(gate)
      ? `Stoppuhr: ${elapsedLabel} · Tippen zum Zurückkehren`
      : `Zeit: ${elapsedLabel} · Details können später nachgetragen werden`,
    date,
    active: isSessionGateActive(gate),
  });
}

// Eigene, nicht-stille Erinnerung ab 1h aktiver Session (anders als die
// laufende Stoppuhr-Notification oben, die bewusst `silent: true` ist, damit
// sie nicht alle 30s piept). Grund: Sessions werden faktisch nie bewusst
// beendet (sessionGate.endedAt bleibt null), wodurch das Workout nie als
// Core4-Fitness zählt — siehe TODO.md "Bug/UX-Lücke" vom 2026-10-12.
async function sendHourReminderNotification(date) {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return;
  if (!('serviceWorker' in navigator) || typeof Notification === 'undefined') return;
  if (Notification.permission !== 'granted') return;
  const registration = window.__swRegistration || await navigator.serviceWorker.getRegistration();
  if (!registration?.active) return;
  registration.active.postMessage({
    type: 'SHOW_WORKOUT_HOUR_REMINDER',
    tag: HOUR_REMINDER_TAG,
    title: 'Workout läuft seit über 1 Stunde',
    body: 'Fertig? Session beenden — sonst zählt sie nicht für Core4.',
    date,
  });
}

function checkHourReminder(gate, date) {
  if (!gate.startedAt || getSessionGateElapsedMs(gate) < HOUR_REMINDER_MS) return;
  let sentFor = null;
  try { sentFor = window.localStorage.getItem(HOUR_REMINDER_STORAGE_KEY); } catch {}
  if (sentFor === gate.startedAt) return;
  try { window.localStorage.setItem(HOUR_REMINDER_STORAGE_KEY, gate.startedAt); } catch {}
  sendHourReminderNotification(date).catch(() => {});
}

export function useSessionGateLifecycle(sessionGate, date, enabled = true) {
  const gate = normalizeSessionGate(sessionGate);
  const active = isSessionGateActive(gate);
  const isToday = enabled && date === localToday();

  // Abhängigkeiten über die Gate-Felder statt über das (bei jedem Render neu
  // normalisierte) Objekt, sonst läuft der Effekt bei jedem Render erneut.
  useEffect(() => {
    if (!isToday) return undefined;
    function runChecks() {
      sendSessionGateNotification(gate, date).catch(() => {});
      if (active) checkHourReminder(gate, date);
    }
    // Sofort prüfen (nicht erst nach 30s) — deckt den Fall ab, dass die App
    // erst wieder geöffnet wird, nachdem die Session längst >1h aktiv ist.
    runChecks();
    if (!active) return undefined;
    const notificationTimer = window.setInterval(runChecks, 30000);
    // iOS suspendiert setInterval im Hintergrund fast sofort (Screen-Lock,
    // App-Wechsel) — der 30s-Timer läuft dort effektiv nicht während der
    // "Handy weg"-Phase, die dieses Feature eigentlich abdecken soll. Beim
    // Zurückkehren in den Vordergrund (Screen an, App wieder aktiv) sofort
    // nachholen, statt auf den nächsten (ggf. nie kommenden) Tick zu warten.
    function onVisible() {
      if (document.visibilityState === 'visible') runChecks();
    }
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      window.clearInterval(notificationTimer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [isToday, active, gate.status, gate.startedAt, gate.endedAt, date]);
}
