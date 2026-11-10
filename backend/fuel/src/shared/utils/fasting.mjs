/**
 * Fasting window analysis from meal timestamps.
 * Pure function — no I/O, no dependencies on server or client.
 * Usable in both Node and browser contexts.
 */

export function computeFastingWindows(dayLogs) {
  // dayLogs: Array von { date: "YYYY-MM-DD", meals: [{ logged_at, ... }, ...] }
  // aufsteigend chronologisch sortiert (ältester Tag zuerst).
  //
  // Rückgabe: Array von {
  //   date: "YYYY-MM-DD",
  //   firstMealAt: ISO-String | null (erste Mahlzeit dieses Tages)
  //   lastMealAt: ISO-String | null (letzte Mahlzeit dieses Tages)
  //   eatingWindowHours: number | null (lastMealAt - firstMealAt), 1 Dezimalstelle
  //   fastingHoursBeforeThisDay: number | null (lastMealAt Vortag -> firstMealAt heute), 1 Dezimalstelle
  //   classification: "no_log" | "normal" | "if" | "omad" | "extended_fast"
  // }

  const result = [];
  let prevLastMeal = null;

  for (const dayLog of dayLogs) {
    const { date, meals = [] } = dayLog;

    // Filtere Mahlzeiten mit logged_at und sortiere chronologisch
    const validMeals = meals
      .filter((m) => m.logged_at && typeof m.logged_at === "string")
      .sort((a, b) => a.logged_at.localeCompare(b.logged_at));

    let firstMealAt = null;
    let lastMealAt = null;
    let eatingWindowHours = null;
    let fastingHoursBeforeThisDay = null;
    let classification = "no_log";

    if (validMeals.length > 0) {
      firstMealAt = validMeals[0].logged_at;
      lastMealAt = validMeals[validMeals.length - 1].logged_at;

      // Berechne Ess-Fenster für diesen Tag
      const firstTime = new Date(firstMealAt).getTime();
      const lastTime = new Date(lastMealAt).getTime();
      const windowMs = lastTime - firstTime;
      eatingWindowHours = Math.round((windowMs / (1000 * 60 * 60)) * 10) / 10;

      // Berechne Fasten-Fenster seit letzter Mahlzeit des Vortags
      if (prevLastMeal) {
        const prevLastTime = new Date(prevLastMeal).getTime();
        const fastMs = firstTime - prevLastTime;
        fastingHoursBeforeThisDay = Math.round((fastMs / (1000 * 60 * 60)) * 10) / 10;

        // Klassifizierung nach Fasten-Dauer
        if (fastingHoursBeforeThisDay >= 36) {
          classification = "extended_fast";
        } else if (fastingHoursBeforeThisDay >= 20) {
          classification = "omad";
        } else if (fastingHoursBeforeThisDay >= 14) {
          classification = "if";
        } else {
          classification = "normal";
        }
      } else {
        // Kein Vortag mit Mahlzeiten verfügbar
        classification = "normal";
      }

      prevLastMeal = lastMealAt;
    }

    result.push({
      date,
      firstMealAt,
      lastMealAt,
      eatingWindowHours,
      fastingHoursBeforeThisDay,
      classification,
    });
  }

  return result;
}
