// v3 (dieser Node-Server / aktuelle äußere Runtime-Schicht) → v4
// (Python/FastAPI-Backend). Gegenrichtung existiert ebenfalls über /v3/* im
// FastAPI-Backend. Das ist Übergangs-Reichweite, kein gemeinsamer Datenlayer.
const V4_TARGET = process.env.FUEL_V4_URL || "http://127.0.0.1:4000";

export default async function v4ProxyRoute(app) {
  app.all("/v4/*", async (req, reply) => {
    const targetPath = req.url.replace(/^\/v4/, "") || "/";
    const targetUrl = `${V4_TARGET}${targetPath}`;

    try {
      const res = await fetch(targetUrl, {
        method: req.method,
        headers: { "content-type": req.headers["content-type"] || "application/json" },
        body: ["GET", "HEAD"].includes(req.method) ? undefined : JSON.stringify(req.body ?? {}),
      });
      const text = await res.text();
      reply.code(res.status);
      const contentType = res.headers.get("content-type");
      if (contentType) reply.header("content-type", contentType);
      return text;
    } catch (err) {
      if (targetPath === "/health") {
        return {
          ok: false,
          status: "down",
          target: V4_TARGET,
          detail: err.message,
        };
      }
      reply.code(502);
      return { error: "v4 backend nicht erreichbar", detail: err.message };
    }
  });
}
