import path from "path";
import fastifyStatic from "@fastify/static";
import { PUBLIC_DIR, VITE_BUILD_DIR } from "../config/paths.mjs";
import { VITE_ORIGIN } from "../../shared/config/constants.mjs";

export default async function staticRoute(app) {
  // 1. Dev Mode: Transparent Proxy to Vite
  if (VITE_ORIGIN) {
    app.log.info(`[static] Dev mode: Proxying UI requests to ${VITE_ORIGIN}`);
    
    app.get("/*", async (req, reply) => {
      // Only proxy GET requests that aren't API calls
      if (req.method !== "GET" || req.url.startsWith("/api") || req.url.startsWith("/nutrition") || req.url.startsWith("/supplements")) {
        return reply.status(404).send({ ok: false, error: "Not found" });
      }

      try {
        const targetUrl = `${VITE_ORIGIN}${req.url}`;
        const response = await fetch(targetUrl);
        
        // Forward headers and status
        const contentType = response.headers.get("content-type");
        if (contentType) reply.type(contentType);
        
        return reply.status(response.status).send(Buffer.from(await response.arrayBuffer()));
      } catch (e) {
        app.log.error(`[static] Proxy error: ${e.message}`);
        return reply.status(502).send("Vite dev server not reachable. Run 'npm run dev'?");
      }
    });
    return;
  }

  // 2. Production Mode: Serve dist/
  app.log.info(`[static] Production mode, serving from ${VITE_BUILD_DIR}`);

  // Register dist/ for V2 Assets
  app.register(fastifyStatic, {
    root: VITE_BUILD_DIR,
    prefix: "/",
    wildcard: true,
    index: "index.html",
  });

  // Legacy V1 (if specifically requested)
  app.get("/legacy", async (_, reply) => {
    return reply.sendFile("index.html", PUBLIC_DIR);
  });

  app.register(fastifyStatic, {
    root: PUBLIC_DIR,
    prefix: "/legacy/",
    decorateReply: false, // only one static plugin can decorate reply
  });

  // SPA Fallback: Serve index.html for all non-file requests
  app.setNotFoundHandler(async (req, reply) => {
    if (req.url.startsWith("/api") || req.url.startsWith("/nutrition") || req.url.startsWith("/supplements")) {
      return reply.status(404).send({ ok: false, error: "API route not found" });
    }
    return reply.sendFile("index.html", VITE_BUILD_DIR);
  });
}
