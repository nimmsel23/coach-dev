/**
 * Prompt für das Zeitrahmen-Briefing (daily, weekly, monthly, quarterly).
 * Zählungen und die Fehlende-Logs-Liste kommen fertig aus dem Code (activity);
 * das LLM bewertet nur die Fälle mit Befund.
 */
function getBriefingPrompt(timeframe, startStr, endStr, activity, journals, sessions) {
  const label = timeframe.toUpperCase();

  return `
    ${label}-Review ${startStr} bis ${endStr}. Ich brauche Entscheidungen, keine Inventur.
    ${PROMPT_BASE_RULES}
    Zusätzlich:
    - Die Zählungen unter FAKTEN sind verbindlich. Nicht neu zählen, nicht widersprechen.
    - Nur Klienten aus "active" bewerten. Klienten aus "missing" erscheinen in deiner Antwort nicht; die Liste hängt der Code an.
    - Vergleiche mit dem letzten ${timeframe}, nur wenn die Daten das hergeben.
    - Bei jedem Befund: Ursache-Hypothese in einem Halbsatz → eine konkrete Aktion beim nächsten Kontakt.
    - Gibt es keinen Befund: genau "Nichts auffällig.".

    Format:
    **${label} Review (${startStr}–${endStr})**
    [Ein Satz: die wichtigste Veränderung.]

    **Feedback & Check-in** (nur Klienten mit Befund; sonst weglassen)
    - **Name**: Hypothese → Aktion

    FAKTEN:
    ${formatPromptData(activity)}

    DATEN:
    ${formatPromptData({ journals, sessions })}
  `;
}
