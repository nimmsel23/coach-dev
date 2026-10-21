/**
 * Prompt für den Schlaf-Check (heute).
 */
function getSleepPrompt(today, sleepLogs) {
  return `
    Schlaf-Check ${today}. Meldepflichtig: < 6 h oder Qualität < 5.
    ${PROMPT_BASE_RULES}
    Pro meldepflichtigem Klienten: **Name**: Wert → Einzeltag oder Muster (Zahl der Tage) → Trainingsempfehlung heute (Intensität/Volumen anpassen ja/nein).
    Klienten ohne Befund nicht erwähnen.

    DATEN:
    ${formatPromptData(sleepLogs)}
  `;
}
