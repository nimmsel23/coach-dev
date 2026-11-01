import { api, localToday } from "./core";

const LOCAL_KEYS = {
  settings: "fitness-local-settings",
  layout: "fitness-local-layout",
  push: "fitness-local-push-settings",
};

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}

function writeJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

export async function getSettings() { return readJSON(LOCAL_KEYS.settings, { theme: "honey", themeMode: "manual" }); }
export async function saveSettings(settings) { writeJSON(LOCAL_KEYS.settings, settings); return { ok: true }; }

export async function getLayout() {
  const layout = readJSON(LOCAL_KEYS.layout, null);
  return layout?.layout || null;
}
export async function saveLayout(layout) { writeJSON(LOCAL_KEYS.layout, { layout }); return { ok: true }; }

export async function getPushSettings() {
  const data = readJSON(LOCAL_KEYS.push, {
    enabled: false,
    tokens: [],
    types: { workout: true, activeWorkout: true, habit: true, coverage: true, pplRatio: true, restday: true },
    reminderTime: "18:00",
  });
  const tokens = Array.from(new Set([
    ...(Array.isArray(data?.tokens) ? data.tokens : []),
    ...(data?.token ? [data.token] : []),
  ].filter(Boolean)));
  return {
    enabled: false,
    types: { workout: true, activeWorkout: true, habit: true, coverage: true, pplRatio: true, restday: true },
    reminderTime: "18:00",
    ...data,
    token: tokens[0] || data?.token || null,
    tokens,
  };
}

export async function savePushSettings(settings) {
  writeJSON(LOCAL_KEYS.push, {
    ...settings,
    tokens: Array.from(new Set([
      ...(Array.isArray(settings?.tokens) ? settings.tokens : []),
      ...(settings?.token ? [settings.token] : []),
    ].filter(Boolean))),
  });
  return { ok: true };
}

export async function getBodyEntry(date) {
  try {
    const data = await api.get(`/fitness/body?days=365`);
    return (data?.entries || []).find(e => e.date === date) || null;
  } catch { return null; }
}

export async function saveBodyEntry(date, data) {
  try {
    await api.post(`/fitness/body`, { ...data, date });
    return { ok: true };
  } catch { return { ok: false }; }
}

export async function getBodyEntries(days = 30) {
  try {
    const data = await api.get(`/fitness/body?days=${days}`);
    return data?.entries || [];
  } catch { return []; }
}

export async function getUserProfile(uid) {
  try {
    const raw = localStorage.getItem(`fitness-profile-${uid}`);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export async function updateUserProfile(uid, data) {
  try {
    const current = await getUserProfile(uid) || {};
    localStorage.setItem(`fitness-profile-${uid}`, JSON.stringify({ ...current, ...data, updated_at: new Date().toISOString() }));
    return true;
  } catch { return false; }
}

// Geräteliste (users/{uid}/devices) gibt es nur im Firestore-Build.
export async function registerDevice(_prefs) {}

// 6Pack-Fortschritt: im lokalen Modus liegt er nur im localStorage der 6Pack-Karte.
export async function getSixpackProgram() { return null; }
export async function saveSixpackProgram() { return { ok: true }; }
