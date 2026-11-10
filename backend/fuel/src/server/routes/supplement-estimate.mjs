import { callGemini, extractJson } from "../services/gemini.mjs";

export default async function supplementEstimateRoute(app) {
  app.post("/supplements/catalog/estimate", async (req, reply) => {
    const { description } = req.body || {};
    if (!description?.trim()) {
      return reply.status(400).send({ ok: false, error: "description fehlt" });
    }

    const prompt = `Du bist Ernährungsexperte. Analysiere folgendes Supplement und gib ausschließlich ein JSON-Objekt zurück (kein Markdown, kein Text darum):
{
  "name": "Produktname",
  "unit": "mg|g|ml|IU|µg",
  "default_dose": <Zahl>,
  "default_time_of_day": "morning|midday|evening|night|any",
  "notes": "kurze Beschreibung auf Deutsch (optional, sonst leer lassen)",
  "schedule": {
    "type": "daily|weekly|cyclical",
    "days": ["mon", "wed"], // Nur bei weekly
    "interval_days": <Zahl>, // Nur bei cyclical
    "start_date": "YYYY-MM-DD" // Nur bei cyclical
  }
}

Falls der Text auf eine Regelmäßigkeit hinweist (z.B. "jeden Tag", "Montags", "jeden 2. Tag"), füge das 'schedule' Objekt passend hinzu, andernfalls weglassen.

Supplement: ${description.trim()}`;

    try {
      const raw = await callGemini(prompt);
      const item = JSON.parse(extractJson(raw));
      item.id = (item.name || "supp").toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 40);
      return reply.send({ ok: true, item });
    } catch (e) {
      console.error("supplement-estimate:", e.message);
      return reply.status(500).send({ ok: false, error: e.message });
    }
  });
}
