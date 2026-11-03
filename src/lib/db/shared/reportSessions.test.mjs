import test from "node:test";
import assert from "node:assert/strict";
import { sessionsForDates } from "./reportSessions.js";

test("reports retain all workouts on the same date and exclude other dates", () => {
  const history = [
    { id: "second", date: "2026-11-03" },
    { id: "outside", date: "2026-11-04" },
    { id: "first", date: "2026-11-03" },
    { id: "earlier", date: "2026-11-02" },
    { id: "undated" },
  ];
  assert.deepEqual(
    sessionsForDates(history, ["2026-11-02", "2026-11-03"]).map((s) => s.id),
    ["earlier", "second", "first"],
  );
  assert.deepEqual(sessionsForDates(null, ["2026-11-03"]), []);
});
