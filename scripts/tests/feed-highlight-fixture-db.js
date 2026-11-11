const feed = [
  {
    id: 'push-10',
    userId: 'client-a',
    date: '2026-11-10',
    type: 'workout',
    block: 'Push',
    effort: 8,
    mood: 'klar',
    notes: 'Letzter Satz saß.',
    exercises: [{ name: 'Bankdrücken', sets: '3', reps: '8', weight: '60', primaryMuscles: ['chest'] }],
    coachFeedback: '',
  },
  {
    id: 'note-10',
    userId: 'client-a',
    date: '2026-11-10',
    type: 'journal',
    notes: 'Schlaf war kurz.',
    coachFeedback: '',
  },
  {
    id: 'habit-10',
    userId: 'client-a',
    date: '2026-11-10',
    type: 'habit_journal',
    notes: 'Spaziergang nach dem Training.',
    coachFeedback: '',
  },
  {
    id: 'pull-08',
    userId: 'client-a',
    date: '2026-11-08',
    type: 'workout',
    block: 'Pull',
    exercises: [{ name: 'Klimmzug', sets: '4', reps: '6', weight: '' }],
    notes: '',
    coachFeedback: '',
  },
]

export async function getClientJournalFeed() {
  return feed
}

export async function getGlobalJournalFeed() {
  return feed
}

export async function getAllUserProfiles() {
  return { 'client-a': { displayName: 'Anna Beispiel' } }
}

export async function saveCoachFeedback() {
  return { ok: true }
}
