/**
 * SessionEditor — Main workout logging view.
 *
 * Assembles: DateStrip + SessionSwitcher + ModeSwitcher + ExerciseList + ActivityAddon + SessionSlots / ActivitySection
 * State comes entirely from useSession hook via props.
 * No inline history, no inline plan — those are separate sub-tabs.
 */

import { lazy, Suspense, useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import SessionModalsLayer from './SessionModalsLayer.jsx';
import SessionSlots from './SessionSlots.jsx';
import SessionHeader from './SessionHeader';
import SessionGateBar from './SessionGateBar.jsx';
// Zieht Plan-API + Übungskatalog (inkl. ~1,8 MB Bulk-Daten) nach — erst beim ersten Long-Press laden.
const SplitPlanSheet = lazy(() => import('./SplitPlanSheet.jsx'));
import EffortPicker from './EffortPicker';
import ExerciseList from './ExerciseList';
import CardioSection from './CardioSection.jsx';
import ActivityAddon from './ActivityAddon';
import ActivityAddonHistory from './ActivityAddonHistory.jsx';
import { withLastPerformance } from '../Plan/lib/sessionDraft.js';
import TemplateLauncher from './TemplateLauncher.jsx';
import SessionToast from './SessionToast.jsx';
import SessionSaveFab from './SessionSaveFab.jsx';
import SessionSidebar from './SessionSidebar';
import { normalizeSessionGate, sessionGateTimeToHHMM, buildManualSessionGate, estimateDurationMinutes } from '../../lib/sessionGate.js';
import { inferBlockFromExercises, blockColor } from './utils';
import { localToday } from '@utils';

export default function SessionEditor({
  // State from useSession
  date, setDate,
  sessionMode, setSessionMode,
  block, setBlock,
  exercises,
  effort, setEffort,
  location, setLocation,
  duration, setDuration,
  trainingsart, setTrainingsart,
  notes, setNotes,
  coachFeedback,
  saving, dirty, autoSaveLabel,
  restHours,
  activity, setActivity,
  hasActivity, setHasActivity,
  activityAddons, removeActivityAddon,
  sessionGate, setSessionGate,
  slots, addSlot, removeSlot, updateSlot, reorderSlots,
  recentSessions,
  hint,
  prevMap,
  daySessions, sessionId,
  activeModal, setActiveModal,
  rollingDays,
  toast, toastAction,
  // Handlers
  save, selectSession, handleNewSession, handleDeleteSession,
  startSessionGate, stopSessionGate,
  moveExercise,
  addFromTemplate,
  exerciseOps,
  exportObsidian, handleDownload, scheduleAutoSave,
  onInspectExercise,
  currentSubTab,
  onSubNav,
  gateAutoOpenFlag,
  onGateAutoOpenConsumed,
}) {
  const [showInlineDetails, setShowInlineDetails] = useState(false);
  // Long-Press auf einen Split-Chip → passende Plan-Vorlagen (SplitPlanSheet)
  const [planSplit, setPlanSplit] = useState(null);
  const [planSheetLoaded, setPlanSheetLoaded] = useState(false);
  useEffect(() => { if (planSplit) setPlanSheetLoaded(true); }, [planSplit]);

  function applyPlanTemplate(split, routine) {
    if (block !== split) { setBlock(split); scheduleAutoSave(); }
    const total = (routine.exercises || []).length;
    const added = addFromTemplate?.(routine.exercises || []) || 0;
    exerciseOps?.onToast?.(
      !total ? `${routine.name || 'Plan'} hat keine Übungen`
        : added ? `+ ${added} Übungen aus „${routine.name}"`
        : 'Alle Übungen sind schon in der Session'
    );
  }
  // "Nächster Plan"-Karte im Gate-Sheet: Routine ohne Split-Wechsel in die Session übernehmen.
  function applyNextRoutine(routine) {
    const list = routine?.exercises || [];
    const added = addFromTemplate?.(list) || 0;
    exerciseOps?.onToast?.(
      !list.length ? `${routine?.label || routine?.name || 'Plan'} hat keine Übungen`
        : added ? `+ ${added} Übungen aus „${routine?.label || routine?.name}"`
        : 'Alle Übungen sind schon in der Session'
    );
  }
  const gpsMapsUrl = normalizeSessionGate(sessionGate).gps?.mapsUrl || null;
  // Beginn/Ende manuell setzen (wie es Start/Stopp der Stoppuhr automatisch tun);
  // die Dauer folgt daraus, solange sie leer oder noch der alte Automatik-Wert ist.
  const gateTimes = {
    start: sessionGateTimeToHHMM(normalizeSessionGate(sessionGate).startedAt),
    end: sessionGateTimeToHHMM(normalizeSessionGate(sessionGate).endedAt),
    onChange: (start, end) => {
      const next = buildManualSessionGate(date, start, end, sessionGate);
      if (!next) return;
      const prevAuto = estimateDurationMinutes(sessionGate);
      setSessionGate(next);
      const nextAuto = estimateDurationMinutes(next);
      if (next.endedAt && nextAuto && (!duration || String(duration) === prevAuto)) setDuration(nextAuto);
      scheduleAutoSave();
    },
  };

  // Session Gate ist kein inline Card-Element mehr, sondern ein echtes Sheet
  // über dem Training-Haupttab: "Heute" in der Nav-Bar (SessionGateCard.jsx
  // SESSION_NAV_ITEMS) öffnet es explizit, statt dass es immer sichtbar oben
  // klebt. Editor selbst bleibt darunter erreichbar (kein Plan-Zwang).
  //
  // gateAutoOpenFlag kommt als One-Shot-Signal von App (überlebt Remounts) —
  // nur wahr, wenn tatsächlich auf den "Heute"-Subtab navigiert wurde, nicht
  // bei jedem Datumswechsel (der wegen key={sessionDate} in App.jsx einen
  // kompletten Remount dieser Komponente auslöst, ein reiner
  // currentSubTab-Check hier würde also bei jedem Datumswechsel erneut
  // feuern, da mount-Effects unabhängig von deps immer einmal laufen).
  useEffect(() => {
    // Zusätzliche Absicherung neben dem date-Check in App.jsx (Race
    // zwischen Flag-Konsum und Remount): Gate nie öffnen, wenn das
    // aktuell angezeigte Datum nicht heute ist.
    // Kein Auto-Open beim Tab-Wechsel mehr (User-Feedback 2026-11-05: reflexhaft
    // weggewischt). Das Flag kommt nur noch vom Bottom-Nav-"Hub"-Button (App.openHub)
    // und öffnet das Gate direkt im Hub-Modus; sonst über die Gate-Leiste im Header.
    if (gateAutoOpenFlag && date === localToday()) setActiveModal(gateAutoOpenFlag === 'gate' ? 'gate' : 'hub');
    if (gateAutoOpenFlag) onGateAutoOpenConsumed?.();
  }, [gateAutoOpenFlag]);

  // Split-Autoerkennung: solange der User selbst noch keinen Split gewählt
  // hat (block === ''), leitet sie den Split aus den bereits eingetragenen
  // Übungen ab (z.B. nur Chest/Shoulder/Tricep-Übungen → "Push") — die
  // Session bekommt so automatisch ihre Kennzeichnung, ohne dass der Split
  // manuell nachgetragen werden muss.
  useEffect(() => {
    if (sessionMode !== 'strength' || block) return;
    const inferred = inferBlockFromExercises(exercises);
    if (inferred) {
      setBlock(inferred);
      scheduleAutoSave();
    }
  }, [exercises, sessionMode, block]);

  // Übungen tragen ihren Index im flachen exercises-Array als __i mit sich
  // (ExerciseList reicht ihn 1:1 an updateEx/addSet/removeEx/moveEx durch) —
  // notwendig, weil sowohl die Basisliste als auch jede Slot-Liste nur eine
  // gefilterte Teilmenge rendern; ohne __i würde ein lokaler Listen-Index
  // (0,1,2,...) auf die falsche Übung im Gesamt-Array zeigen, sobald ein
  // Slot benutzt wird.
  const indexedExercises = exercises.map((ex, i) => ({ ...ex, __i: i }));

  const dndSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const BASE_CONTAINER = '__base__';

  function handleExerciseDragEnd({ active, over }) {
    if (!over || !moveExercise) return;
    const activeId = active.id;
    const overData = over.data.current;
    const targetContainer = overData?.containerId ?? over.id;
    const targetSlotId = targetContainer === BASE_CONTAINER ? null : targetContainer;
    const containerItems = exercises.filter(e => (e.slotId || null) === (targetSlotId || null));
    const targetIndex = overData?.containerId
      ? containerItems.findIndex(e => e.id === over.id)
      : containerItems.length;
    if (targetIndex === -1) return;
    moveExercise(activeId, targetSlotId, targetIndex);
  }

  // Slots selbst sind seit Phase-3-Stück-3 ebenfalls per dnd-kit sortierbar
  // (eigene SortableContext in SessionSlots.jsx, gleicher DndContext wie die
  // Exercise-Listen). `type` in den jeweiligen `data`-Objekten (siehe
  // ExerciseList.jsx/SessionSlots.jsx) unterscheidet, welcher der beiden
  // Reorder-Pfade greift — beide teilen sich diesen einen DndContext, weil
  // dnd-kit Drag-Erkennung nur über den nächsten Vorfahren-Context läuft.
  function handleDragEnd({ active, over }) {
    if (!over) return;
    if (active.data.current?.type === 'slot') {
      if (over.data.current?.type === 'slot' && active.id !== over.id) {
        reorderSlots(active.id, over.id);
      }
      return;
    }
    handleExerciseDragEnd({ active, over });
  }

  return (
    // Untere Freifläche: muss die fixe Bottom-Nav (~76px + Safe-Area) UND
    // den darüber schwebenden Save-FAB (bottom 6rem + Safe-Area, 56px hoch)
    // freihalten, sonst klebt der letzte Block ("Details & Notizen") unter
    // beiden. env() nur per inline-style möglich.
    <div style={{ paddingBottom: 'calc(10rem + env(safe-area-inset-bottom))' }}>
      {/* Sticky header — DateStrip/SessionSwitcher/hint/ModeSwitcher merged into one calm unit */}
      <SessionHeader
        date={date} setDate={setDate} rollingDays={rollingDays} recentSessions={recentSessions}
        saving={saving} autoSaveLabel={autoSaveLabel} dirty={dirty} onSave={save}
        onOpenSidebar={() => setActiveModal('sidebar')}
        onOpenSettings={() => setActiveModal('settings')}
        hint={hint}
        daySessions={daySessions} sessionId={sessionId} selectSession={selectSession}
        onNew={handleNewSession} onDelete={handleDeleteSession}
        sessionMode={sessionMode} setSessionMode={setSessionMode}
        block={block} activity={activity}
        subTab={currentSubTab} onSubNav={onSubNav}
        gateBar={
          <SessionGateBar
            sessionGate={sessionGate}
            exercises={exercises}
            isToday={date === localToday()}
            onOpenGate={() => setActiveModal('gate')}
            onStart={() => startSessionGate()}
            onStop={stopSessionGate}
          />
        }
      />

      {/* Split-Anzeige — die Auswahl (Chips, Long-Press → Pläne) liegt im Gate; hier genügt die
          Autoerkennung aus den geloggten Übungen. Tap öffnet das Gate zum Ändern. */}
      {sessionMode === 'strength' && (
        <div className="px-3 mt-1.5 mb-1.5">
          <button
            type="button"
            onClick={() => setActiveModal('gate')}
            className="flex items-center gap-2 h-8 px-3 rounded-full text-[11px] font-bold active:scale-95 transition-all"
            style={{ background: 'var(--card)', border: '1px solid var(--line)', color: block ? blockColor(block) : 'var(--dim)' }}
            aria-label="Split im Gate ändern"
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: block ? blockColor(block) : 'var(--dim)' }} />
            {block ? `Split: ${block}` : 'Split: automatisch'}
            <span style={{ color: 'var(--dim)', opacity: 0.7 }}>· ändern</span>
          </button>
        </div>
      )}
      {planSheetLoaded && (
        <Suspense fallback={null}>
          <SplitPlanSheet split={planSplit} onClose={() => setPlanSplit(null)} onPick={applyPlanTemplate} />
        </Suspense>
      )}

      {/* RPE — ebenfalls prominent statt hinter "Details & Notizen" versteckt */}
      <div className="px-3 mb-1.5">
        <EffortPicker effort={effort} setEffort={v => { setEffort(v); scheduleAutoSave(); }} />
      </div>

      <div className="px-2 space-y-4 mt-1">
        {sessionMode === 'strength' && exerciseOps.appendDraft && (
          <details className="rounded-lg border border-fit-line/40 px-3 py-2">
            <summary className="min-h-[44px] cursor-pointer text-xs font-black uppercase text-fit-dim leading-[44px]">Workout / Vorlage laden</summary>
            <div className="pb-2"><TemplateLauncher onLoadDraft={(d) => exerciseOps.appendDraft(withLastPerformance(d, prevMap))} /></div>
          </details>
        )}
        {sessionMode === 'strength' ? (
          <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            {/* Basis-Übungsliste = impliziter erster Abschnitt der Session
                (wie schon immer: Übungen + Sets + Activity-Finisher unten). */}
            <ExerciseList
              containerId={BASE_CONTAINER}
              exercises={indexedExercises.filter(ex => !ex.slotId)}
              restHours={restHours}
              muscleRecovery={recentSessions[date]?.muscle_recovery || {}}
              date={date}
              prevMap={prevMap}
              onInspectExercise={onInspectExercise}
              exerciseOps={exerciseOps}
            />

            {/* Activity finisher addon — für den Basis-Abschnitt, unverändert */}
            <ActivityAddon
              hasActivity={hasActivity}
              setHasActivity={setHasActivity}
              activity={activity}
              setActivity={v => { setActivity(v); scheduleAutoSave(); }}
            />

            {/* Zusätzliche, frei benannte Abschnitte (Slots) — jeder ein
                weiterer Übungen+Activity+Notiz-Block wie der Basis-Abschnitt
                oben, additiv. Leeres slots-Array rendert nichts. */}
            <SessionSlots
              slots={slots}
              exercises={indexedExercises}
              block={block}
              addSlot={addSlot}
              removeSlot={removeSlot}
              updateSlot={updateSlot}
              restHours={restHours}
              muscleRecovery={recentSessions[date]?.muscle_recovery || {}}
              date={date}
              prevMap={prevMap}
              onInspectExercise={onInspectExercise}
              exerciseOps={exerciseOps}
            />
          </DndContext>
        ) : (
          /* Cardio mode */
          <CardioSection activity={activity} setActivity={setActivity} scheduleAutoSave={scheduleAutoSave} />
        )}

        {/* Bereits gespeicherte Finisher dieses Tages (activityAddons-Historie) */}
        <ActivityAddonHistory activityAddons={activityAddons} removeActivityAddon={removeActivityAddon} />

        {/* Details & Notizen — Location/Dauer/Trainingsart/Effort/Notizen, klappt Sidebar-Inhalte inline auf.
            Split (Push/Pull/...) sitzt seit der UX-Überarbeitung nicht mehr hier, sondern prominent
            unter dem Datumspicker (SplitPicker) — das war vorher die eigentliche Logging-Hürde. */}
        <div>
          <button
            onClick={() => setShowInlineDetails(v => !v)}
            className="w-full flex items-center justify-between px-5 py-4 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all"
            style={{ background: 'var(--card)', border: '1px solid var(--line)', color: 'var(--dim)' }}
          >
            <span>Details & Notizen</span>
            <ChevronDown size={14} style={{ transform: showInlineDetails ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
          </button>
          {showInlineDetails && (
            <div className="mt-3 animate-in slide-in-from-top-2 duration-200">
              <SessionSidebar
                location={location} setLocation={v => { setLocation(v); scheduleAutoSave(); }}
                duration={duration} setDuration={v => { setDuration(v); scheduleAutoSave(); }}
                gpsMapsUrl={gpsMapsUrl} gateTimes={gateTimes}
                trainingsart={trainingsart} setTrainingsart={v => { setTrainingsart(v); scheduleAutoSave(); }}
                notes={notes} setNotes={v => { setNotes(v); scheduleAutoSave(); }}
                onDownload={handleDownload}
                onExportObsidian={exportObsidian}
                coachFeedback={coachFeedback}
              />
            </div>
          )}
        </div>
      </div>

      {/* Toast */}
      <SessionToast toast={toast} toastAction={toastAction} />

      {/* Floating save FAB (mobile) */}
      <SessionSaveFab dirty={dirty} autoSaveLabel={autoSaveLabel} saving={saving} onSave={save} />

      {/* Modals — gebündelt hinter einem einzigen activeModal-State,
          siehe SessionModalsLayer.jsx (PHASE4_TODO.md Stück 1). */}
      <SessionModalsLayer
        activeModal={activeModal}
        onClose={() => setActiveModal(null)}
        location={location} setLocation={v => { setLocation(v); scheduleAutoSave(); }}
        duration={duration} setDuration={v => { setDuration(v); scheduleAutoSave(); }}
        gpsMapsUrl={gpsMapsUrl} gateTimes={gateTimes}
        trainingsart={trainingsart} setTrainingsart={v => { setTrainingsart(v); scheduleAutoSave(); }}
        notes={notes} setNotes={v => { setNotes(v); scheduleAutoSave(); }}
        onDownload={handleDownload}
        onExportObsidian={exportObsidian}
        coachFeedback={coachFeedback}
        date={date}
        sessionGate={sessionGate}
        currentSubTab={currentSubTab}
        exercises={exercises}
        sessionMode={sessionMode} setSessionMode={setSessionMode}
        block={block} setBlock={v => { setBlock(v); scheduleAutoSave(); }}
        onApplyRoutine={addFromTemplate ? applyNextRoutine : undefined}
        onSplitLongPress={addFromTemplate ? (k) => { setActiveModal(null); setPlanSplit(k); } : undefined}
        onSubNav={onSubNav}
        onStartGate={() => { startSessionGate(); setActiveModal(null); }}
        onStopGate={stopSessionGate}
      />
    </div>
  );
}
