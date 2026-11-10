import { execFile } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GEMINI_ESTIMATE_SCRIPT = path.join(__dirname, "..", "..", "..", "bin", "gemini-estimate");

export async function estimateMacros(description) {
  return new Promise((resolve) => {
    execFile(GEMINI_ESTIMATE_SCRIPT, [description], { timeout: 12000 }, (error, stdout, stderr) => {
      if (error) {
        resolve({ kcal: 0, protein: 0, carbs: 0, fat: 0, _error: stderr || error.message });
        return;
      }

      try {
        const result = JSON.parse(stdout.trim());
        resolve(result);
      } catch (e) {
        resolve({ kcal: 0, protein: 0, carbs: 0, fat: 0, _error: "JSON parse error" });
      }
    });
  });
}
