/**
 * Prompt für den Körpergewicht- und Körperfett-Trend-Check (wöchentlich/monatlich).
 */
function getBodyCompositionPrompt(startStr, endStr, bodyLogs) {
  return `
    Body-Check ${startStr}–${endStr}. Nur Klienten mit Zielabweichung oder Messlücke ausführlich.
    ${PROMPT_BASE_RULES}
    Pro Klient, wenn auffällig: **Name**: Δ Gewicht (kg) und ggf. Δ Körperfett, Ziel (Aufbau/Abnehmen/Halten) vs. Trend, Hypothese (Adhärenz / Plateau / Messfehler), nächster Schritt.
    Wer unauffällig im Ziel ist, bekommt höchstens eine Zeile mit Δ. Lücken in der Messung nennen, wenn sie den Trend verzerren.

    DATEN:
    ${formatPromptData(bodyLogs)}
  `;
}
