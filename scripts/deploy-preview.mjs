#!/usr/bin/env node
// Deployt einen 24h-Firebase-Preview-Channel und schickt den Link per Telegram.
// Läuft bewusst LOKAL (nicht in CI): die Crossover-Aliase in der vite-Config
// (@fuel/@habits/@journal/@fitness/@db) zeigen absolut auf die Nachbar-Repos
// unter /home/alpha — nur hier existiert der echte Build-Kontext.
// Firebase-Projekt kommt aus .firebaserc, der App-Name aus package.json,
// Telegram-Creds aus ~/.env/fitness.env (TELEGRAM_TOKEN, TELEGRAM_CHAT_ID).

import { execSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CHANNEL = "preview";
const EXPIRES = "24h";

const project = JSON.parse(readFileSync(".firebaserc", "utf8")).projects?.default;
if (!project) {
  console.error("❌ Kein default-Projekt in .firebaserc gefunden.");
  process.exit(1);
}
const appName = JSON.parse(readFileSync("package.json", "utf8")).name || "app";

function loadEnvFile(path) {
  const env = {};
  try {
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch { /* Datei fehlt → Telegram wird einfach übersprungen */ }
  return env;
}

console.log(`🚀 Deploye Preview-Channel "${CHANNEL}" (${EXPIRES}) → ${project} ...`);
const raw = execSync(
  `firebase hosting:channel:deploy ${CHANNEL} --only coach --expires ${EXPIRES} --project ${project} --json`,
  { encoding: "utf8", stdio: ["inherit", "pipe", "inherit"] }
);

const result = JSON.parse(raw);
const sites = Object.values(result.result || {});
const url = sites[0]?.url;
const expireTime = sites[0]?.expireTime;
if (!url) {
  console.error("❌ Keine Preview-URL in der Firebase-Antwort gefunden:", raw);
  process.exit(1);
}
console.log(`✅ Preview: ${url}`);
if (expireTime) console.log(`⏱️  Gültig bis: ${expireTime}`);

const env = loadEnvFile(join(homedir(), ".env", "fitness.env"));
const token = env.TELEGRAM_TOKEN;
const chatIds = (env.TELEGRAM_CHAT_ID || "").split(",").map((s) => s.trim()).filter(Boolean);

let commit = "";
try {
  commit = execSync("git log -1 --format=%s", { encoding: "utf8" }).trim();
} catch { /* kein git → egal */ }

const text = [
  `🚀 Neue Preview für ${appName} (dev) deployed!`,
  "",
  `🔗 ${url}`,
  `⏱️ Gültig für ${EXPIRES}.`,
  commit ? `\nCommit: ${commit}` : "",
].join("\n");

// Bevorzugter lokaler Weg: tele-CLI (~/.local/bin/tele, Ideapad-Bot mit
// hartkodiertem Token — funktioniert ohne .env). Fällt tele weg/fehl,
// greift der alte Weg über ~/.env/fitness.env.
const tele = spawnSync("tele", [text], { stdio: "inherit" });
if (tele.status === 0) {
  console.log("📨 Telegram via tele-CLI gesendet.");
  process.exit(0);
}
console.log("ℹ️  tele-CLI nicht verfügbar/fehlgeschlagen — Fallback ~/.env/fitness.env.");

if (!token || chatIds.length === 0) {
  console.log("ℹ️  Kein TELEGRAM_TOKEN/TELEGRAM_CHAT_ID in ~/.env/fitness.env — überspringe Telegram.");
  process.exit(0);
}

for (const chatId of chatIds) {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  const body = await res.json();
  console.log(body.ok ? `📨 Telegram → ${chatId} ok` : `⚠️ Telegram → ${chatId} fehlgeschlagen: ${body.description}`);
}
