import fs from "fs";
import path from "path";
import { NUTRITION_INGREDIENTS_DIR } from "../config/paths.mjs";

function normalize(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[äöüß]/g, (c) => ({ ä: "ae", ö: "oe", ü: "ue", ß: "ss" }[c]))
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Wörter ab 5 Zeichen als Anker — kurze Wörter ("reis", "käse", "mit") wären
// zu generisch und würden ständig falsch matchen.
function significantWords(norm) {
  return norm.split(" ").filter((w) => w.length >= 5);
}

export function loadIngredients() {
  if (!fs.existsSync(NUTRITION_INGREDIENTS_DIR)) return [];
  const files = fs.readdirSync(NUTRITION_INGREDIENTS_DIR).filter((f) => f.endsWith(".json") && !f.endsWith(".bak"));
  const items = [];
  for (const f of files) {
    try {
      items.push(JSON.parse(fs.readFileSync(path.join(NUTRITION_INGREDIENTS_DIR, f), "utf-8")));
    } catch {}
  }
  return items;
}

// Findet bekannte Meal-Katalog- und Ingredient-Einträge, die im Freitext
// erwähnt werden — z.B. "Nussschnecke und Ziegenkäse" → 2 Treffer. Statt auf
// exakten vollen Namens-Substring zu matchen (scheitert an Alltagsbegriffen
// wie "Ziegenkäse" vs. Katalogname "Ziegen-Schnittkäse Natur laktosefrei"),
// wird pro Wort auf gemeinsamem Präfix ab 5 Zeichen gematcht — deckt deutsche
// Komposita ab ("ziegenkaese".startsWith("ziegen") → Treffer).
// Ein Anker-Wort wird nur einmal verbraucht, damit Meal- und Ingredient-
// Eintrag für dasselbe Gericht nicht doppelt gezählt werden (längerer/
// spezifischerer Name gewinnt).
export function matchComponents(text, catalog, ingredients) {
  const norm = normalize(text);
  const textWords = significantWords(norm);
  if (textWords.length === 0) return [];

  const candidates = [
    ...(catalog?.items || []).map((i) => ({
      id: i.id, type: "meal", name: i.name,
      kcal: i.kcal || 0, protein: i.protein || 0, carbs: i.carbs || 0, fat: i.fat || 0,
    })),
    ...(ingredients || []).map((i) => ({
      id: i.id, type: "ingredient", name: i.name,
      kcal: i.macros?.kcal || 0, protein: i.macros?.protein || 0, carbs: i.macros?.carbs || 0, fat: i.macros?.fat || 0,
      micros: i.micros || null,
    })),
  ]
    .map((c) => ({ ...c, words: significantWords(normalize(c.name)) }))
    .filter((c) => c.words.length > 0)
    .sort((a, b) => b.name.length - a.name.length);

  const usedAnchors = new Set();
  const matches = [];
  for (const c of candidates) {
    const hitWord = c.words.find(
      (cw) => !usedAnchors.has(cw) && textWords.some((tw) => tw.startsWith(cw) || cw.startsWith(tw))
    );
    if (!hitWord) continue;
    matches.push(c);
    usedAnchors.add(hitWord);
  }
  return matches;
}
