/**
 * Prompt für den Schlaf-Qualitäts-Check.
 * Triggert wenn Klienten konsistent schlechte Schlaf-Scores loggen.
 */
function getSleepPrompt(today, sleepLogs) {
  return `
    Analysiere diese Schlaf-Daten vom ${today} und gib mir als Coach eine kurze Einschätzung.
    
    WICHTIGE REGEL:
    Nutze Markdown: **Text** für Fettgedrucktes, Bindestriche (-) für Listen. Keine HTML-Tags.

    Fokus:
    - Wer schläft gut (>7h, gute Qualität)?
    - Wer schläft kritisch (<6h oder Qualität <5)?
    - Muster erkennbar (z.B. späte Schlafzeiten, häufiges Aufwachen)?
    - Auswirkung auf Trainingsfähigkeit?
    
    Max 4 Zeilen, direkt, mit Emojis. Nutze Klarnamen.
    
    DATEN:
    ${JSON.stringify(sleepLogs, null, 2)}
  `;
}
