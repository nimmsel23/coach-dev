/**
 * Prompt für den Schlaf-Qualitäts-Check.
 * Triggert wenn Klienten konsistent schlechte Schlaf-Scores loggen.
 */
function getSleepPrompt(today, sleepLogs) {
  return `
    Analysiere diese Schlaf-Daten vom ${today} und gib mir als Coach eine kurze Einschätzung.
    
    WICHTIGE REGEL:
    Nutze Markdown: **Text** für Fettgedrucktes, Bindestriche (-) für Listen. Keine HTML-Tags.

    Fokus, in dieser Priorität:
    - Wer schläft kritisch (<6h oder Qualität <5)? Das ist die eigentliche Meldung — wenn hier niemand auffällt, reicht ein Halbsatz für den Rest.
    - Ist das ein Einzeltag oder ein wiederkehrendes Muster (späte Schlafzeiten, häufiges Aufwachen)? Ein Einzeltag ist Rauschen, ein Muster ist ein Trainings-/Recovery-Risiko.
    - Konkrete Auswirkung auf die Trainingsfähigkeit HEUTE — soll ich Intensität/Volumen für diese Person anpassen?

    Max 4 Zeilen, direkt, mit Emojis. Nutze Klarnamen. Keine Floskeln wie "sollte beobachtet werden".
    
    DATEN:
    ${JSON.stringify(sleepLogs, null, 2)}
  `;
}
