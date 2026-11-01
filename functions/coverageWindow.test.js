"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { coverageScoresFromDashboard, windowDates, dateInZone } = require("./coverageWindow.js");

const daily = {
  "2026-10-22": { core: 2.5 },
  "2026-10-24": { core: 2.3 },
  "2026-10-29": { core: 0.5, biceps: 0.9 },
};

test("windowDates: 7 Tage bis heute, älteste zuerst", () => {
  assert.deepEqual(windowDates("2026-11-01", 7)[0], "2026-10-26");
  assert.equal(windowDates("2026-11-01", 7)[6], "2026-11-01");
});

test("Tageswerte: Fenster bezieht sich auf HEUTE, nicht auf den letzten Schreibzeitpunkt", () => {
  const data = { daily_region_scores: daily, rolling_7_days: { body_region_scores: { core: 99 }, updated_at: "2026-10-29T15:27:17Z" } };
  assert.equal(coverageScoresFromDashboard(data, "2026-10-29").core, 2.8);
  const later = coverageScoresFromDashboard(data, "2026-11-01");
  assert.equal(later.core, 0.5, "22./24.10. liegen am 01.11. außerhalb des 7-Tage-Fensters");
  assert.equal(later.biceps, 0.9);
});

test("Tageswerte ohne Treffer im Fenster → leeres Objekt (bekannt: nichts trainiert), nicht null", () => {
  assert.deepEqual(coverageScoresFromDashboard({ daily_region_scores: daily }, "2026-12-24"), {});
});

test("Legacy rolling_7_days nur, wenn heute (Europa/Berlin) geschrieben", () => {
  const fresh = { rolling_7_days: { body_region_scores: { chest: 2 }, updated_at: "2026-11-01T09:00:00Z" } };
  assert.deepEqual(coverageScoresFromDashboard(fresh, "2026-11-01"), { chest: 2 });
  const stale = { rolling_7_days: { body_region_scores: { chest: 2 }, updated_at: "2026-10-29T15:27:17Z" } };
  assert.equal(coverageScoresFromDashboard(stale, "2026-11-01"), null);
});

test("Zeitzone: 23:30 UTC am 31.10. ist in Berlin schon der 01.11.", () => {
  assert.equal(dateInZone("2026-10-31T23:30:00Z", "Europe/Berlin"), "2026-11-01");
  const data = { rolling_7_days: { body_region_scores: { chest: 1 }, updated_at: "2026-10-31T23:30:00Z" } };
  assert.deepEqual(coverageScoresFromDashboard(data, "2026-11-01"), { chest: 1 });
});

test("kein Doc / kaputtes Doc → null", () => {
  assert.equal(coverageScoresFromDashboard(undefined, "2026-11-01"), null);
  assert.equal(coverageScoresFromDashboard({}, "2026-11-01"), null);
});
