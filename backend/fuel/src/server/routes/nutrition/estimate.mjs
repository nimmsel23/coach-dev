import { callGemini, extractJson } from "../../services/gemini.mjs";

export default async function estimateRoute(app) {
  app.post("/nutrition/estimate", async (req, reply) => {
    const { text } = req.body || {};
    if (!text?.trim()) {
      return reply.status(400).send({ ok: false, error: "text fehlt" });
    }

    const prompt = `Du bist ein Ernährungsexperte. Analysiere den folgenden Freitext und extrahiere die Mahlzeit und die geschätzten Makronährstoffe. Gib AUSSCHLIESSLICH ein JSON-Objekt zurück, ohne Markdown-Formatierung:
{
  "description": "Zusammenfassung der Mahlzeit (z.B. '2 Eier mit 100g Haferflocken')",
  "type": "breakfast|lunch|dinner|snack",
  "kcal": <Zahl>,
  "protein": <Zahl (Gramm)>,
  "carbs": <Zahl (Gramm)>,
  "fat": <Zahl (Gramm)>
}

Wenn der Text nichts mit Essen zu tun hat, schätze kcal=0, protein=0, carbs=0, fat=0 und setze description="Keine Mahlzeit erkannt".

Text: ${text.trim()}`;

    try {
      const raw = await callGemini(prompt);
      const item = JSON.parse(extractJson(raw));
      return reply.send({ ok: true, data: item });
    } catch (e) {
      console.error("nutrition-estimate:", e.message);
      return reply.status(500).send({ ok: false, error: e.message });
    }
  });
}
