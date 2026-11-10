import fs from "fs";
import path from "path";
import { NUTRITION_JOURNAL_DIR } from "../config/paths.mjs";

function getPath(date, journalDir = NUTRITION_JOURNAL_DIR) {
  return path.join(journalDir, `${date}.md`);
}

export function readEntry(date, journalDir = NUTRITION_JOURNAL_DIR) {
  const filePath = getPath(date, journalDir);
  if (fs.existsSync(filePath)) {
    return fs.readFileSync(filePath, "utf-8");
  }
  return "";
}

export function writeEntry(date, content, journalDir = NUTRITION_JOURNAL_DIR) {
  const filePath = getPath(date, journalDir);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf-8");
}

export function listEntries(journalDir = NUTRITION_JOURNAL_DIR) {
  if (!fs.existsSync(journalDir)) {
    return [];
  }
  return fs
    .readdirSync(journalDir)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .reverse()
    .map((name) => ({ name, date: name.replace(/\.md$/, "") }));
}
