/**
 * shared/coverageWindow.js — Tageswerte → Zeitfenster-Summe.
 *
 * Der Analytics-Cache speichert pro Kalendertag die Region-Scores
 * (`{ "2026-10-29": { chest: 1.8, core: 0.5 } }`) statt fertiger Fenster-Summen.
 * Ein gespeichertes "rolling_7_days" friert beim Schreiben ein und zeigt Tage
 * später noch Sessions, die längst aus dem Fenster gefallen sind; die
 * Tageswerte lassen sich dagegen zu jedem Zeitpunkt korrekt aufsummieren
 * (Client UND Cloud Function).
 *
 * Gleiche Logik gespiegelt in functions/coverageWindow.js (CommonJS, eigene Tests).
 */

export const DAILY_WINDOW_DAYS = 28;

const round3 = (v) => Math.round(v * 1000) / 1000;

/** Summe der Tageswerte über die gegebenen Daten. */
export function sumDailyScores(daily, dates) {
  const out = {};
  if (!daily || typeof daily !== "object") return out;
  for (const date of dates) {
    const day = daily[date];
    if (!day || typeof day !== "object") continue;
    for (const [region, score] of Object.entries(day)) {
      const n = Number(score);
      if (Number.isFinite(n)) out[region] = round3((out[region] || 0) + n);
    }
  }
  return out;
}

/**
 * Tageswerte aus Sessions.
 * @param {Array} sessions Session-Dokumente (mit `date`)
 * @param {(session: object) => Array<[string, string|null, number]>} hitsOf liefert (Muskel, Übungsname, Gewicht)
 * @param {(muscle: string, exName: string|null) => string[]} toRegions Muskel → Regionen
 */
export function dailyScoresFromSessions(sessions, hitsOf, toRegions) {
  const daily = {};
  for (const session of Array.isArray(sessions) ? sessions : []) {
    const date = session?.date;
    if (!date) continue;
    for (const [muscle, exName, weight] of hitsOf(session)) {
      for (const region of toRegions(muscle, exName)) {
        const day = (daily[date] ||= {});
        day[region] = (day[region] || 0) + weight;
      }
    }
  }
  for (const day of Object.values(daily)) {
    for (const region of Object.keys(day)) day[region] = round3(day[region]);
  }
  return daily;
}
