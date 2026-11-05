import { useRef } from 'react';
import { createPortal } from 'react-dom';
import { useSwipeToDismiss } from '../../hooks/useSwipeToDismiss.js';
import SessionSidebar from './SessionSidebar';

export default function SidebarSheet({
  onClose,
  location, setLocation, duration, setDuration,
  gpsMapsUrl, gateTimes,
  trainingsart, setTrainingsart,
  notes, setNotes,
  onDownload, onExportObsidian, coachFeedback = ""
}) {
  // Auf lg ist das Sheet ein rechter Drawer — dort keine Wisch-Geste
  const backdropRef = useRef(null);
  const sheetRef = useSwipeToDismiss(onClose, { backdropRef, media: '(max-width: 1023px)' });

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center lg:items-stretch lg:justify-end animate-in fade-in duration-200">
      <div ref={backdropRef} className="absolute inset-0 bg-fit-scrim backdrop-blur-xs" onClick={onClose} />
      <div
        ref={sheetRef}
        className="relative w-full max-w-2xl bg-fit-card border-t border-fit-line rounded-t-[40px] shadow-2xl animate-in slide-in-from-bottom duration-300 max-h-[85vh] overflow-y-auto overscroll-contain
          lg:max-w-[420px] lg:h-full lg:max-h-full lg:rounded-none lg:border-t-0 lg:border-l lg:slide-in-from-bottom-0 lg:slide-in-from-right"
      >
        <div className="sticky top-0 bg-fit-card pt-4 pb-2 flex justify-center z-10 lg:hidden">
          <div className="w-10 h-1 rounded-full bg-fit-line" />
        </div>
        <SessionSidebar
          location={location} setLocation={setLocation}
          duration={duration} setDuration={setDuration}
          gpsMapsUrl={gpsMapsUrl} gateTimes={gateTimes}
          trainingsart={trainingsart} setTrainingsart={setTrainingsart}
          notes={notes} setNotes={setNotes}
          onDownload={onDownload}
          onExportObsidian={onExportObsidian}
          onClose={onClose}
          coachFeedback={coachFeedback}
        />
        <div className="h-8" />
      </div>
    </div>,
    document.body
  );
}
