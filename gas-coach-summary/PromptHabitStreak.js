/**
 * Prompt für den Habit-Streak-Check.
 */
function getHabitStreakPrompt(today, habitData) {
  return `
    Habit-Streaks Stand ${today}. Nur Ausreißer: Streaks ≥ 7 Tage, gebrochene Ketten, Completion < 50 %.
    ${PROMPT_BASE_RULES}
    Format (Sektion weglassen, wenn leer):
    **Streak-Update ${today}**
    - **Name**: Habit, X Tage → nur wenn ≥ 7
    - **Name**: Habit nach X Tagen gebrochen — Ausrutscher (einmalig) oder Muster (wie oft in den Daten?) → Follow-up
    - **Name**: Completion Y % — Motivationsproblem oder Ziel zu hoch? → Anpassung

    DATEN:
    ${formatPromptData(habitData)}
  `;
}
