// coach-shell.html -> index.html; coach.html remains the React app embedded by the shell.
// Splash, SW (coach-sw.js inkl. Precache der Assets), SW-Register und Manifest-Patch
// macht danach scripts/mini-app-shell (@vos/mini-app-shell, Konfig: mini-app.json).
import { copyFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const distDir = resolve("dist-coach");
const coachHtml = resolve(distDir, "coach-shell.html");
const indexHtml = resolve(distDir, "index.html");

if (!existsSync(coachHtml)) {
  console.error("prepare-coach-dist: dist-coach/coach-shell.html missing");
  process.exit(1);
}

copyFileSync(coachHtml, indexHtml);
console.log("prepare-coach-dist: coach-shell.html -> index.html; React app bleibt unter coach.html");
