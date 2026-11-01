import { useState, useEffect } from 'react';
import { Dumbbell, MessageSquare, Brain, Check } from 'lucide-react';
import { getGlobalJournalFeed, getClientJournalFeed, getAllUserProfiles, saveCoachFeedback } from '@db';

export default function ClientWorkoutsFeed({ clientUid }) {
  const [journals, setJournals] = useState([]);
  const [loadingJournals, setLoadingJournals] = useState(true);
  const [userProfiles, setUserProfiles] = useState({});
  const [submittingComment, setSubmittingComment] = useState(null);
  const [commentsText, setCommentsText] = useState({});
  const [toastMessage, setToastMessage] = useState('');
  const [filterUserId, setFilterUserId] = useState('all');
  const [filterType, setFilterType] = useState('all'); // 'all' | 'workout' | 'habit_journal'

  const triggerToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 2200);
  };

  useEffect(() => {
    setLoadingJournals(true);
    // clientUid gesetzt (aus ClientsPanel): gezielte Pro-Klient-Query statt
    // des global auf 50/100 gedeckelten Feeds — sonst können die Einträge
    // dieses Klienten durch den globalen Cutoff verschwinden, bevor der
    // uid-Filter unten sie überhaupt sieht.
    Promise.all([
      clientUid ? getClientJournalFeed(clientUid) : getGlobalJournalFeed(),
      getAllUserProfiles()
    ]).then(([feed, profiles]) => {
      setJournals(feed);
      setUserProfiles(profiles);

      // Pre-fill comment inputs with existing feedback
      const initialTexts = {};
      feed.forEach(j => {
        if (j.coachFeedback) {
          initialTexts[j.id] = j.coachFeedback;
        }
      });
      setCommentsText(initialTexts);
    }).catch(() => {
      triggerToast('Fehler beim Laden des Journal-Feeds');
    }).finally(() => {
      setLoadingJournals(false);
    });
  }, [clientUid]);

  async function handleCommentSubmit(item) {
    const text = commentsText[item.id] || '';
    if (!text.trim()) return;

    setSubmittingComment(item.id);
    try {
      await saveCoachFeedback(item.userId, item.id, item.type, text, item.habitId || null, item.date || null);
      setJournals(prev => prev.map(j => j.id === item.id ? { ...j, coachFeedback: text } : j));
      triggerToast('Kommentar gespeichert ✓');
    } catch (e) {
      console.error(e);
      triggerToast('Fehler beim Speichern des Kommentars');
    } finally {
      setSubmittingComment(null);
    }
  }

  const journalClients = [...new Set(journals.map(j => j.userId).filter(Boolean))]
    .map(uid => {
      const profile = userProfiles[uid] || {};
      return { uid, name: profile.displayName || profile.email || uid };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const effectiveFilterUserId = clientUid || filterUserId;
  const scopedJournals = clientUid ? journals.filter(j => j.userId === clientUid) : journals;
  const filteredJournals = journals.filter(j =>
    (effectiveFilterUserId === 'all' || j.userId === effectiveFilterUserId) &&
    (filterType === 'all' || j.type === filterType)
  );

  if (loadingJournals) return (
    <div className="flex items-center justify-center py-20">
      <div className="w-6 h-6 border-2 border-fit-accent/30 border-t-fit-accent rounded-full animate-spin" />
    </div>
  );

  if (scopedJournals.length === 0) return (
    <div className="card py-16 flex flex-col items-center justify-center text-center" style={{ opacity: 0.5 }}>
      <Dumbbell size={40} className="mb-3 text-fit-dim" />
      <h3 className="text-base font-semibold text-fit-ink">Keine Workouts</h3>
      <p className="text-xs mt-1" style={{ color: 'var(--dim)' }}>
        {clientUid ? 'Dieser Klient hat noch nichts geloggt' : 'Es wurden noch keine Workouts geloggt'}
      </p>
    </div>
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Filter-Leiste */}
      <div className="flex flex-wrap items-center gap-3">
        {!clientUid && (
          <select
            value={filterUserId}
            onChange={(e) => setFilterUserId(e.target.value)}
            className="bg-fit-bg2 border border-fit-line/60 rounded-full px-3 py-2 text-xs font-semibold text-fit-ink outline-none focus:border-fit-accent"
          >
            <option value="all">Alle Klienten ({journals.length})</option>
            {journalClients.map(c => (
              <option key={c.uid} value={c.uid}>
                {c.name} ({journals.filter(j => j.userId === c.uid).length})
              </option>
            ))}
          </select>
        )}

        <div className="flex gap-1 p-1 bg-fit-bg2 rounded-full border border-fit-line/40">
          {[
            { id: 'all', label: 'Alle' },
            { id: 'workout', label: 'Workouts' },
            { id: 'habit_journal', label: 'Habits' },
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setFilterType(f.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${filterType === f.id ? 'bg-fit-accent text-fit-bg' : 'text-fit-dim hover:text-fit-ink'}`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {((!clientUid && filterUserId !== 'all') || filterType !== 'all') && (
          <button
            onClick={() => { setFilterUserId('all'); setFilterType('all'); }}
            className="text-xs font-semibold text-fit-dim hover:text-fit-accent"
          >
            Filter zurücksetzen
          </button>
        )}
      </div>

      {filteredJournals.length === 0 && (
        <div className="card py-10 flex flex-col items-center justify-center text-center" style={{ opacity: 0.5 }}>
          <p className="text-xs font-medium" style={{ color: 'var(--dim)' }}>Keine Treffer für diesen Filter</p>
        </div>
      )}

      {filteredJournals.map(item => {
        const profile = userProfiles[item.userId] || {};
        const clientName = profile.displayName || profile.email || item.userId;
        const isWorkout = item.type === 'workout';

        return (
          <div key={item.id} className="card p-5 hover:border-fit-accent/25 transition-all space-y-4">
            {/* Item Header */}
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 shrink-0 rounded-xl flex items-center justify-center ${isWorkout ? 'bg-fit-accent/15 text-fit-accent' : 'bg-blue/15 text-blue'}`}>
                  {isWorkout ? <Dumbbell size={16} /> : <MessageSquare size={16} />}
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-fit-ink">{clientName}</span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${isWorkout ? 'bg-fit-accent/10 border-fit-accent/20 text-fit-accent' : 'bg-blue/10 border-blue/20 text-blue'}`}>
                      {isWorkout ? 'Workout' : 'Journal'}
                    </span>
                  </div>
                  <span className="text-xs block mt-0.5" style={{ color: 'var(--dim)', opacity: 0.6 }}>{item.date}</span>
                </div>
              </div>
            </div>

            {/* Workout Details (Effort, Mood, Notes) */}
            <div className="flex flex-wrap gap-4 text-xs bg-fit-bg2/25 p-3.5 rounded-2xl border border-fit-line/20">
              {item.effort && (
                <div className="flex items-center gap-1.5">
                  <span style={{ color: 'var(--dim)', opacity: 0.6 }}>RPE/Effort:</span>
                  <span className="text-fit-accent font-semibold bg-fit-accent/10 px-2 py-0.5 rounded-full border border-fit-accent/20">{item.effort} / 10</span>
                </div>
              )}
              {item.mood && (
                <div className="flex items-center gap-1.5">
                  <span style={{ color: 'var(--dim)', opacity: 0.6 }}>Stimmung:</span>
                  <span className="text-fit-ink bg-fit-bg2 px-2 py-0.5 rounded-full border border-fit-line/30 capitalize">{item.mood}</span>
                </div>
              )}
              {item.notes && (
                <div className="w-full leading-relaxed text-fit-ink border-t border-fit-line/10 pt-2 font-medium">
                  <span className="block mb-0.5" style={{ color: 'var(--dim)', opacity: 0.6 }}>Notizen:</span>
                  "{item.notes}"
                </div>
              )}
            </div>

            {/* Exercises list */}
            {item.exercises && item.exercises.length > 0 ? (
              <div className="space-y-2">
                <div className="text-xs font-medium pl-1" style={{ color: 'var(--dim)', opacity: 0.7 }}>
                  Übungen ({item.exercises.length})
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {item.exercises.map((ex, exIdx) => (
                    <div key={exIdx} className="bg-fit-bg2/40 p-3 rounded-2xl border border-fit-line/20 flex flex-col justify-between">
                      <div>
                        <div className="font-semibold text-xs text-fit-ink mb-1.5 flex items-center justify-between">
                          <span className="truncate max-w-[70%]">{ex.name || 'Unbekannte Übung'}</span>
                          {ex.primaryMuscles && ex.primaryMuscles.length > 0 && (
                            <span className="text-xs font-medium bg-fit-line/30 px-1.5 py-0.5 rounded-full shrink-0" style={{ color: 'var(--dim)', opacity: 0.7 }}>
                              {ex.primaryMuscles[0]}
                            </span>
                          )}
                        </div>

                        {/* Sets render */}
                        <div className="space-y-1.5 mt-2">
                          {ex.setsArray && ex.setsArray.length > 0 ? (
                            ex.setsArray.map((set, sIdx) => (
                              <div key={sIdx} className="text-xs text-fit-dim flex items-center justify-between">
                                <span style={{ opacity: 0.5 }}>Satz {sIdx + 1}:</span>
                                <span className="font-semibold text-fit-ink">
                                  {set.reps || 0} Reps {set.weight ? `@ ${set.weight} kg` : ''}
                                </span>
                              </div>
                            ))
                          ) : (
                            <div className="text-xs text-fit-dim flex items-center justify-between">
                              <span style={{ opacity: 0.5 }}>Sets:</span>
                              <span className="font-semibold text-fit-ink">
                                {ex.sets || 0} × {ex.reps || 0} {ex.weight ? `@ ${ex.weight} kg` : ''}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      {ex.note && (
                        <div className="mt-2.5 text-xs italic text-fit-dim/70 border-t border-fit-line/10 pt-1.5">
                          "{ex.note}"
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-xs leading-relaxed text-fit-ink bg-fit-bg2/40 p-4 rounded-2xl border border-fit-line/30 whitespace-pre-wrap font-medium">
                <span className="italic" style={{ opacity: 0.5 }}>Keine Übungen in diesem Workout eingetragen.</span>
              </p>
            )}

            {/* Feedback Form */}
            <div className="bg-fit-bg/50 p-4 rounded-2xl border border-fit-line/40 space-y-3">
              <div className="flex items-center gap-2 text-xs font-medium" style={{ color: 'var(--dim)', opacity: 0.7 }}>
                <Brain size={13} className="text-fit-accent" />
                <span>Kommentar / Feedback an Klienten</span>
              </div>

              <textarea
                value={commentsText[item.id] || ''}
                onChange={(e) => setCommentsText(prev => ({ ...prev, [item.id]: e.target.value }))}
                placeholder="Schreibe Feedback für dieses Workout..."
                className="w-full bg-fit-bg2 border border-fit-line/60 focus:border-fit-accent/50 focus:ring-1 focus:ring-fit-accent/30 rounded-xl p-3 text-xs text-fit-ink placeholder:opacity-40 outline-none transition-all resize-none h-20 font-medium"
              />

              <div className="flex justify-end">
                <button
                  onClick={() => handleCommentSubmit(item)}
                  disabled={submittingComment === item.id}
                  className="flex items-center gap-2 px-4 py-2 bg-fit-accent text-fit-bg rounded-full font-semibold text-xs transition-all disabled:opacity-50 hover:opacity-90"
                >
                  {submittingComment === item.id ? 'Warte…' : (
                    <>
                      <Check size={13} /> Feedback senden
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        );
      })}

      {toastMessage && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 px-5 py-2.5 rounded-full text-xs font-semibold shadow-lg z-50 bg-fit-card text-fit-accent border border-fit-line animate-in slide-in-from-bottom-4 duration-300">
          {toastMessage}
        </div>
      )}
    </div>
  );
}
