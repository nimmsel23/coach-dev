/**
 * Prompt für das Zeitrahmen-Briefing (daily, weekly, monthly, quarterly).
 */
function getBriefingPrompt(timeframe, startStr, endStr, expectedClients, journals, sessions) {
  const label = timeframe.toUpperCase();

  return `
    ${label}-Review ${startStr} bis ${endStr}. Ich brauche Entscheidungen, keine Inventur.
    ${PROMPT_BASE_RULES}
    Zusätzlich:
    - Vergleiche mit dem letzten ${timeframe}, nur wenn die Daten das hergeben.
    - Bei jedem Befund: Ursache-Hypothese in einem Halbsatz → eine konkrete Aktion beim nächsten Kontakt.
    - Sektionen, die leer wären, werden komplett weggelassen (auch die Überschrift).

    Format:
    **${label} Review (${startStr}–${endStr})**
    [Ein Satz: die wichtigste Veränderung. Keine Zusammenfassung.]

    **Feedback & Check-in** (nur Klienten mit Befund)
    - **Name**: Hypothese → Aktion

    **Fehlende Logs** (nur wenn vorhanden; Klienten aus "Erwartete Klienten" ohne Journal- UND ohne Session-Eintrag)
    - **Name**

    DATEN:
    ${formatPromptData({ expectedClients, journals, sessions })}
  `;
}
