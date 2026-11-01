import { test } from "node:test";
import assert from "node:assert/strict";
import { sumDailyScores, dailyScoresFromSessions } from "./coverageWindow.js";

const daily = {
  "2026-10-22": { core: 2.5, chest: 1 },
  "2026-10-24": { core: 2.3 },
  "2026-10-29": { core: 0.5, middle_back: 0.9, biceps: 0.9 },
  "2026-11-01": { chest: 0.9 },
};

test("Fenster rutscht mit dem Datum: dieselben Tageswerte, anderes 'heute'", () => {
  const w = (end, n) => Array.from({ length: n }, (_, i) => {
    const d = new Date(`${end}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - (n - 1 - i)); return d.toISOString().slice(0, 10);
  });
  // Stand 29.10.: 7-Tage-Fenster 23.–29.10. enthält 24.10. und 29.10.
  assert.equal(sumDailyScores(daily, w("2026-10-29", 7)).core, 2.8);
  // Stand 01.11.: Fenster 26.10.–01.11. — 22./24.10. sind raus
  const now = sumDailyScores(daily, w("2026-11-01", 7));
  assert.equal(now.core, 0.5);
  assert.equal(now.chest, 0.9);
});

test("sumDailyScores: robust gegen leere/kaputte Eingaben", () => {
  assert.deepEqual(sumDailyScores(null, ["2026-11-01"]), {});
  assert.deepEqual(sumDailyScores({ "2026-11-01": { a: "x", b: 1 } }, ["2026-11-01"]), { b: 1 });
  assert.deepEqual(sumDailyScores(daily, []), {});
});

test("dailyScoresFromSessions: pro Tag und Region, mehrere Sessions desselben Tages addieren", () => {
  const sessions = [
    { date: "2026-10-28", id: "a" }, { date: "2026-10-28", id: "b" }, { date: "2026-10-29", id: "c" }, { id: "ohne-datum" },
  ];
  const hits = (s) => ({ a: [["m1", "x", 0.9]], b: [["m2", "y", 0.9], ["m3", null, 0.45]], c: [["m1", "z", 1]] }[s.id] || [["m1", "?", 99]]);
  const toRegions = (m) => ({ m1: ["chest"], m2: ["chest"], m3: ["core"] }[m] || []);
  assert.deepEqual(dailyScoresFromSessions(sessions, hits, toRegions), {
    "2026-10-28": { chest: 1.8, core: 0.45 },
    "2026-10-29": { chest: 1 },
  });
});
