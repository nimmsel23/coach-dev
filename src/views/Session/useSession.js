/**
 * useSession — Custom hook for all Session state & handlers.
 *
 * Extracted from the 860-line index.jsx monolith, dann selbst zum
 * State-Monolith gewachsen (771 Zeilen) — PHASE3_TODO.md Stück 4 hat die
 * vier fachlich abgrenzbaren Teile in eigene Mini-Hooks ausgelagert:
 * `useExerciseList()`, `useSessionActivity()`, `useSessionSlots()`,
 * `useSessionGateController()` (siehe jeweilige Datei für Details/
 * Interdependenzen). Ein zweiter Split-Durchgang (2026-09-06, gleiches
 * Stück, Fortsetzung) hat vier weitere Teile herausgelöst:
 * `useSessionHistory()` (History-Load + restHours + prevMap),
 * `useSessionRuntimeSync()` (Runtime-Draft-Sync-Effect + Queue-Flushed-
 * Listener), `useSessionCrud()` (Load/Reset/Select/Delete/New-Session) und
 * `useSessionExport()` (Obsidian-/Markdown-Export + Move-Session-Between-
 * Dates). Dieser Haupthook bleibt Koordination: Datum/Session-Auswahl,
 * die Basis-Session-Felder (block/effort/location/duration/notes/...), die
 * keinem der acht Mini-Hooks eindeutig zuzuordnen sind, plus
 * `buildSessionPayload()`/`save()` (bleiben hier — lesen fast jedes Stück
 * Session-State, keine sinnvolle Aufteilung ohne eine gemeinsame
 * Schnittstelle, die am Ende wieder alles zusammenführen müsste) und die
 * Verdrahtung aller Mini-Hooks.
 *
 * Externer Rückgabe-Vertrag bleibt UNVERÄNDERT (SessionEditor.jsx konsumiert
 * ihn per `{...session}`-Spread, siehe views/Session/index.jsx) — reine
 * interne Umorganisation, kein Feature-/Verhaltensunterschied außer der
 * bereits dokumentierten Autosave-Race-Klärung (siehe useSessionRuntimeSync.js).
 */

import { useState, useEffect, useRef } from 'react';
import {
  saveSession, listSessionsForDate,
  getCoverageGaps, getPlanSuggestion,
} from '@db';
import { localToday } from '@utils';
import { normalizeSessionGate, sessionHasLoggedWorkout } from '../../lib/sessionGate.js';
import {
  saveSessionRuntimeDraft,
  clearSessionRuntimeDraft,
  mergeSessionRuntimeDrafts,
} from '../../lib/sessionRuntimeStore.js';
import { getRollingDays } from './utils';
import { useExerciseList } from './useExerciseList.js';
import { useSessionActivity } from './useSessionActivity.js';
import { useSessionSlots } from './useSessionSlots.js';
import { markGateActivity } from '../../lib/gateActivity.js';
import { useSessionGateController } from './useSessionGateController.js';
import { useSessionHistory } from './useSessionHistory.js';
import { useSessionRuntimeSync } from './useSessionRuntimeSync.js';
import { useSessionCrud } from './useSessionCrud.js';
import { useSessionExport } from './useSessionExport.js';

