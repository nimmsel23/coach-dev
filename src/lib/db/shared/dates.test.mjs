/* global process */
// Läuft bewusst in einer UTC+1/+2-Zeitzone: genau dort lieferte toISOString().slice(0,10) den Vortag.
process.env.TZ = "Europe/Vienna";

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  toISODate, addDaysISO, rollingDatesISO, sessionsInRollingWindow, mondayOfISO, weekDatesFromMonday,
  isoWeekMondayISO, isoWeekSelectorForDate, isoWeekDatesForSelector,
} from "./dates.js";

test("recovery window includes exactly the requested calendar days and excludes future sessions", () => {
  const sessions = ['2026-10-27', '2026-10-28', '2026-11-03', '2026-11-04'].map((date) => ({ date }));
  assert.deepEqual(sessionsInRollingWindow(sessions, 7, '2026-11-03').map((s) => s.date), ['2026-10-28', '2026-11-03']);
});

test("toISODate: lokale Mitternacht bleibt am lokalen Tag (toISOString würde den Vortag liefern)", () => {
  const d = new Date(2026, 10, 1, 0, 30); // 01.11.2026 00:30 lokal = 31.10. 23:30 UTC
  assert.equal(d.toISOString().slice(0, 10), "2026-10-31", "Voraussetzung: der alte Weg liefert den Vortag");
  assert.equal(toISODate(d), "2026-11-01");
});

test("addDaysISO: über Sommer-/Winterzeit-Wechsel hinweg exakt in Kalendertagen", () => {
  assert.equal(addDaysISO("2026-10-24", 2), "2026-10-26"); // Winterzeit beginnt 25.10.
  assert.equal(addDaysISO("2026-03-28", 2), "2026-03-30"); // Sommerzeit beginnt 29.03.
  assert.equal(addDaysISO("2026-03-01", -1), "2026-02-28");
  assert.equal(addDaysISO("2024-03-01", -1), "2024-02-29");
});

test("rollingDatesISO: n Tage bis einschließlich Ende, älteste zuerst", () => {
  assert.deepEqual(rollingDatesISO(7, "2026-11-01"),
    ["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01"]);
  assert.equal(rollingDatesISO(28, "2026-11-01").length, 28);
  assert.equal(rollingDatesISO(1, "2026-11-01")[0], "2026-11-01");
});

test("ISO-Woche: Montag der Woche 1 folgt der 4.-Januar-Regel", () => {
  assert.equal(isoWeekMondayISO(2026, 44), "2026-10-26");
  assert.equal(isoWeekMondayISO(2026, 1), "2025-12-29");
  assert.equal(isoWeekMondayISO(2027, 1), "2027-01-04"); // 1.1.2027 = Freitag; alte Formel: 28.12.2026 (falsch)
  assert.equal(isoWeekMondayISO(2020, 53), "2020-12-28");
});

test("Wochen-Selektor: Jahreswechsel", () => {
  assert.equal(isoWeekSelectorForDate("2026-11-01"), "2026-W44");
  assert.equal(isoWeekSelectorForDate("2027-01-01"), "2026-W53");
  assert.equal(isoWeekSelectorForDate("2024-12-30"), "2025-W01");
  assert.equal(isoWeekSelectorForDate("2021-01-03"), "2020-W53");
});

// Unabhängige Referenz (UTC-basierter ISO-Algorithmus), jeden Tag 2018–2032.
function referenceIsoWeek(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const year = d.getUTCFullYear();
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const week = 1 + Math.round(((d - jan4) / 86400000 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

test("Wochen-Selektor und -Daten sind für jeden Tag 2018–2032 konsistent und ISO-konform", () => {
  let iso = "2018-01-01";
  for (let i = 0; i < 15 * 366; i++, iso = addDaysISO(iso, 1)) {
    const sel = isoWeekSelectorForDate(iso);
    assert.equal(sel, referenceIsoWeek(iso), `Selektor ${iso}`);
    const dates = isoWeekDatesForSelector(sel);
    assert.equal(dates.length, 7);
    assert.ok(dates.includes(iso), `${iso} liegt in ${sel}`);
    assert.equal(dates[0], mondayOfISO(iso));
    assert.deepEqual(dates, weekDatesFromMonday(dates[0]));
  }
});
