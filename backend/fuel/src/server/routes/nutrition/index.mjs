import catalogRoute from "./catalog.mjs";
import logRoute from "./log.mjs";
import journalRoute from "./notes.mjs";
import composeRoute from "./compose.mjs";
import dailyRoute from "./daily.mjs";
import weeklyRoute from "./weekly.mjs";
import microTrendRoute from "./micro-trend.mjs";
import estimateRoute from "./estimate.mjs";
import aiLogRoute from "./ai-log.mjs";
import visionRoute from "./vision.mjs";
import aiCoachRoute from "./ai-coach.mjs";
import fastingRoute from "./fasting.mjs";

export default async function nutritionRoute(app) {
  app.register(catalogRoute);
  app.register(logRoute);
  app.register(journalRoute);
  app.register(composeRoute);
  app.register(dailyRoute);
  app.register(weeklyRoute);
  app.register(microTrendRoute);
  app.register(estimateRoute);
  app.register(aiLogRoute);
  app.register(visionRoute);
  app.register(aiCoachRoute);
  app.register(fastingRoute);
}
