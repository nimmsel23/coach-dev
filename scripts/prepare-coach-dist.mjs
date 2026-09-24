import { copyFileSync, existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";

const distDir = resolve("dist-coach");
const coachHtml = resolve(distDir, "coach.html");
const indexHtml = resolve(distDir, "index.html");

if (!existsSync(coachHtml)) {
  console.error("prepare-coach-dist: dist-coach/coach.html missing");
  process.exit(1);
}

copyFileSync(coachHtml, indexHtml);
const precache = [
  "/index.html",
  "/coach-manifest.webmanifest",
  "/coach-icon.svg",
  "/coach-icon-180.png",
  "/coach-icon-192.png",
  "/coach-icon-512.png",
  ...readdirSync(resolve(distDir, "assets")).map((name) => `/assets/${name}`),
];
for (const asset of precache) {
  if (!existsSync(resolve(distDir, asset.slice(1)))) {
    throw new Error(`prepare-coach-dist: missing precache asset ${asset}`);
  }
}
const cacheVersion = createHash("sha256")
  .update(readFileSync(indexHtml))
  .update(precache.join("\n"))
  .digest("hex").slice(0, 12);
const workerPath = resolve(distDir, "coach-sw.js");
const worker = readFileSync(workerPath, "utf8")
  .replace("__COACH_CACHE__", `vos-coach-${cacheVersion}`)
  .replace("__COACH_PRECACHE__", JSON.stringify(precache));
writeFileSync(workerPath, worker);
console.log("prepare-coach-dist: coach.html -> index.html");
