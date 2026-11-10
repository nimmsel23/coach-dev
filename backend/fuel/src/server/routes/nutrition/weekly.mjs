import { assembleWeek } from "../../services/nutrition-weekly.mjs";

export default async function weeklyRoute(app) {
  app.get("/nutrition/weekly/:year/:week", async (req, reply) => {
    try {
      const y = parseInt(req.params.year);
      const w = parseInt(req.params.week);

      if (isNaN(y) || isNaN(w) || w < 1 || w > 53) {
        return reply.status(400).send({ ok: false, error: "Invalid year or week" });
      }

      const week = await assembleWeek(y, w, { paths: req.paths, uid: req.uid });
      return reply.send({ ok: true, year: y, week: w, ...week });
    } catch (error) {
      console.error(error);
      return reply.status(500).send({ ok: false, error: "Internal server error" });
    }
  });
}
