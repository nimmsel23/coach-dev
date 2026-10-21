/**
 * Prompts für die Alerts: Nutrition-Check (heute) und Mood-Trend (3 Tage).
 */
function getNutritionPrompt(today, mealLogs) {
  return `
    Nutrition-Check ${today}. Ziel: nur Klienten nennen, bei denen ich heute noch eingreifen muss.
    ${PROMPT_BASE_RULES}
    Eingreifen heißt: fehlendes Log am Tag, Makro-Ausreißer mit Zahl, oder Muster über mehrere Tage.
    Format: pro Klient eine Zeile "- **Name**: Grund (Zahl) → Aktion". Max 5 Zeilen insgesamt.

    DATEN:
    ${formatPromptData(mealLogs)}
  `;
}

function getMoodPrompt(alerts) {
  return `
    Mood-Alarm: Klienten mit Mood < 6 an allen der letzten 3 Tage.
    ${PROMPT_BASE_RULES}
    Pro Klient: **Name** — Muster oder Delle (ein Satz, mit Werten), mögliche Ursache aus den Daten oder "keine erkennbar", und eine heutige Aktion (anrufen / Training anpassen / gezielt nachfragen).
    Max 3 Sätze pro Klient.

    DATEN:
    ${formatPromptData(alerts)}
  `;
}
