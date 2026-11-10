import fs from "fs";
import path from "path";
import YAML from "yaml";
import { NUTRITION_DIR, NUTRITION_MEALS_DIR } from "../config/paths.mjs";
import { slugifyId } from "../../shared/utils/ids.mjs";
import { pushNutritionCatalog } from "../lib/firestore-admin.mjs";
import { verifyCatalogItemAsync } from "./nutrition-catalog-verify.mjs";

function mealPath(id, ext = ".yaml") {
  return path.join(NUTRITION_MEALS_DIR, `${id}${ext}`);
}

function normalizeName(name) {
  return String(name || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function sortCatalogItems(items) {
  return items.sort((a, b) => {
    const aRecent = a.last_used_at || a.updated_at || "";
    const bRecent = b.last_used_at || b.updated_at || "";
    if (aRecent !== bRecent) return bRecent.localeCompare(aRecent);
    return (a.name || "").localeCompare(b.name || "");
  });
}

function catalogJsonPath(nutritionDir = NUTRITION_DIR) {
  return path.join(nutritionDir, "catalog.json");
}

function withCatalogMeta(catalog, nutritionDir = null, uid = "default") {
  if (!catalog || typeof catalog !== "object") return catalog;
  Object.defineProperty(catalog, "__nutritionDir", { value: nutritionDir, enumerable: false, writable: true });
  Object.defineProperty(catalog, "__uid", { value: uid, enumerable: false, writable: true });
  return catalog;
}

function loadLegacyCatalog() {
  if (!fs.existsSync(NUTRITION_MEALS_DIR)) fs.mkdirSync(NUTRITION_MEALS_DIR, { recursive: true });

  const files = fs.readdirSync(NUTRITION_MEALS_DIR).filter((f) =>
    (f.endsWith(".yaml") || f.endsWith(".yml") || f.endsWith(".json")) &&
    !f.includes(".deleted") && !f.includes(".bak")
  );

  const items = [];
  const seenIds = new Set();

  for (const file of files) {
    const ext = path.extname(file);
    const id = path.basename(file, ext);
    if (seenIds.has(id) && ext === ".json") continue;
    try {
      const raw = fs.readFileSync(path.join(NUTRITION_MEALS_DIR, file), "utf-8");
      const data = ext === ".json" ? JSON.parse(raw) : YAML.parse(raw);
      items.push(data);
      seenIds.add(id);
    } catch (e) {
      console.warn(`[nutrition-catalog] skip corrupt file ${file}:`, e.message);
    }
  }

  return { items: sortCatalogItems(items), deleted_ids: [] };
}

export function loadCatalog(nutritionDir = null, { uid = "default" } = {}) {
  if (!nutritionDir) return withCatalogMeta(loadLegacyCatalog(), null, uid);

  const file = catalogJsonPath(nutritionDir);
  if (fs.existsSync(file)) {
    try {
      const raw = JSON.parse(fs.readFileSync(file, "utf-8"));
      return withCatalogMeta({
        items: sortCatalogItems(Array.isArray(raw.items) ? raw.items : []),
        deleted_ids: Array.isArray(raw.deleted_ids) ? raw.deleted_ids : [],
      }, nutritionDir, uid);
    } catch (e) {
      console.warn(`[nutrition-catalog] failed to read ${file}:`, e.message);
    }
  }

  const legacy = loadLegacyCatalog();
  console.warn(`[nutrition-catalog] user catalog missing at ${file} — falling back to legacy repo catalog`);
  return withCatalogMeta(legacy, nutritionDir, uid);
}

export function loadMeal(id) {
  // Check YAML first, then JSON
  const pYaml = mealPath(id, ".yaml");
  const pYml = mealPath(id, ".yml");
  const pJson = mealPath(id, ".json");

  if (fs.existsSync(pYaml)) {
    try { return YAML.parse(fs.readFileSync(pYaml, "utf-8")); } catch { return null; }
  }
  if (fs.existsSync(pYml)) {
    try { return YAML.parse(fs.readFileSync(pYml, "utf-8")); } catch { return null; }
  }
  if (fs.existsSync(pJson)) {
    try { return JSON.parse(fs.readFileSync(pJson, "utf-8")); } catch { return null; }
  }
  return null;
}

function writeUserCatalog(catalog, nutritionDir, uid, { skipPush = false } = {}) {
  if (!fs.existsSync(nutritionDir)) fs.mkdirSync(nutritionDir, { recursive: true });
  const file = catalogJsonPath(nutritionDir);
  fs.writeFileSync(file, JSON.stringify({
    items: sortCatalogItems([...(catalog.items || [])]),
    deleted_ids: Array.from(new Set(catalog.deleted_ids || [])),
  }, null, 2), "utf-8");
  if (skipPush) return;
  if (uid && uid !== "default") {
    pushNutritionCatalog(catalog.items || [], {
      uid,
      deletedIds: catalog.deleted_ids || [],
      sourcePath: file,
    }).catch(() => {});
  } else {
    console.log(`[nutrition-catalog] scope=catalog direction=save uid=default path=${file} result=local-only count=${(catalog.items || []).length}`);
  }
}

function saveMealLegacy(item) {
  if (!fs.existsSync(NUTRITION_MEALS_DIR)) fs.mkdirSync(NUTRITION_MEALS_DIR, { recursive: true });

  item.updated_at = new Date().toISOString();

  // Always save as .yaml
  const p = mealPath(item.id, ".yaml");
  fs.writeFileSync(p, YAML.stringify(item, { indent: 2 }), "utf-8");

  // If a legacy .json exists, tombstone it
  const pJson = mealPath(item.id, ".json");
  if (fs.existsSync(pJson)) {
    try { fs.renameSync(pJson, `${pJson}.deleted`); } catch {}
  }

  // If a tombstone exists for this id, remove it (meal was un-deleted by re-save)
  for (const ext of [".yaml", ".yml", ".json"]) {
    const tomb = mealPath(item.id, `${ext}.deleted`);
    if (fs.existsSync(tomb)) { try { fs.unlinkSync(tomb); } catch {} }
  }

  // Fire-and-forget push to Firestore
  const catalog = loadCatalog();
  pushNutritionCatalog(catalog.items).catch(() => {});

  // Neuer oder noch nie geprüfter Eintrag → Haiku+WebSearch-Verifikation
  // im Hintergrund anstoßen (verify-one setzt verified_at, kein Retrigger
  // bei jedem erneuten Loggen desselben Meals).
  if (!item.verified_at) {
    verifyCatalogItemAsync(item.id);
  }

  return item;
}

// Meal-Katalog ist nur für Meals/Rezepte — rohe Zutaten gehören nach
// catalogs/nutrition/ingredients/ (fuel-ingredient CLI). Verhindert ein
// Wiederauftauchen der historischen Dopplung (kind=ingredient-Items lagen
// bis 2026-09-24 parallel in catalog.json UND in ingredients/).
function assertNotIngredient(item) {
  if (item?.kind === "ingredient") {
    throw new Error(
      `[nutrition-catalog] kind="ingredient" gehört nicht in den Meal-Katalog (Item: ${item.name || item.id}) — ` +
      `stattdessen "python3 -m fuel.ingredient '<Name>'" nutzen (schreibt nach catalogs/nutrition/ingredients/).`
    );
  }
}

export function saveMeal(item, nutritionDir = null, { uid = "default", catalog = null } = {}) {
  assertNotIngredient(item);
  if (!nutritionDir) return saveMealLegacy(item);
  const nextCatalog = catalog || loadCatalog(nutritionDir, { uid });
  const items = [...(nextCatalog.items || [])];
  const index = items.findIndex((existing) => existing.id === item.id);
  if (index >= 0) items[index] = item;
  else items.push(item);
  nextCatalog.items = sortCatalogItems(items);
  nextCatalog.deleted_ids = (nextCatalog.deleted_ids || []).filter((deletedId) => deletedId !== item.id);
  writeUserCatalog(nextCatalog, nutritionDir, uid);
  return item;
}

export function deleteMeal(id, nutritionDir = null, { uid = "default", catalog = null } = {}) {
  if (nutritionDir) {
    const nextCatalog = catalog || loadCatalog(nutritionDir, { uid });
    nextCatalog.items = (nextCatalog.items || []).filter((item) => item.id !== id);
    nextCatalog.deleted_ids = Array.from(new Set([...(nextCatalog.deleted_ids || []), id]));
    writeUserCatalog(nextCatalog, nutritionDir, uid);
    return;
  }
  let deleted = false;
  for (const ext of [".yaml", ".yml", ".json"]) {
    const p = mealPath(id, ext);
    if (!fs.existsSync(p)) continue;
    const tombstone = `${p}.deleted`;
    try {
      fs.renameSync(p, tombstone);
      deleted = true;
      console.log(`[nutrition-catalog] 🪦  ${path.basename(p)} → ${path.basename(tombstone)}`);
    } catch (e) {
      console.warn(`[nutrition-catalog] tombstone rename failed for ${p}:`, e.message);
    }
  }
  if (deleted) {
    // Push updated catalog (without the deleted meal) to Firestore
    const catalog = loadCatalog();
    pushNutritionCatalog(catalog.items).catch(() => {});
  }
}

// IDs aller lokal tombstoned Meals — Grundlage für pushNutritionCatalog()'s
// Merge (eine lokale Löschung muss auch dann gewinnen, wenn Firestore die ID
// zwischenzeitlich wieder enthält, z.B. weil sie während lokaler Downtime
// über die Cloud-UI neu angelegt wurde).
export function listDeletedMealIds(nutritionDir = null) {
  if (nutritionDir) {
    const catalog = loadCatalog(nutritionDir);
    return Array.from(new Set(catalog.deleted_ids || []));
  }
  if (!fs.existsSync(NUTRITION_MEALS_DIR)) return [];
  return fs.readdirSync(NUTRITION_MEALS_DIR)
    .filter((f) => f.includes(".deleted"))
    .map((f) => path.basename(f.replace(/\.(yaml|yml|json)\.deleted$/, "")));
}

export function normalizeMeal(input, existingId = null) {
  const name = (input.name || input.description || "").toString().trim();
  if (!name) return null;

  const id = existingId || input.id || slugifyId(name, "meal");

  return {
    id,
    kind:             input.kind || "meal",
    category:         input.category || "meal",
    name,
    alias:            input.alias || null,
    meal_type:        input.meal_type || "meal",
    description:      input.description || name,
    notes:            input.notes || "",
    kcal:             Math.max(0, Math.round((input.kcal ?? 0) * 10) / 10),
    protein:          Math.max(0, Math.round((input.protein ?? 0) * 10) / 10),
    carbs:            Math.max(0, Math.round((input.carbs ?? 0) * 10) / 10),
    fat:              Math.max(0, Math.round((input.fat ?? 0) * 10) / 10),
    yield_g:          input.yield_g || null,
    micros:                input.micros || null,
    micros_meta:            input.micros_meta || null,
    components:            input.components || [],
    addons:                input.addons || [],
    default_addon_ids:     input.default_addon_ids || [],
    linked_supplement_ids: input.linked_supplement_ids || [],
    source:                input.source || "manual",
    use_count:             Math.max(1, Number(input.use_count || 1)),
    last_used_at:          input.last_used_at || input.updated_at || new Date().toISOString(),
    created_at:            input.created_at || new Date().toISOString(),
    updated_at:            new Date().toISOString(),
    // Haiku+WebSearch-Verifikation gegen Herstellerangaben — null bis zum
    // ersten erfolgreichen Check (verify-one setzt das Datum, egal ob Treffer
    // oder nicht, damit nicht bei jedem erneuten Loggen erneut geprüft wird).
    verified_at:           input.verified_at || null,
  };
}

export function addOrUpdateItem(catalog, input) {
  const inputName = normalizeName(input.name);
  const existing = catalog.items.find(
    (i) => i.id === input.id || normalizeName(i.name) === inputName
  );
  const item = normalizeMeal(input, existing?.id);
  if (!item) return null;
  if (existing) {
    item.created_at = existing.created_at;
    item.verified_at = existing.verified_at || null;
  }
  if (catalog.__nutritionDir) {
    saveMeal(item, catalog.__nutritionDir, { uid: catalog.__uid, catalog });
  } else {
    saveMeal(item);
  }
  return item;
}

export function saveCatalog(catalog, nutritionDir = null, { uid = "default" } = {}) {
  const targetDir = nutritionDir || catalog?.__nutritionDir || null;
  const targetUid = uid || catalog?.__uid || "default";
  if (!targetDir) return;
  writeUserCatalog(catalog, targetDir, targetUid);
}

// Schreibt einen von Firestore gepullten Catalog-Eintrag direkt als YAML,
// ohne den saveMeal()-Push-Loop (sonst pusht jeder Pull sofort wieder
// dasselbe Item zurück nach Firestore). Nur wirklich neue (lokal unbekannte)
// Items lösen die Haiku-Verifikation aus — sonst würde jeder Pull-Zyklus
// für ältere, nie lokal verifizierte Cloud-Items erneut Haiku-Calls feuern.
export function importMealFromRemote(item, { isNew, nutritionDir = null, uid = "default", catalog = null } = {}) {
  if (nutritionDir) {
    const nextCatalog = catalog || loadCatalog(nutritionDir, { uid });
    const normalized = normalizeMeal(item, item.id);
    normalized.updated_at = item.updated_at || normalized.updated_at;
    normalized.verified_at = item.verified_at || null;
    const items = [...(nextCatalog.items || [])];
    const index = items.findIndex((existing) => existing.id === normalized.id);
    if (index >= 0) items[index] = normalized;
    else items.push(normalized);
    nextCatalog.items = sortCatalogItems(items);
    nextCatalog.deleted_ids = (nextCatalog.deleted_ids || []).filter((deletedId) => deletedId !== normalized.id);
    writeUserCatalog(nextCatalog, nutritionDir, uid, { skipPush: true });
    if (isNew && !normalized.verified_at) verifyCatalogItemAsync(normalized.id);
    if (isNew) estimateMicrosAsync(normalized.name, normalized.kcal);
    return normalized;
  }
  if (!fs.existsSync(NUTRITION_MEALS_DIR)) fs.mkdirSync(NUTRITION_MEALS_DIR, { recursive: true });
  // normalizeMeal statt Rohdaten schreiben — Firestore-Log-Einträge können
  // kcal/protein etc. als String enthalten (Cloud-seitiger Auto-Catalog-Bug),
  // normalizeMeal(...) coerct auf Number und füllt fehlende Felder konsistent.
  const normalized = normalizeMeal(item, item.id);
  normalized.updated_at = item.updated_at || normalized.updated_at;
  normalized.verified_at = item.verified_at || null;
  const p = mealPath(normalized.id, ".yaml");
  fs.writeFileSync(p, YAML.stringify(normalized, { indent: 2 }), "utf-8");

  const pJson = mealPath(normalized.id, ".json");
  if (fs.existsSync(pJson)) {
    try { fs.renameSync(pJson, `${pJson}.deleted`); } catch {}
  }
  for (const ext of [".yaml", ".yml", ".json"]) {
    const tomb = mealPath(normalized.id, `${ext}.deleted`);
    if (fs.existsSync(tomb)) { try { fs.unlinkSync(tomb); } catch {} }
  }

  if (isNew && !normalized.verified_at) {
    verifyCatalogItemAsync(normalized.id);
  }

  if (isNew) {
    estimateMicrosAsync(normalized.name, normalized.kcal);
  }
}

// Fire-and-forget: schätzt Mikros für ein frisch importiertes Catalog-Item
// per Gemini und cacht sie in SQLite (meal_micros) unter dem Item-Namen —
// SQLite bleibt die finale Instanz für Mikros, unabhängig davon ob das
// Item lokal manuell angelegt oder von Firestore gepullt wurde.
function estimateMicrosAsync(name, kcal) {
  import("./nutrition-estimate-micros.mjs").then(({ estimateMicros }) => {
    estimateMicros(name).then((micros) => {
      if (micros && Object.keys(micros).length > 0) {
        import("./nutrition-micros.mjs").then(({ saveMicrosForMeal }) => {
          saveMicrosForMeal(name, kcal || micros.kcal || 0, micros, "gemini-catalog-import");
        });
      }
    });
  });
}

// Begräbt eine ID ohne dass lokal je ein File existiert — für Duplikate,
// die beim Catalog-Pull erkannt werden (z.B. ein Cloud-seitig auto-angelegter
// "logged"-Eintrag, der unter anderer ID dasselbe Gericht wie ein bereits
// vorhandener "manual"-Eintrag beschreibt). Ein leeres Tombstone-File reicht,
// listDeletedMealIds() liest nur den Dateinamen, nicht den Inhalt — und
// pushNutritionCatalog() zieht die ID dadurch dauerhaft aus dem Merge raus.
export function tombstoneMealId(id, nutritionDir = null, { uid = "default", catalog = null } = {}) {
  if (nutritionDir) {
    const nextCatalog = catalog || loadCatalog(nutritionDir, { uid });
    nextCatalog.items = (nextCatalog.items || []).filter((item) => item.id !== id);
    nextCatalog.deleted_ids = Array.from(new Set([...(nextCatalog.deleted_ids || []), id]));
    writeUserCatalog(nextCatalog, nutritionDir, uid, { skipPush: true });
    return;
  }
  if (!fs.existsSync(NUTRITION_MEALS_DIR)) fs.mkdirSync(NUTRITION_MEALS_DIR, { recursive: true });
  const tomb = mealPath(id, ".yaml.deleted");
  if (!fs.existsSync(tomb)) fs.writeFileSync(tomb, "", "utf-8");
}

export function upsertLoggedMeal(catalog, mealInput) {
  const mealName = mealInput?.description || mealInput?.name;
  const inputName = normalizeName(mealName);
  if (!inputName) return null;

  const existing = catalog.items.find(
    (i) => (mealInput?.catalog_id && i.id === mealInput.catalog_id) || normalizeName(i.name) === inputName
  );
  const lastUsedAt = mealInput?.time || mealInput?.logged_at || new Date().toISOString();
  const next = normalizeMeal({
    ...existing,
    id: existing?.id || mealInput?.catalog_id,
    kind: existing?.kind || mealInput?.kind || "meal",
    category: existing?.category || mealInput?.category || mealInput?.type || existing?.meal_type || "meal",
    name: mealName,
    alias: existing?.alias || null,
    meal_type: mealInput?.type || existing?.meal_type || "meal",
    description: mealInput?.description || mealInput?.name || existing?.description || "",
    notes: mealInput?.notes ?? existing?.notes ?? "",
    kcal: mealInput?.kcal ?? mealInput?.calories ?? existing?.kcal ?? 0,
    protein: mealInput?.protein ?? existing?.protein ?? 0,
    carbs: mealInput?.carbs ?? existing?.carbs ?? 0,
    fat: mealInput?.fat ?? existing?.fat ?? 0,
    yield_g: existing?.yield_g || mealInput?.grams || null,
    micros: existing?.micros || mealInput?.micros || null,
    micros_meta: existing?.micros_meta || mealInput?.micros_meta || null,
    components: existing?.components || mealInput?.components || [],
    addons: existing?.addons || [],
    default_addon_ids: existing?.default_addon_ids || [],
    linked_supplement_ids: existing?.linked_supplement_ids || [],
    source: existing?.source || mealInput?.source || "logged",
    use_count: (existing?.use_count || 0) + 1,
    last_used_at: lastUsedAt,
    created_at: existing?.created_at,
  }, existing?.id || mealInput?.catalog_id || null);
  if (!next) return null;
  if (catalog.__nutritionDir) {
    saveMeal(next, catalog.__nutritionDir, { uid: catalog.__uid, catalog });
  } else {
    saveMeal(next);
  }
  return next;
}
