/**
 * Prompt für den Körpergewicht- und Körperfett-Trend-Check.
 * Wöchentlicher oder monatlicher Body-Composition-Überblick pro Klient.
 */
function getBodyCompositionPrompt(startStr, endStr, bodyLogs) {
  return `
    Analysiere die Körperzusammensetzungs-Daten der Klienten für den Zeitraum ${startStr} bis ${endStr}.
    
    WICHTIGE REGEL:
    Nutze Markdown: **Text** für Fettgedrucktes, Bindestriche (-) für Listen. Keine HTML-Tags.

    Berechne und bewerte:
    - Gewichtsveränderung (Start vs. Ende, Tendenz)
    - Körperfett-Trend wenn vorhanden
    - Konsistenz der Messungen (wer misst regelmäßig, wer lückenhaft?)
    - Ist die Veränderung im Einklang mit dem erklärten Ziel (Aufbau/Abnehmen/Halten)?

    Format:
    **⚖️ Body-Check ${startStr}–${endStr}**

    - [Name]: [Δ Gewicht], [Trend Körperfett wenn vorhanden], [Einschätzung]
    
    Kein Floskeln, direkt auf den Punkt. Nutze Klarnamen.
    
    DATEN:
    ${JSON.stringify(bodyLogs, null, 2)}
  `;
}
