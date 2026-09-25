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
    - Wer hat aktuell beeindruckende Streaks (≥7 Tage)? Das verdient echte Anerkennung, nicht nur eine Zahl — was macht diese Person anders?
    - Wer hat heute oder gestern einen Streak gebrochen? Unterscheide: einmaliger Ausrutscher vs. Anfang eines Abwärtstrends (schau ob es schon öfter passiert ist).
    - Welche Habits werden von wem am konsistentesten durchgehalten?
    - Gibt es Klienten mit sehr niedrigen Completion-Raten (<50%)? Wenn ja: ist das ein Motivationsproblem oder ist der Habit selbst unrealistisch gesetzt — das ist eine wichtige Unterscheidung für die nächste Anpassung.

    Format:
    **🔥 Habit-Streak-Update ${today}**

    **Top-Streaks**
    - [Name]: [Habit], [X] Tage am Stück

    **Gebrochene Ketten**
    - [Name]: [Habit] nach [X] Tagen — [Ausrutscher oder Muster?] → Follow-up-Idee

    **Auffällig niedrig**
    - [Name]: [Completion-Rate]% — [Hypothese: Motivation oder unrealistisches Ziel?]
    
    DATEN:
    ${JSON.stringify(habitData, null, 2)}
  `;
}
