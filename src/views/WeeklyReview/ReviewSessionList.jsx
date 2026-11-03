import { Dumbbell } from 'lucide-react';
import { formatRecovery } from './utils';
import { translateMuscle } from '../../lib/kb/muscles.js';

export default function ReviewSessionList({ sessions, onNavigate, muscleLanguage = 'de', taxonomy = null }) {
  return (
    <section>
      <div className="label-caps !mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
           <Dumbbell size={16} className="text-fit-accent" />
           Sessions im Detail
        </div>
      </div>
      <div className="space-y-4">
        {(sessions || []).slice().reverse().map((session, index) => {
          const isActivity = !!session.activity && !session.exercise_count;
          return (
            <button
              key={`${session.date}:${session.doc_id || session.id || session.session_id || index}`}
              onClick={() => onNavigate?.("session", session.date, session)}
              className="w-full text-left p-6 rounded-2xl border bg-fit-bg2 border-fit-line hover:border-accent/50 hover:shadow-lg transition-all flex items-center justify-between group"
            >
              <div className="flex items-center gap-5">
                <div className="w-16 h-16 rounded-[18px] bg-fit-card border border-fit-line flex flex-col items-center justify-center shadow-inner group-hover:border-accent/40 transition-colors">
                  <span className="text-[10px] font-black opacity-40 leading-none uppercase tracking-widest">{session.date.split('-')[1]}</span>
                  <span className="text-xl font-black text-fit-ink leading-none mt-1">{session.date.split('-')[2]}</span>
                </div>
                <div>
                  <div className="text-lg font-black text-fit-ink group-hover:text-accent transition-colors">{session.block}</div>
                  <div className="text-xs font-bold opacity-40 uppercase tracking-[0.2em] mt-1">
                    {isActivity ? 'Activity Log' : `${session.exercise_count} Übungen`}
                  </div>
                </div>
              </div>
              <div className="text-right flex flex-col items-end">
                {session.muscle_recovery && Object.keys(session.muscle_recovery).length > 0 ? (
                  <div className="flex justify-end gap-1.5 flex-wrap max-w-[150px]">
                     {Object.entries(session.muscle_recovery).slice(0, 4).map(([m, hrs]) => {
                       const status = hrs < 24 ? 'active' : hrs < 48 ? 'recovering' : 'fresh';
                       const colorMap = { active: 'bg-fit-red/10 text-fit-red border-fit-red/20', recovering: 'bg-fit-orange/10 text-fit-orange border-fit-orange/20', fresh: 'bg-fit-green/10 text-fit-green border-fit-green/20' };
                       return (
                         <span key={m} className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-1.5 rounded-md border ${colorMap[status]}`}>
                           {translateMuscle(m, taxonomy, muscleLanguage)} {formatRecovery(hrs)}
                         </span>
                       )
                     })}
                  </div>
                ) : (
                  <div className="text-xs font-black uppercase tracking-widest opacity-20 bg-fit-bg2 px-3.5 py-1.5 rounded-lg border border-fit-line">
                    Base / No Prev
                  </div>
                )}
              </div>
            </button>
          )
        })}
        {(sessions || []).length === 0 && (
           <div className="py-12 text-center text-xs font-black opacity-30 uppercase tracking-[0.2em] border border-dashed rounded-3xl">Keine Sessions in dieser Woche</div>
        )}
      </div>
    </section>
  );
}
