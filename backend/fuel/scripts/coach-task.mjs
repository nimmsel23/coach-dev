// One-shot entry point for Vital Hub. Never starts HTTP or schedulers.
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
try { process.loadEnvFile(path.join(root, ".env")); } catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const action = process.argv[2];
const routes = { status: "/coach/health", push: "/coach/sync/push", pull: "/coach/sync/pull", enrich: "/coach/enrich" };
if (!Object.hasOwn(routes, action)) {
  console.error("Usage: node scripts/coach-task.mjs status|push|pull|enrich");
  process.exit(2);
}
try {
  const { default: register } = await import("../src/server/routes/coach.mjs");
  const { getPaths } = await import("../src/server/config/paths.mjs");
  const handlers = new Map();
  await register({ get: (url, handler) => handlers.set(url, handler), post: (url, handler) => handlers.set(url, handler) });
  let status = 200;
  let result;
  const reply = { status(code) { status = code; return this; }, send(value) { result = value; return value; } };
  await handlers.get(routes[action])({ paths: getPaths(), uid: process.env.FUEL_CLOUD_UID || "default", body: { days: 2 } }, reply);
  process.stdout.write(`\nFUEL_RESULT=${JSON.stringify(result)}\n`);
  process.exit(status >= 400 || result?.ok === false ? 1 : 0);
} catch (error) {
  process.stdout.write(`\nFUEL_RESULT=${JSON.stringify({ ok: false, error: error.message })}\n`);
  process.exit(1);
}
