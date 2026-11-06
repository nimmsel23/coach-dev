import { api } from "./core";
import { todayISO } from "../shared/utils.js";

export async function getJournal(date = todayISO()) {
  try {
    const res = await api.get(`/journal?date=${encodeURIComponent(date)}`);
    return res?.content ? [{ date, text: res.content, time: res.mtime || null }] : [];
  } catch {
    return [];
  }
}

export async function getJournalHistory(limitCount = 50) {
  try {
    const res = await api.get(`/journal/list?limit=${encodeURIComponent(limitCount)}`);
    return Array.isArray(res?.entries) ? res.entries.map((entry) => ({
      id: entry.date,
      date: entry.date,
      time: entry.mtime || null,
      ...entry,
    })) : [];
  } catch {
    return [];
  }
}

export async function saveJournal(date = todayISO(), text, tags = []) {
  await api.post(`/journal?date=${encodeURIComponent(date)}`, {
    content: String(text || ""),
    tags,
  });
  return { ok: true };
}

export async function updateJournal(id, text) {
  await api.post(`/journal?date=${encodeURIComponent(id)}`, {
    content: String(text || ""),
  });
  return { ok: true };
}
