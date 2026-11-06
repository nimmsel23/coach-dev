import { copyFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const distDir = resolve(process.argv[2] || "dist-plan");
const planHtml = resolve(distDir, "plan.html");
const indexHtml = resolve(distDir, "index.html");

if (!existsSync(planHtml)) {
  console.error("prepare-plan-dist: dist-plan/plan.html missing");
  process.exit(1);
}

copyFileSync(planHtml, indexHtml);
console.log("prepare-plan-dist: plan.html -> index.html");
