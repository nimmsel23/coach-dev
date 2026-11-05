/**
 * SessionModalsLayer — bündelt alle Session-Modals hinter einem einzigen
 * `activeModal`-State (PHASE4_TODO.md Stück 1), statt dass jedes Modal
 * seinen eigenen Boolean + `createPortal()`-Call an verschiedenen Stellen
 * in SessionEditor.jsx trägt (vorher: `showSidebar`, `showTabSettings`,
 * lokales `gateSheetOpen`). Rein mechanisch zusammengeführt — jedes Modal
 * ist unverändert dieselbe Komponente wie vorher, nur zentral geroutet.
 * `activeModal`: null | 'sidebar' | 'settings' | 'gate'.
 */

import { useEffect } from 'react';
import SidebarSheet from './SidebarSheet';
import SourceSettingsModal from './SourceSettingsModal';
import SessionGateSheet from './SessionGateSheet.jsx';
import { useEscapeKey } from '../../hooks/useEscapeKey.js';

export default function SessionModalsLayer({
  activeModal, onClose,
  // sidebar
  location, setLocation, duration, setDuration, gpsMapsUrl, gateTimes,
  trainingsart, setTrainingsart, notes, setNotes,
  onDownload, onExportObsidian, coachFeedback,
  // gate
  date, sessionGate, currentSubTab, exercises, sessionMode, setSessionMode, block, setBlock, onSplitLongPress, onApplyRoutine, onSubNav, onStartGate, onStopGate,
}) {
  // ESC schließt das jeweils offene Modal — ein zentraler Handler reicht,
  // weil `activeModal` bereits zentral gebündelt ist (siehe Kommentar oben),
  // statt in SidebarSheet/SourceSettingsModal/SessionGateSheet je einzeln
  // denselben Listener zu registrieren.
  useEscapeKey(onClose, activeModal !== null);

  // Sichtbarkeit für App.jsx' globale Alt+Pfeil-Tab-Navigation: `activeModal`
  // lebt in useSession.js, App.jsx kennt diesen State nicht (kein
  // State-Lifting extra dafür, siehe Kommentar dort). Statt Props durch
  // views/Session/index.jsx durchzureichen, ein simples DOM-Flag am
  // document.body — App.jsx liest es bei jedem Tastendruck, kein Re-Render
  // nötig, funktioniert unabhängig davon, welcher Tab/View gerade aktiv ist.
  useEffect(() => {
    if (activeModal !== null) {
      document.body.dataset.sessionModalOpen = 'true';
    } else {
      delete document.body.dataset.sessionModalOpen;
    }
    return () => { delete document.body.dataset.sessionModalOpen; };
  }, [activeModal]);

  return (
    <>
      {activeModal === 'sidebar' && (
        <SidebarSheet
          onClose={onClose}
          location={location} setLocation={setLocation}
          duration={duration} setDuration={setDuration}
          gpsMapsUrl={gpsMapsUrl} gateTimes={gateTimes}
          trainingsart={trainingsart} setTrainingsart={setTrainingsart}
          notes={notes} setNotes={setNotes}
          onDownload={onDownload}
          onExportObsidian={onExportObsidian}
          coachFeedback={coachFeedback}
        />
      )}

      {activeModal === 'settings' && (
        <SourceSettingsModal onClose={onClose} />
      )}

      <SessionGateSheet
        open={activeModal === 'gate' || activeModal === 'hub'}
        initialExpanded={activeModal === 'hub'}
        onClose={onClose}
        date={date}
        sessionGate={sessionGate}
        currentSubTab={currentSubTab}
        exercises={exercises}
        sessionMode={sessionMode} setSessionMode={setSessionMode}
        block={block} setBlock={setBlock} onSplitLongPress={onSplitLongPress} onApplyRoutine={onApplyRoutine}
        onSubNav={onSubNav}
        onStart={onStartGate}
        onStop={onStopGate}
      />
    </>
  );
}
