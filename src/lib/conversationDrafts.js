// Device-local drafts are isolated by authenticated account and conversation.
const key = (author, client) => `coach-conversation-draft-v1:${encodeURIComponent(author)}:${encodeURIComponent(client)}`;
export function readConversationDraft(author, client) {
  try {
    const value = JSON.parse(localStorage.getItem(key(author, client)) || 'null');
    return value && typeof value.text === 'string' && value.text.length <= 4000 ? { text: value.text, plan: value.plan && typeof value.plan.id === 'string' && !value.plan.id.includes('/') && typeof value.plan.name === 'string' && Number.isInteger(value.plan.version) && value.plan.version > 0 ? { id: value.plan.id, name: value.plan.name, version: value.plan.version } : null } : { text: '', plan: null };
  } catch { return { text: '', plan: null }; }
}
export function saveConversationDraft(author, client, value) {
  try {
    if (!value.text && !value.plan) localStorage.removeItem(key(author, client));
    else localStorage.setItem(key(author, client), JSON.stringify(value));
    return true;
  } catch { return false; }
}

export function clearConversationDraftIfUnchanged(author, client, expectedDraft) {
  let stored;
  try { stored = localStorage.getItem(key(author, client)); } catch { return false; }
  if (stored === null) return true;
  let draft;
  try { draft = JSON.parse(stored); } catch { return true; }
  if (!draft || typeof draft.text !== 'string' || draft.text.length > 4000
    || draft.text !== expectedDraft?.text) return true;
  const actualPlan = draft.plan;
  const expectedPlan = expectedDraft.plan;
  const samePlan = actualPlan == null && expectedPlan == null
    || actualPlan && expectedPlan
      && typeof actualPlan.id === 'string' && !actualPlan.id.includes('/')
      && typeof actualPlan.name === 'string'
      && Number.isInteger(actualPlan.version) && actualPlan.version > 0
      && actualPlan.id === expectedPlan.id && actualPlan.name === expectedPlan.name
      && actualPlan.version === expectedPlan.version;
  if (!samePlan) return true;
  try { localStorage.removeItem(key(author, client)); return true; } catch { return false; }
}
