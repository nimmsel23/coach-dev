/**
 * Prompt für den Fortschritts-Meilenstein-Check.
 * Erkennt automatisch wenn Klienten signifikante Fortschritte oder neue PRs erreicht haben.
 */
function getMilestonePrompt(sessions) {
  return `
    Analysiere diese Trainingsdaten und identifiziere bemerkenswerte Fortschritte oder Personal Records (PRs).
    
    WICHTIGE REGEL:
    Nutze Markdown: **Text** für Fettgedrucktes, Bindestriche (-) für Listen. Keine HTML-Tags.

    Suche nach:
    - Neue Gewichts-PRs bei einer Übung
    - Deutliche Volumen-Steigerung (>10% im Vergleich zur Vorwoche)
    - Erreichte Streak-Meilensteine (z.B. 30. Session, 50. Session)
    - Erstmals komplettierte schwierige Übungen oder Fortschritte in Progression

    Format (nur ausgeben wenn es tatsächlich Meilensteine gibt):
    **🏆 Meilensteine**

    - [Name]: [Beschreibung des Erfolgs] 🎯
    
    Wenn keine Meilensteine erkennbar: einfach nichts ausgeben.
    
    DATEN:
    ${JSON.stringify(sessions, null, 2)}
  `;
}
