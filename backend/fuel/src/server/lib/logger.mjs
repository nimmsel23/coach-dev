import pino from "pino";

// Shared logger for modules outside the Fastify request/response cycle
// (firestore-admin.mjs push/pull, push-scheduler, etc.) — same pino-pretty
// formatting as app.mjs's request logger, so timestamps line up in dev.
const logger = pino(
  process.env.NODE_ENV === "development"
    ? {
        transport: {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "SYS:HH:MM:ss", ignore: "pid,hostname" },
        },
      }
    : {}
);

export default logger;
