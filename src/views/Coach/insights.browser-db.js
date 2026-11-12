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
