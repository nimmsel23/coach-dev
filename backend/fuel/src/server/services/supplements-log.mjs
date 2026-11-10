import path from "path";
import { readJsonFile, writeJsonFile } from "../lib/file-io.mjs";
import { randomId } from "../../shared/utils/ids.mjs";
import { SUPPLEMENTS_LOG_DIR } from "../config/paths.mjs";
import { pushSupplementLog } from "../lib/firestore-admin.mjs";
import { addDeletedIntakeId, getDeletedIntakeIds, removeDeletedIntakeId } from "./log-tombstones.mjs";

function getLogPath(date, supplementsLogDir = SUPPLEMENTS_LOG_DIR) {
  return path.join(supplementsLogDir, `${date}.json`);
}

export function loadLog(date, supplementsLogDir = SUPPLEMENTS_LOG_DIR) {
  const filePath = getLogPath(date, supplementsLogDir);
  const log = readJsonFile(filePath, {
    date,
    intakes: [],
    deleted_intake_ids: [],
  });
  if (!log.intakes) log.intakes = [];
  if (!Array.isArray(log.deleted_intake_ids)) {
    log.deleted_intake_ids = getDeletedIntakeIds(date, supplementsLogDir);
  }
  return log;
}

function writeLogFile(log, supplementsLogDir = SUPPLEMENTS_LOG_DIR) {
  const filePath = getLogPath(log.date, supplementsLogDir);
  log.updated_at = new Date().toISOString();
  log.deleted_intake_ids = Array.from(new Set([...(log.deleted_intake_ids || []), ...getDeletedIntakeIds(log.date, supplementsLogDir)]));
  writeJsonFile(filePath, log);
}

export function saveLog(log, supplementsLogDir = SUPPLEMENTS_LOG_DIR, uid = "default") {
  writeLogFile(log, supplementsLogDir);
  pushSupplementLog(log.date, log, { uid }).catch(() => {});
}

export function saveLogFromRemote(log, supplementsLogDir = SUPPLEMENTS_LOG_DIR) {
  writeLogFile(log, supplementsLogDir);
}

export function addIntake(log, intakeInput, supplementsLogDir = SUPPLEMENTS_LOG_DIR) {
  const supplementId = (intakeInput.supplement_id || "").toString().trim();
  const name = (intakeInput.name || supplementId).toString().trim();
  if (!supplementId || !name) return null;

  const dose = intakeInput.dose == null ? null : Number(intakeInput.dose);
  const unit = (intakeInput.unit || "mg").toString().trim() || "mg";
  const timeOfDay = (intakeInput.time_of_day || "any").toString().trim() || "any";
  const notes = (intakeInput.notes || "").toString().trim();

  const intake = {
    id: intakeInput.id || randomId("supp"),
    supplement_id: supplementId,
    name,
    dose,
    unit,
    time_of_day: timeOfDay,
    notes,
    time: new Date().toISOString(),
  };

  log.intakes.push(intake);
  removeDeletedIntakeId(log.date, intake.id, supplementsLogDir);
  log.deleted_intake_ids = (log.deleted_intake_ids || []).filter((id) => id !== intake.id);
  return intake;
}

export function updateIntake(log, intakeId, updates) {
  const idx = log.intakes.findIndex((i) => i.id === intakeId);
  if (idx < 0) return null;

  const current = log.intakes[idx];
  const merged = { ...current };
  if (updates.dose !== undefined) merged.dose = updates.dose == null ? null : Number(updates.dose);
  if (updates.unit !== undefined) merged.unit = (updates.unit || current.unit).toString().trim();
  if (updates.time_of_day !== undefined) merged.time_of_day = (updates.time_of_day || current.time_of_day).toString().trim();
  if (updates.notes !== undefined) merged.notes = (updates.notes || "").toString().trim();
  if (updates.name !== undefined) merged.name = (updates.name || current.name).toString().trim();

  log.intakes[idx] = merged;
  return merged;
}

export function deleteIntake(log, intakeId, supplementsLogDir = SUPPLEMENTS_LOG_DIR) {
  const idx = log.intakes.findIndex((i) => i.id === intakeId);
  if (idx >= 0) {
    log.intakes.splice(idx, 1);
    addDeletedIntakeId(log.date, intakeId, supplementsLogDir);
    log.deleted_intake_ids = Array.from(new Set([...(log.deleted_intake_ids || []), intakeId]));
    return true;
  }
  return false;
}
