/**
 * Prompt für den Habit-Streak-Check.
 * Hebt Gewinner-Streaks hervor und warnt bei gebrochenen Ketten.
 */
function getHabitStreakPrompt(today, habitData) {
  return `
    Analysiere die Habit-Daten der Klienten (Stand: ${today}) und erstelle ein Streak-Update für den Coach.
    
    WICHTIGE REGEL:
    Nutze Markdown: **Text** für Fettgedrucktes, Bindestriche (-) für Listen. Keine HTML-Tags.

    Bewerte:
    - Wer hat aktuell beeindruckende Streaks (≥7 Tage)?
    - Wer hat heute oder gestern einen Streak gebrochen?
    - Welche Habits werden von wem am konsistentesten durchgehalten?
    - Gibt es Klienten mit sehr niedrigen Completion-Raten (<50%)?

    Format:
    **🔥 Habit-Streak-Update ${today}**

    **Top-Streaks**
    - [Name]: [Habit], [X] Tage am Stück

    **Gebrochene Ketten**
    - [Name]: [Habit] nach [X] Tagen — Follow-up?

    **Auffällig niedrig**
    - [Name]: [Completion-Rate]%
    
    DATEN:
    ${JSON.stringify(habitData, null, 2)}
  `;
}
