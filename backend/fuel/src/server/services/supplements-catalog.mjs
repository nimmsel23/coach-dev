import path from "path";
import { readJsonFile, writeJsonFile, readYamlFile, writeYamlFile } from "../lib/file-io.mjs";
import { slugifyId } from "../../shared/utils/ids.mjs";
import { SUPPLEMENTS_CATALOG_PATH } from "../config/paths.mjs";
import { pushSupplementsCatalog } from "../lib/firestore-admin.mjs";

const CATALOG_DEFAULTS = {
  version: 1,
  updated_at: new Date().toISOString(),
  items: [],
};

export function loadCatalog() {
  const catalog = readYamlFile(SUPPLEMENTS_CATALOG_PATH, CATALOG_DEFAULTS);
  if (!catalog.items) catalog.items = [];
  return catalog;
}

function catalogJsonPath(supplementsDir) {
  return path.join(supplementsDir, "catalog.json");
}

function withCatalogMeta(catalog, supplementsDir = null, uid = "default") {
  if (!catalog || typeof catalog !== "object") return catalog;
  Object.defineProperty(catalog, "__supplementsDir", { value: supplementsDir, enumerable: false, writable: true });
  Object.defineProperty(catalog, "__uid", { value: uid, enumerable: false, writable: true });
  return catalog;
}

export function loadCatalogForUser(supplementsDir = null, { uid = "default" } = {}) {
  if (!supplementsDir) return withCatalogMeta(loadCatalog(), null, uid);
  const catalog = readJsonFile(catalogJsonPath(supplementsDir), CATALOG_DEFAULTS);
  if (!catalog.items) catalog.items = [];
  return withCatalogMeta(catalog, supplementsDir, uid);
}

function writeUserCatalog(catalog, supplementsDir, uid, { skipPush = false } = {}) {
  const file = catalogJsonPath(supplementsDir);
  catalog.updated_at = new Date().toISOString();
  writeJsonFile(file, catalog);
  if (skipPush) return;
  if (uid && uid !== "default") {
    pushSupplementsCatalog(catalog.items || [], { uid, sourcePath: file }).catch(() => {});
  } else {
    console.log(`[supplements-catalog] scope=catalog direction=save uid=default path=${file} result=local-only count=${(catalog.items || []).length}`);
  }
}

export function saveCatalog(catalog, supplementsDir = null, { uid = "default" } = {}) {
  if (supplementsDir || catalog?.__supplementsDir) {
    writeUserCatalog(catalog, supplementsDir || catalog.__supplementsDir, uid || catalog.__uid || "default");
    return;
  }
  catalog.updated_at = new Date().toISOString();
  writeYamlFile(SUPPLEMENTS_CATALOG_PATH, catalog);
  pushSupplementsCatalog(catalog.items || []).catch(() => {});
}

export function saveCatalogFromRemote(catalog, supplementsDir, { uid = "default" } = {}) {
  writeUserCatalog(catalog, supplementsDir, uid, { skipPush: true });
}

export function addOrUpdateSupplement(catalog, input) {
  const name = (input.name || "").toString().trim();
  if (!name) return null;

  const id = input.id || slugifyId(name, "supp");
  const unit = (input.unit || "mg").toString().trim() || "mg";
  const defaultDose = input.default_dose == null ? null : Number(input.default_dose);
  const defaultTime = (input.default_time_of_day || "any").toString().trim() || "any";

  const item = {
    id,
    name,
    unit,
    default_dose: defaultDose,
    default_time_of_day: defaultTime,
    // schedule war früher nie Teil dieses Objekts — GeminiCatalogModal.jsx
    // schätzte es längst, aber es wurde beim Speichern verworfen.
    // Supplements/utils.js:isDueToday() (genutzt von DailyChecklist.jsx)
    // hing dadurch komplett in der Luft (2026-07-30 entdeckt).
    schedule: input.schedule ?? null,
    // Pro-Supplement-Reminder — undefined lassen (nicht null), wenn nicht
    // gesetzt, damit ein YAML-/CLI-angelegtes reminder-Feld beim Merge unten
    // erhalten bleibt.
    ...(input.reminder !== undefined ? { reminder: input.reminder } : {}),
    // kind/substance/micros nur setzen, wenn mitgeschickt — sonst bleiben
    // YAML-/CLI-Werte beim Merge unten erhalten.
    ...(input.kind ? { kind: input.kind } : {}),
    ...(input.substance ? { substance: input.substance } : {}),
    ...(input.micros ? { micros: input.micros } : {}),
  };

  const idx = catalog.items.findIndex((i) => i.id === id);
  if (idx >= 0) {
    // Merge statt Replace: bewahrt Felder, die dieses API-Schema nicht kennt
    // (product, micros, actives, per_unit, notes, source — von `fuel supplement
    // add` / catalog.yaml). Explizite Werte aus `item` gewinnen.
    catalog.items[idx] = { ...catalog.items[idx], ...item };
  } else {
    catalog.items.push(item);
  }

  return catalog.items[idx >= 0 ? idx : catalog.items.length - 1];
}

export function deleteSupplement(catalog, id) {
  const idx = catalog.items.findIndex((i) => i.id === id);
  if (idx < 0) return false;
  catalog.items.splice(idx, 1);
  return true;
}
