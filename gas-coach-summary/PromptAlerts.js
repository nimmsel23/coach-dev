/**
 * Generiert den Prompt für den Nutrition/Fuel-Check.
 */
function getNutritionPrompt(today, mealLogs) {
  return `
    Analysiere diese Ernährungs-Logs vom ${today} und erstelle eine kurze Zusammenfassung für den Coach.
    WICHTIGE REGEL:
    Nutze Markdown: **Text** für Fettgedrucktes, Bindestriche (-) für Listen. Keine HTML-Tags.

    Inhalt:
    - Wer hat gut getankt (Kalorien, Makros)?
    - Wer fehlt noch / hat sehr wenig geloggt?
    - Auffälligkeiten?
    
    Sei direkt, max 5 Zeilen, mit Emojis.
    
    DATEN:
    ${JSON.stringify(mealLogs, null, 2)}
  `;
}

/**
 * Generiert den Prompt für den Mood-Trend-Alert.
 */
function getMoodPrompt(alerts) {
  return `
    Folgende Klienten zeigen einen anhaltend niedrigen Mood-Score (letzte 3 Tage, alle Werte < 6):
    ${JSON.stringify(alerts, null, 2)}
    
    WICHTIGE REGEL:
    Nutze Markdown: **Text** für Fettgedrucktes, Bindestriche (-) für Listen. Keine HTML-Tags.

    Formuliere eine kurze, empathische Coach-Warnung für mich (den Coach) auf Deutsch:
    - Wer ist betroffen? (Nutze Klarnamen)
    - Empfehlung (proaktiv ansprechen? Check-in einplanen?)
    Max 3–4 Sätze, direkt, kein Floskeln.
  `;
}
