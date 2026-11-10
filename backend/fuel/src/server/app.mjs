import Fastify from "fastify";
import cors from "@fastify/cors";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { PORT, HOST } from "../shared/config/constants.mjs";
import { initializePaths, getPaths, GLOBAL_DATA_DIR, CATALOGS_DIR } from "./config/paths.mjs";
import { normalizeRoutedPath } from "../shared/utils/validation.mjs";
import { getUidForClient } from "./lib/client-manager.mjs";

// Import all route handlers
import healthRoute from "./routes/health.mjs";
import nutritionRoute from "./routes/nutrition/index.mjs";
import supplementsRoute from "./routes/supplements.mjs";
import supplementEstimateRoute from "./routes/supplement-estimate.mjs";
import fuelRoute from "./routes/fuel.mjs";
import pushRoute from "./routes/push.mjs";
import coachRoute from "./routes/coach.mjs";
import v4ProxyRoute from "./routes/v4-proxy.mjs";
import staticRoute from "./routes/static.mjs";
import { startPushScheduler } from "./services/push-scheduler.mjs";
import { startFirestorePullScheduler } from "./lib/firestore-admin.mjs";

function serverMode() {
  return String(PORT) === "7000" ? "prod" : "dev";
}

// Firestore-Sync hat genau einen Besitzer: den eigenen Dienst fuel-sync.service
// (scripts/sync-daemon.mjs, ohne Fastify). Dieser Server startet ihn nur mit explizitem
// FUEL_ENABLE_FIRESTORE_SYNC=1 (Notnagel/Dev-Test). Dev und Prod synchronisieren nie
// automatisch — früher lief der Sync nur auf Prod (:7000), das seit 2026-10-29 aus ist; zwei
// Instanzen auf demselben Datenordner wären das Multi-Writer-Problem.
export function firestoreSyncEnabled(env = process.env) {
  const flag = String(env.FUEL_ENABLE_FIRESTORE_SYNC || "").trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(flag);
}

export function createApp() {
  // Initialize data directories
  initializePaths();

  const app = Fastify({
    logger:
      process.env.NODE_ENV === "development"
        ? {
            transport: {
              target: "pino-pretty",
              options: { colorize: true, translateTime: "SYS:HH:MM:ss", ignore: "pid,hostname" },
            },
          }
        : true,
  });

  // CORS
  app.register(cors, {
    origin: "*",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: false,
  });

  // Swagger/OpenAPI — auto-generated from registered routes (most have no
  // JSON schema yet, so this gives paths+methods for free; schemas can be
  // added per-route later for richer param docs). v4 (FastAPI) gets this
  // for free at :4000/docs — this mirrors it for v3.
  app.register(swagger, {
    openapi: {
      info: { title: "Fuel Centre API (v3/Node)", version: "3.0.0" },
    },
  });
  app.register(swaggerUi, { routePrefix: "/docs" });

  // Path normalization hook (handles /c/<clientId>/ prefixes)
  app.addHook("preHandler", (req, _reply, done) => {
    req.routedPath = normalizeRoutedPath(req.url.split("?")[0], req);
    req.paths = getPaths(req.clientId);
    req.uid = getUidForClient(req.clientId);
    done();
  });

  // Register routes explicitly (ignoring fuel_routes.yaml for Node.js stability)
  app.register(healthRoute);
  app.register(nutritionRoute);
  app.register(supplementsRoute);
  app.register(supplementEstimateRoute);
  app.register(fuelRoute);
  app.register(pushRoute);
  app.register(coachRoute);
  app.register(v4ProxyRoute); // v3 → v4 (lokales Python-Backend), rein für Erreichbarkeit
  app.register(staticRoute); // staticRoute handles catch-all, must be last

  // Error handler
  app.setErrorHandler((error, _request, reply) => {
    app.log.error(error);
    reply.status(500).send({ ok: false, error: "Internal server error" });
  });

  return app;
}


export async function startServer() {
  const app = createApp();
  await app.listen({ port: PORT, host: HOST });
  console.log(`🍽️  Fuel Centre running on http://${HOST}:${PORT}`);

  // Background schedulers
  if (process.env.FUEL_DISABLE_PUSH_SCHEDULER === "1") {
    console.log("[push-scheduler] disabled (FUEL_DISABLE_PUSH_SCHEDULER=1)");
  } else {
    startPushScheduler(GLOBAL_DATA_DIR, CATALOGS_DIR);
  }
  if (firestoreSyncEnabled()) {
    startFirestorePullScheduler();
  } else {
    console.log(
      `[firestore-admin] sync disabled for mode=${serverMode()} port=${PORT} ` +
      `override=${process.env.FUEL_ENABLE_FIRESTORE_SYNC || "" || "auto"}`
    );
  }
}
