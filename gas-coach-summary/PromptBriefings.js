/**
 * Generiert den Prompt für das Zeitrahmen-Briefing (daily, weekly, monthly, quarterly).
 */
function getBriefingPrompt(timeframe, startStr, endStr, expectedClients, journals, sessions) {
  const rawData = `
    Zeitraum: ${startStr} bis ${endStr} (${timeframe})
    Erwartete Klienten (Datenbank-Profile):
    ${JSON.stringify(expectedClients, null, 2)}
    
    Journal-Einträge:
    ${JSON.stringify(journals, null, 2)}
    
    Training/Sessions:
    ${JSON.stringify(sessions, null, 2)}
  `;

  return `
    Du bist das analytische Backend für ein professionelles Client-Management-System. 
    Analysiere die Klienten-Logs für den Zeitraum: ${timeframe.toUpperCase()} (${startStr} bis ${endStr}).
    
    WICHTIGE REGELN:
    1. Wir tracken High-Level-Protokolle, keinen "Sets, Reps und Weights"-Kleinkram. 
    2. Da dies ein ${timeframe}-Review ist, suche nach langfristigen Trends, nicht nur nach tagesaktuellen Schwankungen.
    3. Wer war durchgehend konsistent? Wer hatte mehrere Ausfälle (z.B. gehäuft schlechter Schlaf, fehlende Sessions)?
    4. Nutze die Liste der "Erwarteten Klienten", um unter "Fehlende Logs" präzise alle Klienten aufzulisten, für die in den Rohdaten KEIN Journal- und KEIN Session-Eintrag vorliegt. Nutze immer deren Klarnamen.
    5. Nutze Markdown: **Text** für Fettgedrucktes, Bindestriche (-) für Listen. Keine HTML-Tags.

    Erstelle eine kompakte Zusammenfassung exakt in diesem Markdown-Format:

    **🎯 ${timeframe.toUpperCase()} Review (${startStr} bis ${endStr})**
    [2-3 Sätze zum Gesamttrend der eingegangenen Logs im gesamten Zeitraum]

    **🟢 Konsistent (On Track)**
    - [Name des Klienten]: [Kurzer Grund, warum es gut lief]

    **🟡 Feedback & Check-in Bedarf**
    - [Name des Klienten]: [Erkannte Muster/Probleme über den Zeitraum & Grund für Eingreifen]

    **🔴 Fehlende Logs (Follow-up)**
    - [Name des Klienten]
    
    Rohdaten:
    ${rawData}
  `;
}
