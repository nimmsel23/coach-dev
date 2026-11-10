"use strict";

/**
 * coverageWindow.js — Coverage-Scores der letzten N Tage aus dem Analytics-Cache.
 *
 * `fitness/{uid}/analytics/dashboard` enthält pro Kalendertag die Region-Scores
 * (`daily_region_scores`, geschrieben vom Client in updateAnalyticsDoc()). Daraus
 * lässt sich das Fenster zu JEDEM Zeitpunkt korrekt aufsummieren.
 *
 * Das ältere `rolling_7_days` wurde beim letzten Speichern eingefroren und zeigte
 * Tage später noch Sessions, die längst aus dem 7-Tage-Fenster gefallen waren —
 * Folge waren falsche "Lücke"-/PPL-Hinweise. Es gilt hier nur noch, wenn es am
 * heutigen Tag geschrieben wurde; sonst liefert die Funktion `null` ("unbekannt"),
 * und der Aufrufer sendet lieber keinen Hinweis als einen falschen.
 *
 * Spiegel von src/lib/db/shared/coverageWindow.js (Client, ESM).
 */

const round3 = (v) => Math.round(v * 1000) / 1000;

/** YYYY-MM-DD eines Zeitpunkts in der Zeitzone `timeZone`. */
function dateInZone(ts, timeZone) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}

function addDays(iso, n) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Die letzten `days` Tage bis einschließlich `todayDate`, älteste zuerst. */
function windowDates(todayDate, days) {
  const out = [];
  for (let i = days - 1; i >= 0; i -= 1) out.push(addDays(todayDate, -i));
  return out;
}

function sumDailyScores(daily, dates) {
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
 * @param {object|undefined} data  Inhalt von analytics/dashboard
 * @param {string} todayDate       heutiges Datum (YYYY-MM-DD) in `timeZone`
 * @returns {object|null} Region → Score, oder null wenn nichts Verlässliches vorliegt
 */
function coverageScoresFromDashboard(data, todayDate, { days = 7, timeZone = "Europe/Berlin" } = {}) {
  if (!data || typeof data !== "object") return null;
  if (data.daily_region_scores && typeof data.daily_region_scores === "object") {
    return sumDailyScores(data.daily_region_scores, windowDates(todayDate, days));
  }
  const legacy = data[`rolling_${days}_days`];
  if (legacy?.body_region_scores && dateInZone(legacy.updated_at, timeZone) === todayDate) {
    return legacy.body_region_scores;
  }
  return null;
}

module.exports = { coverageScoresFromDashboard, sumDailyScores, windowDates, dateInZone };
