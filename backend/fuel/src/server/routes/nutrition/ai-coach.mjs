import { callGemini } from "../../services/gemini.mjs";

// Lokales Gegenstück zu MicrosAiCoach.jsx (Cloud-Build ruft dort direkt
// Firebase Vertex AI auf, kostenpflichtig über Firebase-Billing). Lokal
// nutzen wir stattdessen den bestehenden Gemini-API-Key aus
// ~/.env/fuel.env (services/gemini.mjs) — kein Vertex-Aufpreis für den
// Coach-Desktop-Betrieb. Der Prompt wird clientseitig gebaut (identisch
// zum Cloud-Pfad, siehe MicrosAiCoach.jsx analyzeData()), damit die
// Analyse-Logik nicht doppelt gepflegt werden muss.
export default async function aiCoachRoute(app) {
  app.post("/nutrition/ai-coach", async (req, reply) => {
    const { prompt } = req.body || {};
    if (!prompt?.trim()) {
      return reply.status(400).send({ ok: false, error: "prompt fehlt" });
    }

    try {
      const analysis = await callGemini(prompt.trim());
      return reply.send({ ok: true, analysis });
    } catch (e) {
      console.error("nutrition-ai-coach:", e.message);
      return reply.status(500).send({ ok: false, error: e.message });
    }
  });
}
