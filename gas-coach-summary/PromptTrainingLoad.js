/**
 * Prompt für den wöchentlichen Trainings-Intensitäts-Check.
 * Analysiert RPE, Volumen und Frequenz pro Klient.
 */
function getTrainingLoadPrompt(weekStart, weekEnd, sessions) {
  return `
    Du bist ein Leistungsdiagnostiker. Analysiere die Trainingsbelastung der Klienten für KW ${weekStart} bis ${weekEnd}.
    
    WICHTIGE REGEL:
    Nutze Markdown: **Text** für Fettgedrucktes, Bindestriche (-) für Listen. Keine HTML-Tags.

    Bewerte für jeden Klienten:
    - Trainingsfrequenz (wie viele Sessions diese Woche?)
    - Intensität (RPE-Durchschnitt wenn vorhanden)
    - Volumen-Trend: mehr oder weniger als letzte Woche?
    - Erholungsrisiko: wer riskiert Übertraining, wer zu wenig Reiz? Das ist der eigentliche Zweck dieses Checks — nenne explizit eine Anpassung (Deload, mehr Reiz, Pause) statt nur den Zustand zu beschreiben.

    Nenne nur Klienten mit klarem Signal ausführlich — bei unauffälligen reicht "[Name]: stabil".

    Format (kompakt, max 2 Zeilen pro Klient, mit Emoji):
    **📊 Load-Check ${weekStart}–${weekEnd}**

    - [Name]: [Frequenz], RPE Ø [X], Trend: [↑↓→], [Einschätzung + konkrete Anpassung wenn nötig]
    
    DATEN:
    ${JSON.stringify(sessions, null, 2)}
  `;
}
