// Legacy api() wrapper for path-based calls
export async function api(path, options) {
  const res = await fetch(path, {
    cache: options?.method && options.method !== "GET" ? "default" : "no-store",
    ...options,
  });
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json();
}

export function post(path, body) {
  return api(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

// Habits
export function getLoggedHabits(klientId) { return api(`/k/${klientId}/habits/logs?days=28`); }
export function toggleHabitRecord(klientId, habitId, date) {
  return post(`/k/${klientId}/habits/logs/toggle`, { habitId, date });
}

// Workouts
export function getLoggedWorkouts(klientId) { return api(`/k/${klientId}/workout/logs?days=28`); }

export const FARBEN = [
  "#4f8cff", "#2d7f6e", "#e05d44", "#f59e0b",
  "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16",
];

export const FREQUENZEN = [
  { value: "daily",    label: "Täglich" },
  { value: "weekly-1", label: "1× / Woche" },
  { value: "weekly-2", label: "2× / Woche" },
  { value: "weekly-3", label: "3× / Woche" },
  { value: "weekly-4", label: "4× / Woche" },
  { value: "weekly-5", label: "5× / Woche" },
  { value: "weekly-6", label: "6× / Woche" },
];

export const ENTSPANNUNGS_TYPEN = [
  "Meditation", "Atemübung", "Progressive Muskelentspannung",
  "Yoga", "Stretching", "Spaziergang", "Sauna", "Sonstiges",
];

// Coaching Notes (Coach-private comments)
export function getCoachingNote(klientId, date) { return api(`/k/${klientId}/coaching-note?date=${date}`); }
export function saveCoachingNote(klientId, date, note) { return post(`/k/${klientId}/coaching-note`, { date, note }); }
export function listCoachingNotes(klientId, limit = 50) { return api(`/k/${klientId}/coaching-notes?limit=${limit}`); }
