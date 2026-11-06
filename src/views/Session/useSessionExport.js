/**
 * useSessionExport — Obsidian-/Markdown-Export + Move-Session-Between-Dates,
 * aus useSession.js herausgelöst (PHASE3_TODO.md Stück 4, Fortsetzung
 * 2026-09-06, rein mechanisch, keine Logik/Werte verändert).
 *
 * Vergleichsweise isoliert — braucht nur die Basis-Session-Felder
 * (date/block/exercises/effort/location/duration/notes), `recentSessions`/
 * `setRecentSessions` (aus useSessionHistory.js, für den DateStrip-Cache
 * beim Verschieben) und `setReDateEntry`/`showToast`.
 *
 * Fix 2026-09-06 (User-Feedback: Verschieben "hat nicht so gut geklappt"):
 * `moveSessionToDate()` rief `deleteSession(oldDate)` bisher OHNE
 * sessionId auf, während `handleDeleteSession()` in useSessionCrud.js
 * korrekt `deleteSession(date, sessionId)` mit beiden Argumenten nutzt.
 * War harmlos, solange die verschobene Session die implizite Haupt-Session
 * (id === null) war — sobald aber eine benannte Zusatz-Session (id = UUID)
 * verschoben wurde, löschte das den falschen (nicht-existenten) null-id-
 * Eintrag am alten Datum: die eigentliche Datei blieb liegen, die neue
 * Kopie am Zieldatum existierte zusätzlich → Session doppelt vorhanden statt
 * verschoben. Jetzt: `sess.id` wird an Save UND Delete durchgereicht, die
 * ID bleibt über den Datumswechsel hinweg erhalten statt implizit auf
 * "Haupt-Session" zu wechseln.
 */

import { saveSession, deleteSession, exportFitnessData } from '@db';
import { buildSessionCoachSheet } from '../../lib/exerciseInsights.js';
import { clearSessionRuntimeDraft } from '../../lib/sessionRuntimeStore.js';

export function useSessionExport({
  date, block, exercises, effort, location, duration, notes,
  recentSessions, setRecentSessions, setReDateEntry, showToast,
}) {
  // ── Exports ───────────────────────────────────────────────────
  async function exportObsidian() {
    try {
      const result = await exportFitnessData({ kind: 'session', session: { date, block, exercises, effort, location, duration, notes }, force: true });
      showToast(result?.path ? `Export: ${result.path}` : 'Exportiert');
    } catch { showToast('Export fehlgeschlagen'); }
  }

  function handleDownload() {
    const md = buildSessionCoachSheet({ date, block, exercises, effort, location, duration, notes });
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `fitness-session-${date}.md`; a.click();
    URL.revokeObjectURL(url);
  }

  // ── History: move session between dates ───────────────────────
  async function moveSessionToDate(oldDate, newDate) {
    if (!newDate || newDate === oldDate) { setReDateEntry(null); return; }
    const sess = recentSessions[oldDate];
    if (!sess) return;
    const sessId = sess.id || null;
    await saveSession(newDate, { ...sess, date: newDate }, sessId);
    await deleteSession(oldDate, sessId);
    clearSessionRuntimeDraft(oldDate, sessId);
    setRecentSessions(prev => {
      const next = { ...prev, [newDate]: { ...sess, date: newDate } };
      delete next[oldDate];
      return next;
    });
    setReDateEntry(null);
    showToast(`Verschoben → ${newDate}`);
  }

  return { exportObsidian, handleDownload, moveSessionToDate };
}
