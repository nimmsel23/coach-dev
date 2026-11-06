/**
 * shared/dates.js — Kalendertage als lokale ISO-Strings (YYYY-MM-DD).
 *
 * Warum: `date.toISOString().slice(0, 10)` rechnet nach UTC. Sessions werden aber
 * unter dem LOKALEN Datum gespeichert (todayISO()). In Europa liegt lokale
 * Mitternacht bis +2 h vor UTC-Mitternacht — "heute" war dort zwischen 00:00 und
 * 01:00/02:00 der Vortag, und `new Date(y, 0, 1)` (lokale Mitternacht) landete
 * beim Formatieren einen Tag zu früh. Alle Fenster-/Wochenberechnungen der
 * Analyse-Layer (local/ und firestore/) laufen deshalb über diese Helfer.
 *
 * Rechnet intern mit 12:00 Uhr lokal, damit Sommer-/Winterzeit-Wechsel keinen
 * Tag verschlucken oder verdoppeln.
 */

import { todayISO } from "./utils.js";

const pad = (n) => String(n).padStart(2, "0");

/** Lokales Datum eines Date-Objekts als YYYY-MM-DD. */
export function toISODate(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseISODate(iso) {
  return new Date(`${iso}T12:00:00`);
}

/** Verschiebt ein ISO-Datum um n Tage (n darf negativ sein). */
export function addDaysISO(iso, n) {
  const d = parseISODate(iso);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

/** Die letzten `days` Kalendertage bis einschließlich `endISO`, älteste zuerst. */
export function rollingDatesISO(days, endISO = todayISO()) {
  const out = [];
  for (let i = days - 1; i >= 0; i--) out.push(addDaysISO(endISO, -i));
  return out;
}

/** Sessions im rollenden Fenster, einschließlich des lokalen Enddatums. */
export function sessionsInRollingWindow(sessions, days, endISO = todayISO()) {
  const startISO = addDaysISO(endISO, -(days - 1));
  return (Array.isArray(sessions) ? sessions : []).filter(
    (session) => session?.date && session.date >= startISO && session.date <= endISO,
  );
}

/** Montag der Woche, die `iso` enthält. */
export function mondayOfISO(iso = todayISO()) {
  const d = parseISODate(iso);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return toISODate(d);
}

/** Sieben Tage Mo–So ab dem Montag `mondayISO`. */
export function weekDatesFromMonday(mondayISO) {
  return Array.from({ length: 7 }, (_, i) => addDaysISO(mondayISO, i));
}

/**
 * Montag der ISO-Kalenderwoche `week` im ISO-Jahr `year`.
 * ISO 8601: Woche 1 ist die Woche mit dem 4. Januar. (Die frühere Formel
 * "1. Januar + 7·(w-1)" lag in allen Jahren, die nicht an einem Donnerstag
 * beginnen, teils eine Woche daneben.)
 */
export function isoWeekMondayISO(year, week) {
  const jan4 = `${String(year).padStart(4, "0")}-01-04`;
  return addDaysISO(mondayOfISO(jan4), (Number(week) - 1) * 7);
}

/** ISO-Wochen-Selektor ("YYYY-Www") für ein Datum. */
export function isoWeekSelectorForDate(iso = todayISO()) {
  const thursday = parseISODate(addDaysISO(mondayOfISO(iso), 3));
  const isoYear = thursday.getFullYear();
  const week1Monday = parseISODate(isoWeekMondayISO(isoYear, 1));
  const week = 1 + Math.round((parseISODate(mondayOfISO(iso)) - week1Monday) / (7 * 86400000));
  return `${isoYear}-W${pad(week)}`;
}

/** Mo–So-Daten für einen Selektor "YYYY-Www". */
export function isoWeekDatesForSelector(selector) {
  const [year, week] = String(selector).split("-W");
  return weekDatesFromMonday(isoWeekMondayISO(Number(year), parseInt(week, 10)));
}
