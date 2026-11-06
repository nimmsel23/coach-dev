import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  Activity,
  Apple,
  BookOpen,
  Coffee,
  Droplet,
  Dumbbell,
  Feather,
  Footprints,
  Heart,
  Home,
  Moon,
  Save,
  Sun,
  Sunrise,
  X,
  Zap,
} from "lucide-react";

const ICON_COMPONENTS_MAP = {
  Activity,
  Footprints,
  Apple,
  BookOpen,
  Coffee,
  Droplet,
  Dumbbell,
  Feather,
  Heart,
  Home,
  Moon,
  Sunrise,
  Sun,
  Zap,
};

export default function HabitJournalModal({
  open,
  onClose,
  habit,
  date,
  journalText,
  setJournalText,
  isJournalSaving,
  onSaveJournal,
}) {
  const textareaRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => textareaRef.current?.focus(), 50);
    return () => clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event) {
      if (event.key === "Escape") {
        onSaveJournal();
        onClose();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose, onSaveJournal]);

  if (!open || !habit) return null;

  const Icon = ICON_COMPONENTS_MAP[habit.icon || "Activity"] || Activity;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-fit-scrim p-4 backdrop-blur-md animate-in fade-in duration-200 sm:p-8">
      <div className="absolute inset-0" onClick={() => { onSaveJournal(); onClose(); }} />
      <div className="relative flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-fit-line bg-fit-card shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between border-b border-fit-line/60 px-8 py-6">
          <div className="flex items-center gap-3">
            <Icon size={28} className="text-fit-ink" />
            <div>
              <h2 className="text-2xl font-black leading-tight text-fit-ink">{habit.name}</h2>
              <div className="mt-0.5 text-[10px] font-black uppercase tracking-widest text-fit-dim">{date}</div>
            </div>
          </div>
          <button
            onClick={() => { onSaveJournal(); onClose(); }}
            className="p-2 text-fit-dim transition-all hover:text-fit-red"
            aria-label="Schließen"
          >
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-8 py-6">
          <textarea
            ref={textareaRef}
            value={journalText}
            onChange={(event) => setJournalText(event.target.value)}
            onBlur={() => onSaveJournal()}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                event.preventDefault();
                onSaveJournal();
                onClose();
              }
            }}
            className="min-h-[60vh] w-full resize-none border-0 bg-transparent text-base font-medium leading-relaxed text-fit-ink outline-none"
          />
        </div>

        <div className="flex items-center justify-between border-t border-fit-line/60 px-8 py-4 text-[10px] font-black uppercase tracking-widest text-fit-dim">
          <span>Esc · schließen + speichern</span>
          <div className="flex items-center gap-2">
            {isJournalSaving && <Save size={12} className="animate-pulse text-fit-accent" />}
            <span>Strg + Enter · speichern</span>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
