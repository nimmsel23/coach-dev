import path from "path";
import { readJsonFile, writeJsonFile } from "../lib/file-io.mjs";
import { randomId } from "../../shared/utils/ids.mjs";
import { FUEL_DIR } from "../config/paths.mjs";

function getLogPath(date) {
  return path.join(FUEL_DIR, `${date}.json`);
}

export function loadLog(date) {
  const filePath = getLogPath(date);
  const log = readJsonFile(filePath, {
    datum: date,
    entries: [],
  });
  if (!log.entries) log.entries = [];
  return log;
}

export function saveLog(log) {
  const filePath = getLogPath(log.datum);
  writeJsonFile(filePath, log);
}

export function addEntry(log, entryInput) {
  const mahlzeit = (entryInput.mahlzeit || "").toString().trim();
  const speise = (entryInput.speise || "").toString().trim();

  if (!mahlzeit || !speise) return null;

  const entry = {
    id: randomId("fuel"),
    mahlzeit,
    speise,
    kalorien: entryInput.kalorien == null ? 0 : Number(entryInput.kalorien),
    protein: entryInput.protein == null ? 0 : Number(entryInput.protein),
    kohlenhydrate: entryInput.kohlenhydrate == null ? 0 : Number(entryInput.kohlenhydrate),
    fett: entryInput.fett == null ? 0 : Number(entryInput.fett),
    notizen: (entryInput.notizen || "").toString().trim(),
    time: new Date().toISOString(),
  };

  log.entries.push(entry);
  return entry;
}
