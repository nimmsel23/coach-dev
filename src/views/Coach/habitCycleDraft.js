const key = (coach, client) => `coach:habit-draft:${JSON.stringify([coach, client])}`;
const validConfig = (value) => value && Array.isArray(value.tags)
  && value.tags.every((tag) => typeof tag === 'string') && Number.isFinite(value.targetCycles);

export function readHabitDraft(storage, coach, client) {
  if (!coach || !client) return null;
  try {
    const draft = JSON.parse(storage.getItem(key(coach, client)));
    return draft?.version === 1 && validConfig(draft.config) && validConfig(draft.baseConfig)
      && typeof draft.newTag === 'string' ? draft : null;
  } catch { return null; }
}

export function writeHabitDraft(storage, coach, client, draft) {
  if (!coach || !client) return false;
  try {
    storage.setItem(key(coach, client), JSON.stringify({ ...draft, version: 1 }));
    return true;
  } catch { return false; }
}

export function clearHabitDraft(storage, coach, client) {
  if (!coach || !client) return false;
  try { storage.removeItem(key(coach, client)); return true; } catch { return false; }
}
