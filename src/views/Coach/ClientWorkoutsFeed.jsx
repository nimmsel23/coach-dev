import { useState, useEffect, useMemo, useRef } from 'react';
import { Dumbbell, MessageSquare, Brain, Check } from 'lucide-react';
import { getGlobalJournalFeed, getClientJournalFeed, getAllUserProfiles, saveCoachFeedback } from '@db';
import { feedEntryKey, feedItemsOnDate, formatFeedDate, highlightStatus, normalizeFeedDate } from './feedHighlight.js';

export default function ClientWorkoutsFeed({
  clientUid,
  initialTypeFilter = 'all',
  onSelectClient,
  highlightDate = '',
  onDismissHighlight,
}) {
  const [journals, setJournals] = useState([]);
  const [loadingJournals, setLoadingJournals] = useState(true);
  const [userProfiles, setUserProfiles] = useState({});
  const [submittingComments, setSubmittingComments] = useState(() => new Set());
  const pendingComments = useRef(new Set());
  const [commentsText, setCommentsText] = useState({});
  const [toastMessage, setToastMessage] = useState('');
  const [filterUserId, setFilterUserId] = useState('all');
  const [filterType, setFilterType] = useState(initialTypeFilter); // 'all' | 'workout' | 'habit_journal'

  const triggerToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 2200);
  };

  useEffect(() => {
    let cancelled = false;
    setLoadingJournals(true);

    const applyFeed = (feed, profiles) => {
      if (cancelled) return;
      setJournals(feed);
      setUserProfiles(profiles);
      const initialTexts = {};
      feed.forEach((j) => {
        if (j.coachFeedback) initialTexts[feedEntryKey(j)] = j.coachFeedback;
      });
      setCommentsText((prev) => ({ ...initialTexts, ...prev }));
      setLoadingJournals(false);
    };

    // clientUid gesetzt: Pro-Klient-Query (IndexedDB-Cache in firestore/coach.js).
    Promise.all([
      clientUid ? getClientJournalFeed(clientUid) : getGlobalJournalFeed(),
      getAllUserProfiles(),
    ]).then(([feed, profiles]) => applyFeed(feed, profiles)).catch(() => {
      if (!cancelled) triggerToast('Fehler beim Laden des Journal-Feeds');
      if (!cancelled) setLoadingJournals(false);
    });

    // Background-Refresh aus IDB-SWR → UI nachziehen
    const onCache = (event) => {
      const { key, data } = event.detail || {};
      if (!key || cancelled) return;
      if (key.startsWith('feed:')) {
        if (clientUid && !key.includes(`feed:client:${clientUid}:`)) return;
        if (!clientUid && !key.startsWith('feed:global:')) return;
        setJournals(data);
        setLoadingJournals(false);
      }
      if (key === 'profiles:all') setUserProfiles(data);
    };
    window.addEventListener('vos-coach-cache', onCache);
    return () => {
      cancelled = true;
      window.removeEventListener('vos-coach-cache', onCache);
    };
  }, [clientUid]);

  async function handleCommentSubmit(item) {
    const key = feedEntryKey(item);
    if (pendingComments.current.has(key)) return;
    const text = commentsText[key] || '';
    if (!text.trim()) return;

    pendingComments.current.add(key);
    setSubmittingComments((prev) => new Set(prev).add(key));
    try {
      const saved = await saveCoachFeedback(item.userId, item.id, item.type, text, item.habitId || null, item.date || null);
      if (saved?.ok === false) throw new Error('Kommentar konnte nicht gespeichert werden.');
      setJournals(prev => prev.map(j => feedEntryKey(j) === key ? { ...j, coachFeedback: text } : j));
      triggerToast('Kommentar gespeichert ✓');
    } catch (e) {
      console.error(e);
      triggerToast('Fehler beim Speichern des Kommentars');
    } finally {
      pendingComments.current.delete(key);
      setSubmittingComments((prev) => { const next = new Set(prev); next.delete(key); return next; });
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
  const highlightActive = Boolean(normalizeFeedDate(highlightDate));
  const highlighted = useMemo(() => {
    const pool = clientUid ? journals.filter((item) => item.userId === clientUid) : journals;
    return feedItemsOnDate(pool, highlightDate);
  }, [journals, highlightDate, clientUid]);
  const highlightedIds = useMemo(() => new Set(highlighted.map(feedEntryKey)), [highlighted]);
  const visibleHighlighted = filteredJournals.filter((item) => highlightedIds.has(feedEntryKey(item)));
  const hiddenCount = highlighted.length - visibleHighlighted.length;
  const firstVisibleId = visibleHighlighted[0] ? feedEntryKey(visibleHighlighted[0]) : '';
  const anchorRef = useRef(null);
  const scrolledFor = useRef('');

  useEffect(() => {
    if (loadingJournals || !firstVisibleId) return;
    const key = `${highlightDate}:${firstVisibleId}`;
    if (scrolledFor.current === key) return;
    scrolledFor.current = key;
    const node = anchorRef.current;
    if (!node) return;
    node.scrollIntoView({ block: 'center' });
    node.focus({ preventScroll: true });
  }, [loadingJournals, highlightDate, firstVisibleId]);

  function resetFilters() {
    setFilterUserId('all');
    setFilterType('all');
  }

  const highlightBanner = highlightActive && !loadingJournals ? (
    <div
      role="status"
      data-testid="feed-highlight-banner"
      className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-fit-accent/40 bg-fit-accent/10 px-4 py-3 text-xs text-fit-ink"
    >
      <p>{highlightStatus({ dateLabel: formatFeedDate(highlightDate), matched: highlighted.length, hidden: hiddenCount })}</p>
      <div className="flex flex-wrap gap-2">
        {hiddenCount > 0 && (
          <button type="button" onClick={resetFilters} className="rounded-full bg-fit-accent px-3 py-1.5 font-semibold text-fit-bg">
            Filter zurücksetzen
          </button>
        )}
        {onDismissHighlight && (
          <button type="button" onClick={onDismissHighlight} className="rounded-full border border-fit-line/50 px-3 py-1.5 font-semibold text-fit-ink">
            Markierung schließen
          </button>
        )}
      </div>
    </div>
  ) : null;

  if (loadingJournals) return (
    <div className="flex items-center justify-center py-20">
      <div className="w-6 h-6 border-2 border-fit-accent/30 border-t-fit-accent rounded-full animate-spin" />
    </div>
  );

  if (scopedJournals.length === 0) return (
    <div className="space-y-4">
      {highlightBanner}
      <div className="card py-16 flex flex-col items-center justify-center text-center" style={{ opacity: 0.5 }}>
        <Dumbbell size={40} className="mb-3 text-fit-dim" />
        <h3 className="text-base font-semibold text-fit-ink">Keine Workouts</h3>
        <p className="text-xs mt-1" style={{ color: 'var(--dim)' }}>
          {clientUid ? 'Dieser Klient hat noch nichts geloggt' : 'Es wurden noch keine Workouts geloggt'}
        </p>
      </div>
    </div>
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {highlightBanner}
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
        const isHighlighted = highlightedIds.has(feedEntryKey(item));
        const key = feedEntryKey(item);
        const isAnchor = key === firstVisibleId;

        return (
          <div
            key={key}
            data-entry-key={key}
            ref={isAnchor ? anchorRef : undefined}
            tabIndex={isAnchor ? -1 : undefined}
            data-testid={isHighlighted ? 'feed-highlight-card' : undefined}
            aria-current={isHighlighted ? 'date' : undefined}
            className={`card space-y-4 p-5 outline-none transition-all ${isHighlighted ? '' : 'hover:border-fit-accent/25'}`}
            style={isHighlighted ? { borderColor: 'var(--accent)', boxShadow: '0 0 0 2px color-mix(in srgb, var(--accent) 40%, transparent)' } : undefined}
          >
            {/* Item Header */}
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 shrink-0 rounded-xl flex items-center justify-center ${isWorkout ? 'bg-fit-accent/15 text-fit-accent' : 'bg-blue/15 text-blue'}`}>
                  {isWorkout ? <Dumbbell size={16} /> : <MessageSquare size={16} />}
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    {onSelectClient && item.userId ? (
                      <button
                        type="button"
                        onClick={() => onSelectClient(item.userId)}
                        className="text-sm font-semibold text-fit-ink underline-offset-2 hover:text-fit-accent hover:underline"
                      >
                        {clientName}
                      </button>
                    ) : (
                      <span className="text-sm font-semibold text-fit-ink">{clientName}</span>
                    )}
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${isWorkout ? 'bg-fit-accent/10 border-fit-accent/20 text-fit-accent' : 'bg-blue/10 border-blue/20 text-blue'}`}>
                      {isWorkout ? (item.block || item.trainingsart || 'Workout') : 'Journal'}
                    </span>
                  </div>
                  <span className="mt-0.5 flex flex-wrap items-center gap-2 text-xs" style={{ color: 'var(--dim)', opacity: 0.6 }}>
                    <span>{item.date}</span>
                    {isHighlighted && <span className="font-medium text-fit-accent">Dieser Tag</span>}
                  </span>
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
                aria-label={`Feedback für ${clientName}, ${isWorkout ? 'Workout' : 'Journaleintrag'}, ${formatFeedDate(item.date)}`}
                value={commentsText[key] || ''}
                onChange={(e) => setCommentsText(prev => ({ ...prev, [key]: e.target.value }))}
                placeholder="Schreibe Feedback für dieses Workout..."
                className="w-full bg-fit-bg2 border border-fit-line/60 focus:border-fit-accent/50 focus:ring-1 focus:ring-fit-accent/30 rounded-xl p-3 text-xs text-fit-ink placeholder:opacity-40 outline-none transition-all resize-none h-20 font-medium"
              />

              <div className="flex justify-end">
                <button
                  onClick={() => handleCommentSubmit(item)}
                  disabled={submittingComments.has(key)}
                  className="flex min-h-11 items-center gap-2 px-4 py-2 bg-fit-accent text-fit-bg rounded-full font-semibold text-xs transition-all disabled:opacity-50 hover:opacity-90"
                >
                  {submittingComments.has(key) ? 'Warte…' : (
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
