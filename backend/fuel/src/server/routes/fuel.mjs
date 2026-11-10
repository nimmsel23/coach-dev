// Legacy Fuel endpoints — redirect to Nutrition for unified logging
export default async function fuelRoute(app) {
  // GET /fuel/log?date=YYYY-MM-DD → GET /nutrition/log
  app.get("/fuel/log", async (req, reply) => {
    const date = req.query.date || "";
    reply.redirect(`/nutrition/log${date ? `?date=${date}` : ""}`);
  });

  // POST /fuel/log → POST /nutrition/log
  app.post("/fuel/log", async (req, reply) => {
    const body = req.body || {};
    const nutritionPayload = {
      meal: {
        meal_type: body.mahlzeit || "snack",
        description: body.speise,
        kcal: body.kalorien || 0,
        protein: body.protein || 0,
        carbs: body.kohlenhydrate || 0,
        fat: body.fett || 0,
        notes: body.notizen || "",
      },
      date: body.datum,
    };

    // Forward to nutrition endpoint
    const r = await fetch("http://127.0.0.1:9000/nutrition/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(nutritionPayload),
    });

    const data = await r.json();
    reply.status(r.status).send(data);
  });
}
