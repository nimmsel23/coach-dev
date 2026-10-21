/**
 * Prompt für den Meilenstein-Check (PRs, Volumen-Sprünge, Session-Zähler).
 */
function getMilestonePrompt(sessions) {
  return `
    Meilenstein-Check aus den Trainingsdaten.
    ${PROMPT_BASE_RULES}
    Zählt nur: neuer Gewichts-PR bei einer Übung, Volumen > 10 % über Vorwoche, runde Session-Zahl (30, 50, 100 …), erstmals komplett geschaffte schwere Übung.
    Format pro Treffer: **Name**: Übung/Zahl → was daran neu ist (mit Vorwert, wenn in den Daten). Kein Glückwunsch-Text, keine Adjektive.
    Keine Treffer: Ausgabe "Nichts auffällig.".

    DATEN:
    ${formatPromptData(sessions)}
  `;
}
