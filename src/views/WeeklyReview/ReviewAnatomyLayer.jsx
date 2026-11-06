import { useEffect, useState } from 'react';
import { getAnatomy } from '@db';
import { BookOpen, ChevronDown, ChevronUp } from 'lucide-react';

function ExerciseAnatomyCard({ ex }) {
  const [lesson, setLesson] = useState(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!ex.exercise_id) return;
    getAnatomy(ex.exercise_id).then(setLesson).catch(() => {});
  }, [ex.exercise_id]);

  const muscles = ex.primary_muscles?.length
    ? ex.primary_muscles
    : ex.secondary_muscles?.slice(0, 2) || [];

  return (
    <div className="bg-fit-card rounded-[32px] border border-fit-line/50 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full p-5 flex items-center justify-between gap-4 text-left hover:bg-bg2/50 transition-colors"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm font-black text-fit-ink truncate">{ex.display_name}</span>
            <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md bg-fit-accent/10 text-fit-accent border border-fit-accent/20">
              {ex.count}×
            </span>
            {!lesson && ex.exercise_id && (
              <span className="text-[9px] font-bold text-fit-dim/30 uppercase tracking-widest">kein Teaching</span>
            )}
          </div>
          <div className="flex gap-2 mt-1.5 flex-wrap">
            {muscles.map(m => (
              <span key={m} className="text-[9px] font-bold text-fit-dim/60 uppercase tracking-widest">{m}</span>
            ))}
          </div>
        </div>
        {lesson && (
          <div className="text-fit-dim/30 shrink-0">
            {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </div>
        )}
      </button>

      {open && lesson && (
        <div className="px-5 pb-5 space-y-4 border-t border-fit-line/30 pt-4 animate-in slide-in-from-top-2 duration-200">
          {lesson.joint_actions?.length > 0 && (
            <div>
              <div className="text-[9px] font-black uppercase tracking-[0.2em] text-fit-dim/40 mb-2">Gelenkbewegungen</div>
              <div className="flex flex-wrap gap-2">
                {lesson.joint_actions.map((a, i) => (
                  <span key={i} className="text-[10px] font-bold px-3 py-1 rounded-lg bg-fit-bg2 border border-fit-line text-fit-dim/80">{a}</span>
                ))}
              </div>
            </div>
          )}

          {lesson.teaching_points?.length > 0 && (
            <div>
              <div className="text-[9px] font-black uppercase tracking-[0.2em] text-fit-dim/40 mb-2">Teaching Points</div>
              <ul className="space-y-1.5">
                {lesson.teaching_points.slice(0, 3).map((p, i) => (
                  <li key={i} className="text-[11px] font-medium text-fit-dim/80 leading-relaxed pl-3 border-l-2 border-fit-accent/30">{p}</li>
                ))}
              </ul>
            </div>
          )}

          {lesson.common_errors?.length > 0 && (
            <div>
              <div className="text-[9px] font-black uppercase tracking-[0.2em] text-fit-red/50 mb-2">Häufige Fehler</div>
              <ul className="space-y-1">
                {lesson.common_errors.slice(0, 2).map((e, i) => (
                  <li key={i} className="text-[11px] font-medium text-fit-dim/60 leading-relaxed pl-3 border-l-2 border-fit-red/20">{e}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ReviewAnatomyLayer({ topExercises = [] }) {
  const withId = topExercises.filter(ex => ex.exercise_id);
  const withoutId = topExercises.filter(ex => !ex.exercise_id);

  if (topExercises.length === 0) {
    return (
      <div className="py-16 text-center text-[10px] font-black opacity-30 uppercase tracking-[0.2em] border border-dashed rounded-3xl">
        Keine Übungen diese Woche
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-xl bg-fit-accent/10 flex items-center justify-center text-fit-accent">
          <BookOpen size={16} />
        </div>
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-fit-accent">Anatomische Wochenbilanz</div>
          <div className="text-[9px] font-bold text-fit-dim/40 uppercase tracking-widest mt-0.5">Trainingswoche als angewandte Anatomie</div>
        </div>
      </div>

      <div className="space-y-3">
        {withId.map(ex => (
          <ExerciseAnatomyCard key={ex.display_name} ex={ex} />
        ))}
        {withoutId.length > 0 && (
          <div className="pt-2">
            <div className="text-[9px] font-black uppercase tracking-[0.2em] text-fit-dim/30 mb-2 ml-1">Ohne KB-Eintrag</div>
            <div className="flex flex-wrap gap-2">
              {withoutId.map(ex => (
                <span key={ex.display_name} className="text-[10px] font-bold px-3 py-1.5 rounded-lg bg-fit-bg2 border border-fit-line text-fit-dim/50">
                  {ex.display_name} <span className="text-fit-dim/30">{ex.count}×</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
