/**
 * Prompt für den wöchentlichen Trainingsbelastungs-Check (RPE, Volumen, Frequenz).
 */
function getTrainingLoadPrompt(weekStart, weekEnd, sessions) {
  return `
    Load-Check KW ${weekStart}–${weekEnd}. Zweck: Übertraining oder zu wenig Reiz erkennen.
    ${PROMPT_BASE_RULES}
    Nur Klienten mit Signal ausführlich. Pro Klient: **Name**: Sessions X, RPE Ø Y, Volumen ↑↓→ vs. Vorwoche (nur wenn Vorwoche in den Daten) → Anpassung: Deload / mehr Reiz / Pause / nichts.
    Unauffällige Klienten werden nicht aufgelistet; wenn alle unauffällig sind: "Nichts auffällig.".

    DATEN:
    ${formatPromptData(sessions)}
  `;
}
