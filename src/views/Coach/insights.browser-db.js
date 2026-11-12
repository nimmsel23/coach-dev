let rejectReview = true;
let rejectDrafts = true;
export const fixtureState = { calls: [] };
export async function checkClientGaps(uid) {
  fixtureState.calls.push(['gaps', uid]);
  throw new Error('Prüfdienst nicht erreichbar');
}
export async function getCoachDrafts({ uid }) {
  fixtureState.calls.push(['drafts', uid]);
  if (rejectDrafts) { rejectDrafts = false; throw new Error('Entwurfsdienst nicht erreichbar'); }
  return [{ id: `draft-${uid}`, uid, name: uid, kind: 'feedback', status: 'pending', text: `Entwurf für ${uid}`, created_at: '2026-11-12' }];
}
export async function reviewCoachDraft(id, uid, status) {
  fixtureState.calls.push(['review', id, uid, status]);
  if (rejectReview) { rejectReview = false; return { ok: false }; }
  return { ok: true };
}
let failHabitLoad = true;
let failHabitSave = true;
let habitConfig = { tags: ['Push'], targetCycles: 6 };
export async function getClientJournalFeed() { return []; }
export async function getClientHabitCycleConfig() {
  if (failHabitLoad) { failHabitLoad = false; throw new Error('unavailable'); }
  return structuredClone(habitConfig);
}
export async function saveClientHabitCycleConfig(uid, config) {
  fixtureState.calls.push(['habit-save', uid, structuredClone(config)]);
  if (failHabitSave) { failHabitSave = false; return { ok: false }; }
  habitConfig = structuredClone(config);
  return { ok: true };
}
export async function getGlobalJournalFeed() {
  return [
    { id: 'same-day', userId: 'a', type: 'workout', date: '2026-11-12', coachFeedback: 'Feedback A' },
    { id: 'same-day', userId: 'b', type: 'workout', date: '2026-11-12', coachFeedback: 'Feedback B' },
    { id: 'same-day', userId: 'a', type: 'journal', date: '2026-11-12', coachFeedback: 'Journal A' },
  ];
}
export async function getAllUserProfiles() { return { a: { displayName: 'Anna' }, b: { displayName: 'Ben' } }; }
export function saveCoachFeedback(uid, id, type, text) {
  fixtureState.calls.push(['feedback', uid, id, type, text]);
  return new Promise((resolve) => {
    fixtureState.feedbackPending ||= {};
    fixtureState.feedbackPending[uid] = resolve;
  });
}

export function getUid() { return 'fixture-coach'; }
