import { execFile } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, "..", "..", "..", "..");

// Ruft fuel/vision_cli.py als Subprocess auf, statt einen separaten
// FastAPI-Server auf :9050 zu proxien (fuel-catalog-server.py entfernt —
// dessen Katalog-Endpoints waren redundant zu /nutrition/catalog +
// /supplements/catalog, nur die Gemini-Vision-Schätzung war einzigartig).
function callVisionCli(body) {
  return new Promise((resolve, reject) => {
    const child = execFile(
      "python3",
      ["-m", "fuel.vision_cli"],
      { cwd: REPO_ROOT, timeout: 45_000, maxBuffer: 20 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error && !stdout) {
          reject(new Error(stderr || error.message));
          return;
        }
        try {
          resolve(JSON.parse(stdout));
        } catch {
          reject(new Error(stderr || "vision_cli: invalid JSON output"));
        }
      }
    );
    child.stdin.write(JSON.stringify(body));
    child.stdin.end();
  });
}

export default async function visionRoute(app) {
  app.post("/nutrition/vision", async (req, reply) => {
    try {
      const data = await callVisionCli(req.body);
      return data;
    } catch (e) {
      app.log.error(e);
      return reply.status(500).send({ ok: false, error: e.message });
    }
  });
}