export function useSession({ initialDate, initialDraft, recentDays = 7, coverageThreshold = 1.0, onDateChange = null }) {
  const [date, setDateState]        = useState(initialDate || localToday());
  const [sessionMode, setSessionMode] = useState('strength');
  const [block, setBlock]           = useState('');
  const [effort, setEffort]         = useState(5);
  const [location, setLocation]     = useState('');
  const [duration, setDuration]     = useState('');
  const [trainingsart, setTrainingsart] = useState('');
  const [notes, setNotes]           = useState('');
  const [coachFeedback, setCoachFeedback] = useState('');
  const [saving, setSaving]         = useState(false);
  const [toast, setToast]           = useState('');
  const [toastAction, setToastAction] = useState(null);
  const toastTimerRef = useRef(null);
  const [hint, setHint]             = useState(null);
  const [gaps, setGaps]             = useState([]);
  const [daySessions, setDaySessions] = useState([]);
  const [sessionId, setSessionId]   = useState(null);
  const [autoSaveLabel, setAutoSaveLabel] = useState('');
  const [dirty, setDirty]           = useState(false);
  const [showMap, setShowMap]       = useState(false);
  // Zentraler Modal-State (PHASE4_TODO.md Stück 1) statt vorher 3 einzelner
  // Booleans (showSidebar/showTabSettings in useSession.js + gateSheetOpen
  // lokal in SessionEditor.jsx) — genau ein Portal kann offen sein.
  // Werte: null | 'sidebar' | 'settings' | 'gate'.
  const [activeModal, setActiveModal] = useState(null);

  // Drag-and-drop state for history view
  const [reDateEntry, setReDateEntry] = useState(null);
  const [draggedDate, setDraggedDate] = useState(null);
  const [dragOverDate, setDragOverDate] = useState(null);

  const saveRef = useRef(null);
  const dirtyRef = useRef(false);
  const dateRef = useRef(null);
  const autoSaveTimerRef = useRef(null);
  // Race-Guard (PHASE3_TODO.md Stück 4, DB-Layer-Audit-Bugfund): siehe
  // JSDoc-Kopf von useSessionRuntimeSync.js für die volle Erklärung. Kurz:
  // der dortige Draft-Effect überspringt den Schreibvorgang, solange
  // `savingRef.current` — verhindert, dass ein während eines laufenden
  // save() geändertes Feld dessen 'saving'/'queued'-Status fälschlich auf
  // 'local' zurückstuft.
  const savingRef = useRef(false);
  // War fix 30 — Date-Picker konnte nie weiter als 30 Tage zurück, unabhängig
  // von tatsächlich vorhandenen älteren Sessions (Klienten-Bug: Matthias
  // konnte alte Workouts nicht nachloggen). 365 Tage sind nur Datums-Strings,
  // keine Fetches — billig genug, um das Fenster einfach großzügig zu machen.
  const rollingDays = getRollingDays(365);

  // ── Toast ─────────────────────────────────────────────────────
  // action: optional { label, onClick } — z.B. "Rückgängig" nach Workout beenden.
  function showToast(msg, action = null) {
    setToast(msg);
    setToastAction(action);
    // Alten Timer verwerfen, sonst löscht der "Gespeichert"-Timer den Undo-Toast zu früh.
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => { setToast(''); setToastAction(null); }, action ? 6000 : 2200);
  }

  // Debounced Save: reine dirty=true-Markierung hat bislang NICHT automatisch
  // gespeichert — echte Saves liefen nur bei Tab-Wechsel/Datumswechsel/Unmount.
  // Wird die PWA im Hintergrund vom OS gekillt (Handy, Bildschirm aus beim
  // Training), ohne dass diese Events sauber feuern, gingen Änderungen (Sets,
  // Removes) verloren. Jetzt: 1.5s nach der letzten Änderung wird tatsächlich
  // gespeichert, unabhängig von Tab-Lifecycle-Events.
  function scheduleAutoSave() {
    markGateActivity();
    setDirty(true);
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      autoSaveTimerRef.current = null;
      if (dirtyRef.current) { saveRef.current?.(true); setDirty(false); }
    }, 1500);
  }

  // ── Mini-Hooks (PHASE3_TODO.md Stück 4) ─────────────────────────
  const {
    exercises, setExercises, quickInput, setQuickInput,
    addEx, addFromTemplate, addQuick, updateEx, addSet, replaceSets, removeSet, moveEx, moveExercise, removeEx,
  } = useExerciseList({ scheduleAutoSave, showToast, saveRef, setDirty });

  const {
    activity, setActivity, hasActivity, setHasActivity,
    activityAddons, setActivityAddons, removeActivityAddon,
  } = useSessionActivity({ date });

  const { slots, setSlots, addSlot, removeSlot, updateSlot, reorderSlots } =
    useSessionSlots({ setExercises, scheduleAutoSave });

  const { sessionGate, setSessionGate, startSessionGate, stopSessionGate } =
    useSessionGateController({ location, setLocation, duration, setDuration, save, setDirty, showToast });

  const {
    recentSessions, setRecentSessions, restHours, hasMoreHistory, loadMoreHistory, prevMap,
  } = useSessionHistory({ block, date, sessionId, daySessions });

  // Ungespeicherte Änderungen sichern, bevor der Editor-State neu geladen wird
  // (Datumswechsel, Session-Wechsel, neues Workout, Unmount). save() liest den
  // State der aktuellen Closure — muss also VOR setDate/loadSessionData laufen.
  function flushDirty() {
    if (autoSaveTimerRef.current) { clearTimeout(autoSaveTimerRef.current); autoSaveTimerRef.current = null; }
    if (dirtyRef.current) { saveRef.current?.(true); setDirty(false); }
  }

  function changeDate(d) {
    flushDirty();
    setDateState(d);
    onDateChange?.(d);
  }

  useEffect(() => {
    if (initialDate && initialDate !== date) setDateState(initialDate);
  }, [initialDate, date]);

  const {
    loadSessionData, resetSessionData, selectSession, handleDeleteSession, deleteSessionAtDate, handleNewSession,
  } = useSessionCrud({
    date, sessionId, setSessionId, daySessions, setDaySessions, setRecentSessions,
    setDirty, flushDirty, showToast, initialDraft,
    setBlock, setExercises, setEffort, setLocation, setDuration, setNotes,
    setCoachFeedback, setTrainingsart, setSessionMode,
    setActivity, setHasActivity, setActivityAddons,
    setSlots, setSessionGate,
  });

  // ── Day sessions + hints ──────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      try {
        const list = mergeSessionRuntimeDrafts(date, await listSessionsForDate(date));
        setDaySessions(list);
        if (list.length > 0) {
          const found = list.find(s => s.id === sessionId);
          if (found) { setSessionId(found.id); loadSessionData(found); }
          else { setSessionId(list[0].id); loadSessionData(list[0]); }
        } else {
          setSessionId(null);
          resetSessionData();
        }
      } catch (e) { console.error('Failed to load sessions for date', e); }
    };
    load();
    getPlanSuggestion(date).then(setHint).catch(() => {});
    getCoverageGaps(recentDays, coverageThreshold).then(setGaps).catch(() => {});
  }, [date, recentDays, coverageThreshold]);

  useSessionRuntimeSync({
    sessionState: {
      date, sessionId, block, exercises, effort, location, duration, notes,
      trainingsart, sessionMode, activity, hasActivity, slots, sessionGate, dirty,
    },
    savingRef,
    buildSessionPayload,
    dateRef,
    setDaySessions,
    setSessionId,
    loadSessionData,
  });

  // ── Save ──────────────────────────────────────────────────────
  function buildSessionPayload(overrides = {}) {
    const nextSessionMode = overrides.sessionMode ?? sessionMode;
    const nextActivity = overrides.activity ?? activity;
    const nextHasActivity = overrides.hasActivity ?? hasActivity;
    const nextSessionGate = normalizeSessionGate(overrides.sessionGate ?? sessionGate);
    const sessData = {
      block,
      exercises,
      effort,
      location: overrides.location ?? location,
      duration: overrides.duration ?? duration,
      notes,
      trainingsart,
      sessionMode: nextSessionMode,
      slots,
    };
    if (nextSessionMode === 'cardio') sessData.activity = nextActivity;
    else if (nextHasActivity && nextActivity?.duration) sessData.activity = nextActivity;
    if (nextSessionGate.startedAt || nextSessionGate.endedAt) sessData.sessionGate = nextSessionGate;
    return sessData;
  }

  async function save(silent = false, overrides = {}) {
    if (!silent) setSaving(true);
    savingRef.current = true;
    const savedDate = date;
    const savedSessionId = sessionId;
    const sessData = buildSessionPayload(overrides);
    try {
      saveSessionRuntimeDraft(savedDate, sessData, savedSessionId, { syncState: 'saving' });
      setAutoSaveLabel(silent ? 'Auto…' : 'Speichert…');
      const result = await saveSession(savedDate, sessData, savedSessionId);
      setDirty(false);
      if (result?.queued || result?.offline) {
        saveSessionRuntimeDraft(savedDate, sessData, savedSessionId, { syncState: 'queued' });
      } else {
        clearSessionRuntimeDraft(savedDate, savedSessionId);
      }
      if (silent) {
        if (result?.queued || result?.offline) setAutoSaveLabel('Offline ✓');
        else setAutoSaveLabel(result?.sqliteSync === false ? 'Auto ⚠' : 'Auto ✓');
        setTimeout(() => setAutoSaveLabel(''), 2000);
      } else {
        setAutoSaveLabel('');
        // JSON-Save war in jedem Fall erfolgreich (sonst wäre saveSession()
        // geworfen) — sqliteSync:false meldet nur eine verzögerte SQLite-
        // Spiegelung (Python-Backend kurzzeitig nicht erreichbar), kein
        // Datenverlust. Kein Fehler-Toast, nur ein schwächerer Hinweis.
        if (result?.queued || result?.offline) showToast('Offline gespeichert ✓ · Sync ausstehend');
        else showToast(result?.sqliteSync === false ? 'Gespeichert ✓ (Sync verzögert)' : 'Gespeichert ✓');
      }
    } catch (e) {
      // Silent Auto-Saves zeigten bislang gar keine Fehlermeldung — ein
      // fehlgeschlagener Save (z.B. Firestore-Constraint-Fehler) verschwand
      // komplett unbemerkt. Wenigstens in der Konsole sichtbar machen.
      console.error('Session-Save fehlgeschlagen:', e);
      saveSessionRuntimeDraft(savedDate, sessData, savedSessionId, { syncState: 'error' });
      if (!silent) showToast('Fehler beim Speichern');
      setAutoSaveLabel('');
    } finally {
      if (!silent) setSaving(false);
      savingRef.current = false;
    }
    // Nur übernehmen, wenn der User nicht inzwischen das Datum gewechselt hat —
    // sonst überschreibt der Nachlauf eines Flush-Saves die frische Tagesliste.
    listSessionsForDate(savedDate).then(list => {
      const hydratedList = mergeSessionRuntimeDrafts(savedDate, list);
      if (dateRef.current === savedDate) {
        setDaySessions(hydratedList);
        setRecentSessions(prev => {
          const next = { ...prev };
          const primary = hydratedList.find(item => item.id === null) || hydratedList[0] || null;
          if (primary && sessionHasLoggedWorkout(primary)) next[savedDate] = primary;
          else delete next[savedDate];
          return next;
        });
      }
    }).catch(() => {});
    getCoverageGaps(recentDays, coverageThreshold).then(setGaps).catch(() => {});
  }

  saveRef.current = save;
  dirtyRef.current = dirty;
  dateRef.current = date;

  // Flush on tab-hide / page-unload / unmount (Haupt-Tab-Wechsel)
  useEffect(() => {
    function flush() {
      if (autoSaveTimerRef.current) { clearTimeout(autoSaveTimerRef.current); autoSaveTimerRef.current = null; }
      if (dirtyRef.current) { saveRef.current?.(true); setDirty(false); }
    }
    const onVisibility = () => { if (document.visibilityState === 'hidden') flush(); };
    window.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, []);

  const { exportObsidian, handleDownload, moveSessionToDate } = useSessionExport({
    date, block, exercises, effort, location, duration, notes,
    recentSessions, setRecentSessions, setReDateEntry, showToast,
  });

  // Moduswechsel (Kraft ↔ Ausdauer) darf eine bereits befüllte Session nicht
  // in-place umbiegen — sonst überschreibt der nächste Save unter derselben
  // sessionId die bisher geloggten Daten des vorherigen Modus (User-Feedback
  // 2026-09-07). Ist die aktuell offene Session schon befüllt, wird für den
  // neuen Modus stattdessen eine zusätzliche Session angelegt (wie der
  // "+"-Button) — die alte bleibt unangetastet. Nur eine leere/neue Session
  // darf ihren Modus einfach in-place wechseln.
  function switchSessionMode(mode) {
    if (mode === sessionMode) return;
    const hasContent = sessionHasLoggedWorkout({
      exercises, block,
      activity: (sessionMode === 'cardio' || hasActivity) ? activity : null,
      sessionGate,
    });
    if (hasContent) {
      handleNewSession();
      setSessionMode(mode);
      showToast(mode === 'cardio' ? 'Neue Ausdauer-Session angelegt' : 'Neue Kraft-Session angelegt');
    } else {
      setSessionMode(mode);
    }
  }

  return {
    // State
    date, setDate: changeDate,
    sessionMode, setSessionMode: switchSessionMode,
    block, setBlock,
    exercises,
    effort, setEffort,
    location, setLocation,
    duration, setDuration,
    trainingsart, setTrainingsart,
    notes, setNotes,
    coachFeedback,
    saving,
    toast, toastAction, showToast,
    quickInput, setQuickInput,
    restHours,
    activity, setActivity,
    hasActivity, setHasActivity,
    activityAddons, removeActivityAddon,
    slots, addSlot, removeSlot, updateSlot, reorderSlots,
    sessionGate, setSessionGate,
    recentSessions,
    hasMoreHistory, loadMoreHistory,
    hint, gaps,
    prevMap,
    daySessions, setDaySessions,
    sessionId,
    autoSaveLabel,
    dirty,
    showMap, setShowMap,
    activeModal, setActiveModal,
    reDateEntry, setReDateEntry,
    draggedDate, setDraggedDate,
    dragOverDate, setDragOverDate,
    rollingDays,
    // Handlers
    save, selectSession, handleNewSession, handleDeleteSession, deleteSessionAtDate,
    startSessionGate, stopSessionGate,
    addEx, addFromTemplate, addQuick, updateEx, addSet, replaceSets, removeSet, moveEx, moveExercise, removeEx,
    exportObsidian, handleDownload, moveSessionToDate,
    scheduleAutoSave,
    // Gebündelte Übungs-Mutations-Handler + Quick-Input-State für
    // ExerciseList/SessionSlots (vorher 11 einzeln durchgereichte Props,
    // siehe PHASE3_TODO.md Stück 2). Einzel-Exports oben bleiben bestehen,
    // falls andere Aufrufer sie direkt brauchen.
    exerciseOps: {
      updateEx, addSet, removeSet, removeEx, replaceSets, moveEx,
      addEx, quickInput, setQuickInput, addQuick, onToast: showToast,
    },
  };
}
