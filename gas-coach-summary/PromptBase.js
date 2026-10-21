/**
 * Gemeinsame Regeln für alle Coach-Prompts.
 * Einzeln in jedem Prompt wiederholt wäre Token-Verschwendung und führt zu Füllsätzen.
 */
const PROMPT_BASE_RULES = `
    Du schreibst für mich, den Coach. Kein Klientenkontakt, keine Anrede.

    REGELN:
    - Nur Aussagen, die aus den Daten unten folgen. Fehlt ein Feld, erwähne es nicht.
    - Jede Auffälligkeit = Befund mit Zahl + Ursache-Hypothese + eine konkrete Aktion.
    - Kein Lob ohne konkreten Grund, keine Einleitung, kein Fazit, keine Floskeln ("gut gemacht", "weiter so", "im Auge behalten", "auf einem guten Weg").
    - Unauffällige Klienten werden nicht einzeln aufgelistet.
    - Gibt es nichts Auffälliges: genau eine Zeile "Nichts auffällig." und sonst nichts.
    - Markdown: **Text** für Fett, - für Listen. Keine HTML-Tags, keine Emojis außer dem Kategorie-Marker im Titel.
`;

/**
 * Kompakte Darstellung der Daten für den Prompt: ohne Einrückung, ohne null-Felder.
 */
function formatPromptData(data) {
  return JSON.stringify(data);
}
