/**
 * Generiert den Prompt für den Nutrition/Fuel-Check.
 */
function getNutritionPrompt(today, mealLogs) {
  return `
    Du bist Ernährungscoach und checkst die Logs vom ${today} nicht um sie zu zählen, sondern um zu entscheiden, wo du heute noch eingreifst.

    WICHTIGE REGEL:
    Nutze Markdown: **Text** für Fettgedrucktes, Bindestriche (-) für Listen. Keine HTML-Tags.

    Fokus, in dieser Priorität:
    - Wer braucht heute noch eine Nachricht von dir (kein Log, klarer Makro-Ausreißer, wiederholtes Muster)? Nenne den Grund, nicht nur den Befund.
    - Wer hat sauber getankt — kurz erwähnen, nicht ausbreiten.
    - Wenn ein Muster über mehrere Tage erkennbar ist (nicht nur heute), sag das explizit — Einzeltage sind uninteressant, Wiederholung ist das Signal.

    Sei direkt, max 5 Zeilen, mit Emojis. Keine Floskeln wie "alles im grünen Bereich".

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

    Du kennst diese Menschen — das ist kein anonymer Datenpunkt, sondern jemand, dem es seit Tagen schlecht geht. Formuliere für mich (den Coach):
    - Wer ist betroffen, und wirkt das wie eine vorübergehende Delle oder wie ein echtes Muster (nutze Klarnamen)?
    - Eine konkrete, unmittelbare Handlungsempfehlung — nicht "im Auge behalten", sondern was genau tue ich heute (anrufen, Training anpassen, gezielt nachfragen was los ist)?
    - Falls aus den Daten erkennbar: ein möglicher Auslöser (Training, Schlaf, Ernährung, sonst nichts erkennbar → sag das auch).
    Max 3–4 Sätze, direkt, keine Floskeln, kein Corporate-Ton.
  `;
}
