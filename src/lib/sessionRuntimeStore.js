const STORAGE_KEY = 'fitness-session-runtime-v1';

function normalizeSessionId(sessionId) {
  return sessionId == null ? null : String(sessionId);
}

function buildKey(date, sessionId = null) {
  const normalizedId = normalizeSessionId(sessionId);
  return normalizedId ? `${date}__${normalizedId}` : String(date || '');
}

function readStore() {
  if (typeof window === 'undefined' || !window.localStorage) return {};
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}') || {};
  } catch {
    return {};
  }
}

function writeStore(store) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {}
}

function buildRuntimeMeta(entry) {
  return {
    syncState: entry.syncState || 'local',
    queued: entry.syncState === 'queued',
    updatedAt: entry.updatedAt || null,
  };
}

function materializeDraft(entry) {
  return {
    ...(entry.sessionData || {}),
    id: entry.sessionId,
    date: entry.date,
    saved_at: entry.updatedAt || new Date().toISOString(),
    _runtime: buildRuntimeMeta(entry),
  };
}

function sortSessions(a, b) {
  return String(a.saved_at || '').localeCompare(String(b.saved_at || ''));
}

export function saveSessionRuntimeDraft(date, sessionData, sessionId = null, options = {}) {
  if (!date) return null;
  const store = readStore();
  const key = buildKey(date, sessionId);
  store[key] = {
    date,
    sessionId: normalizeSessionId(sessionId),
    sessionData: sessionData || {},
    syncState: options.syncState || 'local',
    updatedAt: new Date().toISOString(),
  };
  writeStore(store);
  return store[key];
}

export function getSessionRuntimeDraft(date, sessionId = null) {
  const entry = readStore()[buildKey(date, sessionId)];
  return entry ? { ...entry, _runtime: buildRuntimeMeta(entry) } : null;
}

export function clearSessionRuntimeDraft(date, sessionId = null) {
  const key = buildKey(date, sessionId);
  const store = readStore();
  if (!(key in store)) return;
  delete store[key];
  writeStore(store);
}

export function clearQueuedSessionRuntimeDraftsForDate(date) {
  if (!date) return;
  const store = readStore();
  let changed = false;
  for (const [key, entry] of Object.entries(store)) {
    if (entry?.date !== date) continue;
    if (entry?.syncState !== 'queued') continue;
    delete store[key];
    changed = true;
  }
  if (changed) writeStore(store);
}

export function listPendingSessionRuntimeDrafts() {
  return Object.values(readStore())
    .filter((entry) => entry && entry.syncState !== 'synced')
    .map((entry) => ({ ...entry, _runtime: buildRuntimeMeta(entry) }));
}

export function mergeSessionRuntimeDrafts(date, sessions = []) {
  const pending = listPendingSessionRuntimeDrafts().filter((entry) => entry.date === date);
  if (pending.length === 0) return sessions;
  const merged = new Map(
    (Array.isArray(sessions) ? sessions : []).map((session) => [buildKey(session.date || date, session.id), session])
  );
  for (const draft of pending) {
    const key = buildKey(draft.date, draft.sessionId);
    const base = merged.get(key) || { id: draft.sessionId, date: draft.date, exercises: [] };
    merged.set(key, { ...base, ...materializeDraft(draft) });
  }
  return Array.from(merged.values()).sort(sortSessions);
}

export function mergeSessionRuntimeDraftsIntoHistory(sessions = []) {
  const merged = new Map(
    (Array.isArray(sessions) ? sessions : []).map((session) => [buildKey(session.date, session.id), session])
  );
  for (const draft of listPendingSessionRuntimeDrafts()) {
    const key = buildKey(draft.date, draft.sessionId);
    const base = merged.get(key) || { id: draft.sessionId, date: draft.date, exercises: [] };
    merged.set(key, { ...base, ...materializeDraft(draft) });
  }
  return Array.from(merged.values())
    .sort((a, b) => `${b.date || ''} ${b.saved_at || ''}`.localeCompare(`${a.date || ''} ${a.saved_at || ''}`));
}
