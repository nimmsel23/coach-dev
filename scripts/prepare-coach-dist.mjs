// coach.html -> index.html. Splash, SW (coach-sw.js inkl. Precache der Assets), SW-Register und
// Manifest-Patch macht danach scripts/mini-app-shell (@vos/mini-app-shell, Konfig: mini-app.json).
import { copyFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const distDir = resolve("dist-coach");
const coachHtml = resolve(distDir, "coach.html");
const indexHtml = resolve(distDir, "index.html");

if (!existsSync(coachHtml)) {
  console.error("prepare-coach-dist: dist-coach/coach.html missing");
  process.exit(1);
}

copyFileSync(coachHtml, indexHtml);
console.log("prepare-coach-dist: coach.html -> index.html");
