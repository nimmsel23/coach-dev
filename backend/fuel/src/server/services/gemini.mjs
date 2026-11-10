import fs from "fs";
import path from "path";

const ENV_PATH = path.join(process.env.HOME, ".env", "fuel.env");

function loadEnv() {
  if (!fs.existsSync(ENV_PATH)) return;
  for (const line of fs.readFileSync(ENV_PATH, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const [key, ...rest] = trimmed.split("=");
    if (key && !process.env[key]) process.env[key] = rest.join("=").trim();
  }
}

loadEnv();

export async function callGemini(prompt) {
  const apiKey = process.env.GEMINI_API_KEY;
  const model  = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  if (!apiKey) throw new Error("GEMINI_API_KEY fehlt in ~/.env/fuel.env");

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
  });

  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

export function extractJson(raw) {
  let s = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  // Gemini hängt gelegentlich Prosa vor/nach das JSON ("Hier ist die Analyse: {...}")
  // trotz Anweisung "ausschließlich JSON" — Fenced-Code-Strip allein reicht dann
  // nicht, JSON.parse bricht am ersten Zeichen. Fallback: äußerstes {...} oder
  // [...] per Klammer-Zählung extrahieren statt blind zu vertrauen.
  const first = s.search(/[[{]/);
  if (first > 0) {
    const open = s[first];
    const close = open === "{" ? "}" : "]";
    let depth = 0;
    for (let i = first; i < s.length; i++) {
      if (s[i] === open) depth++;
      else if (s[i] === close) {
        depth--;
        if (depth === 0) { s = s.slice(first, i + 1); break; }
      }
    }
  }
  return s;
}
