import { execFile } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GEMINI_MICROS_SCRIPT = path.join(__dirname, "..", "..", "..", "bin", "gemini-micros");

export async function estimateMicros(description) {
  return new Promise((resolve) => {
    execFile(GEMINI_MICROS_SCRIPT, [description], { timeout: 15000 }, (error, stdout, stderr) => {
      if (error) {
        resolve({});
        return;
      }

      try {
        const result = JSON.parse(stdout.trim());
        resolve(result);
      } catch (e) {
        resolve({});
      }
    });
  });
}
