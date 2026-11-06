// Deload-Hinweis aus den Wochen-Scores des Monatsreports (weeks: jüngste zuerst).
// Regel (Daniel, 2026-10-24): Bei HIT (RPE 9–10) ist jede 4. Woche Deload —
// nach 3 Wochen Vollgas ist Deload angebracht. Eine Woche zählt als Vollgas,
// wenn sie Sessions hat und der Ø-Effort (RPE) >= DELOAD_RPE ist. Eine Woche
// ohne Sessions oder mit niedrigerem Ø-RPE beendet die Serie (das war schon
// Entlastung). Die laufende Woche ohne Session bricht die Serie nicht ab.
export const DELOAD_RPE = 9;
export const DELOAD_AFTER_WEEKS = 3;

export function evaluateDeload(weeks) {
  const list = Array.isArray(weeks) ? weeks : [];
  let streak = 0;
  for (let i = 0; i < list.length; i++) {
    const wk = list[i];
    const sessions = Number(wk?.session_count) || 0;
    if (i === 0 && sessions === 0) continue;
    const effort = Number(wk?.avg_effort);
    if (sessions > 0 && Number.isFinite(effort) && effort >= DELOAD_RPE) streak++;
    else break;
  }
  return { streak, due: streak >= DELOAD_AFTER_WEEKS, weeksLeft: Math.max(0, DELOAD_AFTER_WEEKS - streak) };
}
