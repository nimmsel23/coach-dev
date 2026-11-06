import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { getMuscle } from '@db';
import { X } from 'lucide-react';
import AnatomyDetailModal from '../../components/AnatomyDetailModal.jsx';
import DetailedMuscleMap from '../../components/DetailedMuscleMap.jsx';
import { useEscapeKey } from '../../hooks/useEscapeKey.js';

export default function MuscleMapModal({ exercises, onClose }) {
  const [selectedMuscleId, setSelectedMuscleId] = useState(null);
  const [muscleData, setMuscleData] = useState(null);
  const [muscleLoading, setMuscleLoading] = useState(false);

  // ESC schließt dieses Modal nur, wenn nicht gerade das verschachtelte
  // AnatomyDetailModal offen ist (das hat seinen eigenen Escape-Handler,
  // der sonst gleichzeitig auslösen und beide Ebenen auf einmal
  // schließen würde).
  useEscapeKey(onClose, !!exercises.length && !selectedMuscleId);

  useEffect(() => {
    if (!selectedMuscleId) { setMuscleData(null); return; }
    setMuscleLoading(true);
    getMuscle(selectedMuscleId)
      .then(d => setMuscleData(d || null))
      .catch(() => setMuscleData(null))
      .finally(() => setMuscleLoading(false));
  }, [selectedMuscleId]);

  if (!exercises.length) return null;

  return createPortal(
    <>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
        <div className="absolute inset-0 bg-fit-scrim backdrop-blur-md" onClick={onClose} />

        <div className="relative w-full max-w-lg bg-fit-card border border-fit-line rounded-[40px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
          <div className="p-8 border-b border-fit-line/50 flex items-center justify-between">
            <div>
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-fit-accent mb-1">Anatomie-Check</h3>
              <p className="text-[10px] font-bold opacity-30 uppercase tracking-widest">Muskel anklicken für Details</p>
            </div>
            <button onClick={onClose} className="w-10 h-10 rounded-2xl bg-fit-bg2 flex items-center justify-center text-fit-dim hover:text-ink transition-colors">
              <X size={20} />
            </button>
          </div>

          <div className="p-10 flex justify-center gap-16 bg-gradient-to-b from-card to-bg2">
            <div className="flex flex-col items-center gap-4">
              <span className="text-[10px] font-black uppercase tracking-widest opacity-20">Anterior</span>
              <DetailedMuscleMap exercises={exercises} side="front" style={{ width: '180px' }} onGroupClick={setSelectedMuscleId} />
            </div>
            <div className="flex flex-col items-center gap-4">
              <span className="text-[10px] font-black uppercase tracking-widest opacity-20">Posterior</span>
              <DetailedMuscleMap exercises={exercises} side="back" style={{ width: '180px' }} onGroupClick={setSelectedMuscleId} />
            </div>
          </div>

          <div className="p-6 bg-fit-bg2 border-t border-fit-line/50 flex justify-center">
            <button onClick={onClose} className="px-8 py-3 rounded-2xl bg-fit-accent text-black text-[11px] font-black uppercase tracking-widest shadow-xl shadow-accent/20 active:scale-95 transition-all">
              Schließen
            </button>
          </div>
        </div>
      </div>

      <AnatomyDetailModal
        muscleId={selectedMuscleId}
        muscleData={muscleData}
        loading={muscleLoading}
        onClose={() => setSelectedMuscleId(null)}
      />
    </>,
    document.body
  );
}
