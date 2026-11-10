import { PORT } from "../../shared/config/constants.mjs";

export default async function healthRoute(app) {
  app.get("/health", async (req, reply) => {
    return { ok: true, port: PORT };
  });
}
