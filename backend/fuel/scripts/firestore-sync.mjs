/**
 * firestore-sync.mjs — Sync-Bridge für Fuel Centre
 * Synchronisiert lokale JSON-Logs (data/) mit Firebase Firestore.
 */

import admin from "firebase-admin";
import Database from "better-sqlite3";
import YAML from "yaml";
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.FUEL_ROOT ? resolve(process.env.FUEL_ROOT) : resolve(__dirname, "..", "..", "fuel-dev");
// AlphaOS-Konvention: persistente Daten gehören nach ~/.aos/fuel/, nicht ins
// Dev-Repo. War vorher ein eigener repo-lokaler data/catalogs/-Baum (Duplikat
// der ~/.aos/fuel/-Daten, teils nur per Hardlink zufällig synchron).
const DATA_DIR = process.env.AOS_FUEL_DATA_DIR
  ? resolve(process.env.AOS_FUEL_DATA_DIR)
  : join(process.env.HOME, ".aos", "fuel");
const SA_PATH = process.env.FUEL_FIRESTORE_SA
  ? resolve(process.env.FUEL_FIRESTORE_SA)
  : join(process.env.HOME, ".env", "firebase-fitness.json");

const UID_DEFAULT = "default";
const BATCH_LIMIT = 400; // Firestore hard limit: 500 ops/batch — leave headroom

// Nur die Logs dieses einen Users gehören in den flachen Default-Store
// (DATA_DIR/nutrition, DATA_DIR/supplements/logs) — das ist der Coach/Desktop
// selbst. Jede andere uid (Klienten, weitere Accounts) wird pro uid isoliert
// unter DATA_DIR/users/<uid>/… gehalten. Ohne diese Trennung schrieb pull()
// fremde Cloud-Logs in den Default-Store, wo der lokale Server sie dann als
// eigene Logs zurück in die Firestore-Collection des Coaches pushte.
// Ist FUEL_CLOUD_UID nicht gesetzt, landet ALLES unter users/<uid>/ — nie im
// Default-Store (fail-safe statt fail-open).
const PRIMARY_UID = process.env.FUEL_CLOUD_UID || null;

function nutritionDirFor(uid) {
  return uid && uid === PRIMARY_UID
    ? join(DATA_DIR, "nutrition")
    : join(DATA_DIR, "users", uid, "nutrition");
}
function supplementsLogDirFor(uid) {
  return uid && uid === PRIMARY_UID
    ? join(DATA_DIR, "supplements", "logs")
    : join(DATA_DIR, "users", uid, "supplements", "logs");
}

// ── Batched-Write Helper (mit Idempotenz via _local_mtime) ────────────────────

function createBatcher(db) {
  let batch = db.batch();
  let ops = 0;
  let total = 0;
  let skipped = 0;
  return {
    async set(ref, data, opts) {
      batch.set(ref, data, opts || {});
      ops++;
      total++;
      if (ops >= BATCH_LIMIT) {
        await batch.commit();
        batch = db.batch();
        ops = 0;
      }
    },
    skip() { skipped++; },
    async flush() {
      if (ops > 0) await batch.commit();
      return { written: total, skipped };
    }
  };
}

function simpleHash(obj) {
  const str = JSON.stringify(obj);
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h) + str.charCodeAt(i);
    h |= 0;
  }
  return h.toString(36);
}

function normalizeName(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function itemKey(item) {
  return item?.id || normalizeName(item?.name || item?.description || item?.meal_name);
}

function itemStamp(item) {
  const raw = item?.updated_at || item?.created_at || item?.last_used_at || "";
  const stamp = raw ? Date.parse(raw) : NaN;
  return Number.isFinite(stamp) ? stamp : 0;
}

function isSameItem(a, b) {
  return simpleHash(a || null) === simpleHash(b || null);
}

function sortCatalogItems(items) {
  return [...items].sort((a, b) => {
    const aRecent = a?.last_used_at || a?.updated_at || "";
    const bRecent = b?.last_used_at || b?.updated_at || "";
    if (aRecent !== bRecent) return String(bRecent).localeCompare(String(aRecent));
    return String(a?.name || a?.description || "").localeCompare(String(b?.name || b?.description || ""));
  });
}

function pickCanonicalItem(current, incoming) {
  if (!current) return incoming;
  if (!incoming) return current;
  return itemStamp(incoming) >= itemStamp(current) ? incoming : current;
}

async function shouldSkip(docRef, localMtimeMs) {
  const snap = await docRef.get();
  if (!snap.exists) return false;
  const remoteMtime = snap.data()?._local_mtime || 0;
  return remoteMtime >= localMtimeMs;
}

function readCatalogFile(filePath) {
  const raw = readFileSync(filePath, "utf8");
  return filePath.endsWith(".json") ? JSON.parse(raw) : YAML.parse(raw);
}

function writeCatalogFile(filePath, data) {
  const body = filePath.endsWith(".json")
    ? `${JSON.stringify(data, null, 2)}\n`
    : YAML.stringify(data, { indent: 2 });
  writeFileSync(filePath, body);
}

function findNutritionMealFile(id) {
  const mealsDir = join(ROOT, "catalogs", "nutrition", "meals");
  for (const ext of [".yaml", ".yml", ".json"]) {
    const filePath = join(mealsDir, `${id}${ext}`);
    if (existsSync(filePath)) return filePath;
  }
  return join(mealsDir, `${id}.yaml`);
}

function loadLocalNutritionCatalog() {
  const mealsDir = join(ROOT, "catalogs", "nutrition", "meals");
  const items = [];

  if (existsSync(mealsDir)) {
    const mealFiles = readdirSync(mealsDir).filter((f) =>
      f.endsWith(".json") || f.endsWith(".yaml") || f.endsWith(".yml")
    );
    const seenIds = new Set();

    for (const file of mealFiles) {
      const ext = basename(file).split(".").pop();
      const id = basename(file, `.${ext}`);
      if (seenIds.has(id) && ext === "json") continue;
      try {
        items.push(readCatalogFile(join(mealsDir, file)));
        seenIds.add(id);
      } catch (e) {
        console.error(`    ❌ Fehler in Meal-File ${file}:`, e.message);
      }
    }

    if (items.length > 0) {
      return { items: sortCatalogItems(dedupeCatalogItems(items)), storage: { kind: "files", path: mealsDir } };
    }
  }

  const nutritionDir = join(DATA_DIR, "nutrition");
  const legacyCatalogJson = join(nutritionDir, "catalog.json");
  const legacyCatalogYaml = join(nutritionDir, "catalog.yaml");

  for (const legacyPath of [legacyCatalogYaml, legacyCatalogJson]) {
    if (!existsSync(legacyPath)) continue;
    try {
      const data = readCatalogFile(legacyPath);
      const list = Array.isArray(data?.items) ? data.items : (Array.isArray(data) ? data : []);
      return {
        items: sortCatalogItems(dedupeCatalogItems(list)),
        storage: { kind: "legacy", path: legacyPath, wrapper: data && !Array.isArray(data) ? data : null },
      };
    } catch (e) {
      console.error(`    ❌ Fehler in legacy catalog ${basename(legacyPath)}:`, e.message);
    }
  }

  return { items: [], storage: { kind: "files", path: mealsDir } };
}

function writeLocalNutritionCatalog(items, storage) {
  const mergedItems = sortCatalogItems(dedupeCatalogItems(items));
  if (storage?.kind === "legacy" && storage.path) {
    const wrapper = storage.wrapper && !Array.isArray(storage.wrapper)
      ? { ...storage.wrapper, items: mergedItems }
      : { items: mergedItems };
    writeCatalogFile(storage.path, wrapper);
    return storage.path;
  }

  const mealsDir = storage?.path || join(ROOT, "catalogs", "nutrition", "meals");
  if (!existsSync(mealsDir)) mkdirSync(mealsDir, { recursive: true });
  for (const item of mergedItems) {
    const key = itemKey(item);
    if (!key) continue;
    writeCatalogFile(findNutritionMealFile(key), item);
  }
  return mealsDir;
}

function loadLocalSupplementsCatalog() {
  const candidates = [
    join(ROOT, "catalogs", "supplements", "catalog.yaml"),
    join(ROOT, "catalogs", "supplements", "catalog.json"),
    join(ROOT, "data", "supplements", "catalog.json"),
    join(DATA_DIR, "supplements", "catalog.yaml"),
    join(DATA_DIR, "supplements", "catalog.json"),
  ];

  for (const catalogPath of candidates) {
    if (!existsSync(catalogPath)) continue;
    const data = readCatalogFile(catalogPath);
    const items = Array.isArray(data?.items) ? data.items : (Array.isArray(data) ? data : []);
    return {
      items: sortCatalogItems(dedupeCatalogItems(items)),
      storage: { path: catalogPath, wrapper: data && !Array.isArray(data) ? data : null },
    };
  }

  return {
    items: [],
    storage: { path: join(ROOT, "catalogs", "supplements", "catalog.yaml"), wrapper: { version: 1, updated_at: new Date().toISOString(), items: [] } },
  };
}

function writeLocalSupplementsCatalog(items, storage) {
  const mergedItems = sortCatalogItems(dedupeCatalogItems(items));
  const targetPath = storage?.path || join(ROOT, "catalogs", "supplements", "catalog.yaml");
  const targetDir = dirname(targetPath);
  if (!existsSync(targetDir)) mkdirSync(targetDir, { recursive: true });
  const wrapper = storage?.wrapper && !Array.isArray(storage.wrapper)
    ? { ...storage.wrapper, items: mergedItems, updated_at: new Date().toISOString() }
    : { version: 1, updated_at: new Date().toISOString(), items: mergedItems };
  writeCatalogFile(targetPath, wrapper);
  return targetPath;
}

function dedupeCatalogItems(items) {
  const seen = new Map();
  for (const item of items || []) {
    const key = itemKey(item);
    if (!key) continue;
    seen.set(key, pickCanonicalItem(seen.get(key), item));
  }
  return Array.from(seen.values());
}

function mergeCatalogSides(localItems, remoteItems) {
  const localMap = new Map(dedupeCatalogItems(localItems).map((item) => [itemKey(item), item]));
  const remoteMap = new Map(dedupeCatalogItems(remoteItems).map((item) => [itemKey(item), item]));
  const allKeys = new Set([...localMap.keys(), ...remoteMap.keys()]);
  const merged = [];
  let localChanges = 0;
  let remoteChanges = 0;

  for (const key of allKeys) {
    const localItem = localMap.get(key);
    const remoteItem = remoteMap.get(key);
    const finalItem = pickCanonicalItem(remoteItem, localItem);
    if (!finalItem) continue;
    merged.push(finalItem);
    if (!isSameItem(localItem, finalItem)) localChanges += 1;
    if (!isSameItem(remoteItem, finalItem)) remoteChanges += 1;
  }

  return {
    items: sortCatalogItems(merged),
    localChanges,
    remoteChanges,
    totalKeys: allKeys.size,
  };
}

// ── Gemini Logic ──────────────────────────────────────────────────────────────

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash-exp";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

async function callGemini(prompt) {
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY nicht gesetzt");
  
  const response = await fetch(GEMINI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }]
    })
  });
  
  const data = await response.json();
  let text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  
  if (text.includes("```")) {
    text = text.split("```")[1];
    if (text.startsWith("json")) text = text.slice(4);
    if (text.includes("```")) text = text.split("```")[0];
  }
  
  try {
    return JSON.parse(text.trim());
  } catch (e) {
    return text.trim();
  }
}

// ── Init Firebase ──────────────────────────────────────────────────────────────

if (!existsSync(SA_PATH)) {
  console.error(`❌ Service Account nicht gefunden unter: ${SA_PATH}`);
  process.exit(1);
}

const serviceAccount = JSON.parse(readFileSync(SA_PATH, "utf8"));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// ── Sync Logic ────────────────────────────────────────────────────────────────

async function saveMealMicrosToFirestore(mealName, kcal, micros) {
  const ref = db.collection("nutrition").doc("public").collection("meta").doc("micros");
  
  await db.runTransaction(async (transaction) => {
    const docSnap = await transaction.get(ref);
    let items = [];
    if (docSnap.exists) {
      items = docSnap.data().items || [];
    }
    
    // Remove existing entry for the same meal name (case-insensitive)
    const lowerName = mealName.toLowerCase();
    items = items.filter(item => item.meal_name.toLowerCase() !== lowerName);
    
    // Add new entry
    items.push({
      meal_name: mealName,
      kcal: kcal,
      ...micros,
      updated_at: new Date().toISOString()
    });
    
    // Recalculate hash
    const newHash = simpleHash(items);
    
    transaction.set(ref, {
      items: items,
      _content_hash: newHash,
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    });
  });
}

function saveMealMicrosToLocalSqlite(mealName, kcal, micros) {
  const dbPaths = [];

  // Active user databases
  const usersDir = join(DATA_DIR, "users");
  if (existsSync(usersDir)) {
    try {
      const dirs = readdirSync(usersDir);
      for (const d of dirs) {
        const userDb = join(usersDir, d, "nutrition", "nutrition.db");
        if (existsSync(userDb)) {
          dbPaths.push(userDb);
        }
      }
    } catch (e) {
      console.error("Fehler beim Suchen von User-DBs:", e.message);
    }
  }

  // Single-user mode active db
  const singleUserDb = join(DATA_DIR, "nutrition", "nutrition.db");
  if (existsSync(singleUserDb)) dbPaths.push(singleUserDb);
  
  const MICRO_COLS = [
    "vitamin_a_ug", "vitamin_d_ug", "vitamin_e_mg", "vitamin_k_ug",
    "vitamin_c_mg", "vitamin_b1_mg", "vitamin_b2_mg", "vitamin_b3_mg",
    "vitamin_b5_mg", "vitamin_b6_mg", "vitamin_b7_ug", "folate_ug", "vitamin_b12_ug",
    "calcium_mg", "phosphorus_mg", "magnesium_mg", "iron_mg", "zinc_mg",
    "selenium_ug", "iodine_ug", "potassium_mg", "sodium_mg",
    "omega3_mg"
  ];
  
  for (const dbPath of dbPaths) {
    try {
      const dbSqlite = new Database(dbPath);
      
      // Auto-migrate schema if needed
      try {
        dbSqlite.exec("ALTER TABLE meal_micros ADD COLUMN kcal REAL");
      } catch (e) {
        // Ignoriere wenn Spalte schon existiert
      }
      
      const vals = MICRO_COLS.map((c) => micros[c] ?? 0);
      const sets = MICRO_COLS.map((c) => `${c} = excluded.${c}`).join(", ");
      
      dbSqlite.prepare(`
        INSERT INTO meal_micros (meal_name, kcal, ${MICRO_COLS.join(", ")}, source)
        VALUES (?, ?, ${MICRO_COLS.map(() => "?").join(", ")}, ?)
        ON CONFLICT(meal_name) DO UPDATE SET
          kcal = excluded.kcal, ${sets}, source = excluded.source, updated_at = CURRENT_TIMESTAMP
      `).run(mealName, kcal, ...vals, "gemini");
      
      dbSqlite.close();
      console.log(`  💾 SQLite DB aktualisiert: ${dbPath}`);
    } catch (e) {
      console.error(`  ❌ Fehler beim Schreiben in SQLite (${dbPath}):`, e.message);
    }
  }
}

async function watchTasks() {
  console.log("👀 Watcher aktiv: Warte auf Knowledge-Tasks in Firestore...");
  
  db.collection("knowledge_tasks")
    .where("status", "==", "pending")
    .onSnapshot(async (snap) => {
      for (const change of snap.docChanges()) {
        if (change.type === "added") {
          const task = change.doc.data();
          const taskId = change.doc.id;
          console.log(`✨ Neuer Task: ${task.type} (${task.id || task.description})`);
          
          try {
            await db.collection("knowledge_tasks").doc(taskId).update({ status: "processing" });
            
            let result = null;
            if (task.type === "enrich_meal") {
              const prompt = `Schätze Makros und Mikronährstoffe für: "${task.description}". Antworte NUR mit JSON: {"kcal": 0, "protein": 0, "carbs": 0, "fat": 0, "micros": {"vitamin_c_mg": 0, ...}}`;
              result = await callGemini(prompt);
              
              if (result && result.micros) {
                console.log(`  Updating Firestore catalog and local SQLite with micros for "${task.description}"...`);
                await saveMealMicrosToFirestore(task.description, result.kcal || 0, result.micros);
                saveMealMicrosToLocalSqlite(task.description, result.kcal || 0, result.micros);
              }
            } else if (task.type === "enrich_supplement") {
              const prompt = `Beschreibe die physiologische Wirkung und Dosierung von "${task.id}". Antworte NUR mit JSON: {"mechanism": "", "dosage_info": "", "physiological_impact": ""}`;
              result = await callGemini(prompt);
            }
            
            await db.collection("knowledge_tasks").doc(taskId).update({
              status: "completed",
              result: result,
              completed_at: admin.firestore.FieldValue.serverTimestamp()
            });
            console.log(`✅ Task abgeschlossen: ${taskId}`);
            
          } catch (err) {
            console.error(`❌ Task Fehler: ${taskId}`, err.message);
            await db.collection("knowledge_tasks").doc(taskId).update({ 
              status: "error", 
              error: err.message 
            });
          }
        }
      }
    }, (err) => {
      console.error("❌ Snapshot Fehler:", err);
    });
}

async function push(uid) {
  if (!uid || uid === UID_DEFAULT) {
    throw new Error(`UID required. Usage: node firestore-sync.mjs push <uid>  (no fallback to "default")`);
  }
  console.log(`🚀 Starte Push für User: ${uid}`);
  const batcher = createBatcher(db);

  // 1. Nutrition Logs — Quelle ist der uid-passende Store, nicht blind der
  // Default-Store (sonst lädt push <klient> die Coach-Logs in dessen Cloud).
  const nutritionDir = nutritionDirFor(uid);
  if (existsSync(nutritionDir)) {
    const files = readdirSync(nutritionDir).filter(f => f.match(/^\d{4}-\d{2}-\d{2}\.json$/));
    for (const file of files) {
      const date = file.replace(".json", "");
      const fullPath = join(nutritionDir, file);
      const mtime = statSync(fullPath).mtimeMs;
      const ref = db.collection("nutrition").doc(uid).collection("logs").doc(date);
      if (await shouldSkip(ref, mtime)) { batcher.skip(); continue; }
      const localData = JSON.parse(readFileSync(fullPath, "utf8"));
      if (localData.owner_uid && localData.owner_uid !== uid) {
        console.warn(`  ⚠️  skip nutrition/${date}: owner_uid=${localData.owner_uid} != ${uid} (cross-user guard)`);
        batcher.skip(); continue;
      }
      await batcher.set(ref, {
        ...localData,
        owner_uid: uid,
        _local_mtime: mtime,
        updated_at: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    }
  }

  // 2. Supplement Logs
  const suppLogsDir = supplementsLogDirFor(uid);
  if (existsSync(suppLogsDir)) {
    const files = readdirSync(suppLogsDir).filter(f => f.match(/^\d{4}-\d{2}-\d{2}\.json$/));
    for (const file of files) {
      const date = file.replace(".json", "");
      const fullPath = join(suppLogsDir, file);
      const mtime = statSync(fullPath).mtimeMs;
      const ref = db.collection("supplements").doc(uid).collection("logs").doc(date);
      if (await shouldSkip(ref, mtime)) { batcher.skip(); continue; }
      const localData = JSON.parse(readFileSync(fullPath, "utf8"));
      if (localData.owner_uid && localData.owner_uid !== uid) {
        console.warn(`  ⚠️  skip supplements/${date}: owner_uid=${localData.owner_uid} != ${uid} (cross-user guard)`);
        batcher.skip(); continue;
      }
      await batcher.set(ref, {
        ...localData,
        owner_uid: uid,
        _local_mtime: mtime,
        updated_at: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    }
  }

  // 3. Catalog (Nutrition)
  console.log(`  → Processing Nutrition Catalog...`);
  let nutritionItems = [];
  
  // A) Check individual meal files in catalogs/ (support .yaml, .yml, .json)
  const mealsDir = join(ROOT, "catalogs", "nutrition", "meals");
  if (existsSync(mealsDir)) {
    const mealFiles = readdirSync(mealsDir).filter(f => 
      f.endsWith(".json") || f.endsWith(".yaml") || f.endsWith(".yml")
    );
    
    const seenIds = new Set();
    for (const file of mealFiles) {
      const ext = basename(file).split('.').pop();
      const id = basename(file, `.${ext}`);
      
      // Prefer YAML if both exist
      if (seenIds.has(id) && ext === "json") continue;
      
      try {
        const raw = readFileSync(join(mealsDir, file), "utf8");
        const item = (ext === "json") ? JSON.parse(raw) : YAML.parse(raw);
        nutritionItems.push(item);
        seenIds.add(id);
      } catch (e) {
        console.error(`    ❌ Fehler in Meal-File ${file}:`, e.message);
      }
    }
    console.log(`    Found ${nutritionItems.length} individual meals in catalogs/`);
  }

  // B) Fallback/Legacy: central catalog.json OR catalog.yaml — nur wenn KEINE
  // Einzeldateien existieren. Beide Quellen sind unterschiedliche Momentaufnahmen
  // desselben Katalogs; addiert man sie, verdoppelt sich der Katalog bei jedem
  // Push in Firestore (der komplette meta/catalog-Doc wird überschrieben).
  if (nutritionItems.length === 0) {
    const legacyCatalogJson = join(nutritionDir, "catalog.json");
    const legacyCatalogYaml = join(nutritionDir, "catalog.yaml");

    for (const legacyPath of [legacyCatalogYaml, legacyCatalogJson]) {
      if (existsSync(legacyPath)) {
        try {
          const raw = readFileSync(legacyPath, "utf8");
          const data = (legacyPath.endsWith(".json")) ? JSON.parse(raw) : YAML.parse(raw);
          const items = data.items || data;
          if (Array.isArray(items)) {
            nutritionItems = [...nutritionItems, ...items];
            console.log(`    Added items from legacy ${basename(legacyPath)}`);
            break; // Stop if we found one
          }
        } catch (e) {
          console.error(`    ❌ Fehler in legacy catalog:`, e.message);
        }
      }
    }
  } else {
    console.log(`    Skipping legacy catalog.json/yaml — individual meal files take precedence`);
  }

  // Sicherheitsnetz: nach id bzw. normalisiertem Namen deduplizieren, bevor
  // der komplette Katalog nach Firestore geschrieben wird.
  {
    const seen = new Map();
    const normalizeName = (n) => String(n || "").trim().toLowerCase().replace(/\s+/g, " ");
    for (const item of nutritionItems) {
      const key = item.id || normalizeName(item.name);
      if (!key) continue;
      seen.set(key, item); // letzter Eintrag gewinnt
    }
    nutritionItems = Array.from(seen.values());
  }

  if (nutritionItems.length > 0) {
    // Idempotenz: hash der items prüfen (mtime hier nicht praktikabel — mehrere Source-Files)
    const ref = db.collection("nutrition").doc(uid).collection("meta").doc("catalog");
    const snap = await ref.get();
    const newHash = simpleHash(nutritionItems);
    if (snap.exists && snap.data()?._content_hash === newHash) {
      batcher.skip();
      console.log(`    ⏭️  Nutrition Catalog unverändert (hash match)`);
    } else {
      console.log(`    Pushing ${nutritionItems.length} nutrition items to Firestore`);
      await batcher.set(ref, {
        items: nutritionItems,
        _content_hash: newHash,
        updated_at: admin.firestore.FieldValue.serverTimestamp()
      });
    }
  }

  // 4. Catalog (Supplements)
  const supplementsCatalogCandidates = [
    join(ROOT, "catalogs", "supplements", "catalog.yaml"),
    join(ROOT, "catalogs", "supplements", "catalog.json"),
    join(ROOT, "data", "supplements", "catalog.json"),
    join(DATA_DIR, "supplements", "catalog.yaml"),
    join(DATA_DIR, "supplements", "catalog.json"),
  ];
  let suppData = null;
  for (const catalogPath of supplementsCatalogCandidates) {
    if (!existsSync(catalogPath)) continue;
    const raw = readFileSync(catalogPath, "utf8");
    suppData = catalogPath.endsWith(".json") ? JSON.parse(raw) : YAML.parse(raw);
    console.log(`  → Supplements Catalog (${catalogPath.endsWith(".json") ? "JSON" : "YAML"})`);
    break;
  }

  if (suppData) {
    const items = suppData.items || suppData;
    const ref = db.collection("supplements").doc(uid).collection("meta").doc("catalog");
    const snap = await ref.get();
    const newHash = simpleHash(items);
    if (snap.exists && snap.data()?._content_hash === newHash) {
      batcher.skip();
      console.log(`  ⏭️  Supplements Catalog unverändert`);
    } else {
      await batcher.set(ref, {
        items,
        _content_hash: newHash,
        updated_at: admin.firestore.FieldValue.serverTimestamp()
      });
    }
  }

  // 5. Micros Catalog (Global Shared from SQLite)
  const dbPath = join(DATA_DIR, "nutrition", "nutrition.db");
  if (existsSync(dbPath)) {
    const dbSqlite = new Database(dbPath);
    const localMicros = dbSqlite.prepare("SELECT * FROM meal_micros LIMIT 5000").all();
    dbSqlite.close();

    if (localMicros.length > 0) {
      const ref = db.collection("nutrition").doc("public").collection("meta").doc("micros");
      const snap = await ref.get();
      let remoteItems = [];
      if (snap.exists) {
        remoteItems = snap.data().items || [];
      }

      // Merge-Logik: Remote und Lokal kombinieren (Name-basiert)
      const mergedMap = new Map();

      // Zuerst Remote-Daten (Cloud) laden
      remoteItems.forEach(item => {
        if (item.meal_name) mergedMap.set(item.meal_name.toLowerCase(), item);
      });

      // Dann Lokale-Daten (SQLite) mergen
      localMicros.forEach(item => {
        if (item.meal_name) {
          const key = item.meal_name.toLowerCase();
          const existing = mergedMap.get(key);

          // Wir überschreiben nur, wenn lokal neuer ist oder noch nichts existiert
          if (!existing || (item.updated_at || "") >= (existing.updated_at || "")) {
            // Bereinigen (SQLite-interne Felder entfernen)
            const { id, created_at, ...cleanItem } = item;
            mergedMap.set(key, cleanItem);
          }
        }
      });

      const mergedMicros = Array.from(mergedMap.values());
      const newHash = simpleHash(mergedMicros);

      if (snap.exists && snap.data()?._content_hash === newHash) {
        batcher.skip();
        console.log(`  ⏭️  Micros Catalog unverändert (${mergedMicros.length} items nach Merge)`);
      } else {
        console.log(`  ✅ Pushing merged Micros Catalog (${mergedMicros.length} items) -> firebase shared`);
        await batcher.set(ref, {
          items: mergedMicros,
          _content_hash: newHash,
          updated_at: admin.firestore.FieldValue.serverTimestamp()
        });
      }
    }
  }

  const stats = await batcher.flush();
  console.log(`✅ Push abgeschlossen. ${stats.written} writes, ${stats.skipped} skipped.`);
}

async function pushRelax(uid) {
  if (!uid || uid === UID_DEFAULT) throw new Error("UID required for relax push");
  const relaxDir = resolve(ROOT, "..", "relax-dev", "data");
  if (!existsSync(relaxDir)) {
    console.log("ℹ️ relax-dev Verzeichnis nicht gefunden, überspringe.");
    return;
  }
  console.log(`🚀 Starte Relax-Push für User: ${uid}`);
  const batcher = createBatcher(db);

  const sessionsDir = join(relaxDir, "sessions");
  if (existsSync(sessionsDir)) {
    const files = readdirSync(sessionsDir).filter(f => f.match(/^\d{4}-\d{2}-\d{2}\.json$/));
    for (const file of files) {
      const date = file.replace(".json", "");
      const fullPath = join(sessionsDir, file);
      const mtime = statSync(fullPath).mtimeMs;
      const ref = db.collection("relax").doc(uid).collection("sessions").doc(date);
      if (await shouldSkip(ref, mtime)) { batcher.skip(); continue; }
      const localData = JSON.parse(readFileSync(fullPath, "utf8"));
      await batcher.set(ref, {
        ...localData,
        _local_mtime: mtime,
        updated_at: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    }
  }

  const journalDir = join(relaxDir, "journal");
  if (existsSync(journalDir)) {
    const files = readdirSync(journalDir).filter(f => f.endsWith(".md"));
    for (const file of files) {
      const date = file.replace(".md", "");
      const fullPath = join(journalDir, file);
      const mtime = statSync(fullPath).mtimeMs;
      const ref = db.collection("relax").doc(uid).collection("journal").doc(date);
      if (await shouldSkip(ref, mtime)) { batcher.skip(); continue; }
      const content = readFileSync(fullPath, "utf8");
      await batcher.set(ref, {
        date, content,
        _local_mtime: mtime,
        updated_at: admin.firestore.FieldValue.serverTimestamp()
      });
    }
  }

  const stats = await batcher.flush();
  console.log(`✅ Relax-Push abgeschlossen. ${stats.written} writes, ${stats.skipped} skipped.`);
}

async function pull(uid = UID_DEFAULT) {
  console.log(`📥 Starte Pull für User: ${uid}`);

  const nutritionDir = nutritionDirFor(uid);
  if (!existsSync(nutritionDir)) mkdirSync(nutritionDir, { recursive: true });
  console.log(`  → Ziel: ${nutritionDir}${uid === PRIMARY_UID ? " (Primär/Default-Store)" : " (isoliert users/" + uid + ")"}`);

  const nutSnap = await db.collection("nutrition").doc(uid).collection("logs").get();
  nutSnap.forEach(doc => {
    const data = doc.data();
    if (data.owner_uid && data.owner_uid !== uid) {
      console.warn(`  ⚠️  skip Nutrition ${doc.id}: owner_uid=${data.owner_uid} != ${uid} (cross-user guard)`);
      return;
    }
    delete data.updated_at;
    // Firestore speichert das Datum nur als Doc-ID, nicht als Feld im Doc —
    // ohne diese Zeile fehlt "date" im lokalen JSON und meal.py._save_log_local
    // crasht mit KeyError('date').
    data.date = doc.id;
    data.owner_uid = uid;
    writeFileSync(join(nutritionDir, `${doc.id}.json`), JSON.stringify(data, null, 2));
    console.log(`  ← Nutrition ${doc.id}`);
  });

  const suppLogsDir = supplementsLogDirFor(uid);
  if (!existsSync(suppLogsDir)) mkdirSync(suppLogsDir, { recursive: true });

  const suppSnap = await db.collection("supplements").doc(uid).collection("logs").get();
  suppSnap.forEach(doc => {
    const data = doc.data();
    if (data.owner_uid && data.owner_uid !== uid) {
      console.warn(`  ⚠️  skip Supplements ${doc.id}: owner_uid=${data.owner_uid} != ${uid} (cross-user guard)`);
      return;
    }
    delete data.updated_at;
    data.owner_uid = uid;
    writeFileSync(join(suppLogsDir, `${doc.id}.json`), JSON.stringify(data, null, 2));
    console.log(`  ← Supplements ${doc.id}`);
  });

  console.log("✅ Pull abgeschlossen.");
}

async function syncCatalogs(uid) {
  if (!uid || uid === UID_DEFAULT) {
    throw new Error("UID required for sync");
  }

  console.log(`🔄 Starte echten Catalog-Sync für User: ${uid}`);

  const localNutrition = loadLocalNutritionCatalog();
  const nutritionRef = db.collection("nutrition").doc(uid).collection("meta").doc("catalog");
  const nutritionSnap = await nutritionRef.get();
  const remoteNutrition = nutritionSnap.exists ? (nutritionSnap.data()?.items || []) : [];
  const mergedNutrition = mergeCatalogSides(localNutrition.items, remoteNutrition);
  const nutritionHash = simpleHash(mergedNutrition.items);

  if (mergedNutrition.localChanges > 0) {
    const localPath = writeLocalNutritionCatalog(mergedNutrition.items, localNutrition.storage);
    console.log(`  ↔ Nutrition lokal aktualisiert: ${localPath} (${mergedNutrition.localChanges} Änderungen)`);
  } else {
    console.log("  ⏭️  Nutrition lokal bereits aktuell");
  }

  if (!nutritionSnap.exists || nutritionSnap.data()?._content_hash !== nutritionHash || mergedNutrition.remoteChanges > 0) {
    await nutritionRef.set({
      items: mergedNutrition.items,
      _content_hash: nutritionHash,
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log(`  ↔ Nutrition remote aktualisiert (${mergedNutrition.remoteChanges} Änderungen)`);
  } else {
    console.log("  ⏭️  Nutrition remote bereits aktuell");
  }

  const localSupplements = loadLocalSupplementsCatalog();
  const supplementsRef = db.collection("supplements").doc(uid).collection("meta").doc("catalog");
  const supplementsSnap = await supplementsRef.get();
  const remoteSupplements = supplementsSnap.exists ? (supplementsSnap.data()?.items || []) : [];
  const mergedSupplements = mergeCatalogSides(localSupplements.items, remoteSupplements);
  const supplementsHash = simpleHash(mergedSupplements.items);

  if (mergedSupplements.localChanges > 0) {
    const localPath = writeLocalSupplementsCatalog(mergedSupplements.items, localSupplements.storage);
    console.log(`  ↔ Supplements lokal aktualisiert: ${localPath} (${mergedSupplements.localChanges} Änderungen)`);
  } else {
    console.log("  ⏭️  Supplements lokal bereits aktuell");
  }

  if (!supplementsSnap.exists || supplementsSnap.data()?._content_hash !== supplementsHash || mergedSupplements.remoteChanges > 0) {
    await supplementsRef.set({
      items: mergedSupplements.items,
      _content_hash: supplementsHash,
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log(`  ↔ Supplements remote aktualisiert (${mergedSupplements.remoteChanges} Änderungen)`);
  } else {
    console.log("  ⏭️  Supplements remote bereits aktuell");
  }

  console.log(
    "✅ Catalog-Sync abgeschlossen. " +
    `nutrition(local=${mergedNutrition.localChanges}, remote=${mergedNutrition.remoteChanges}) · ` +
    `supplements(local=${mergedSupplements.localChanges}, remote=${mergedSupplements.remoteChanges})`
  );
}

// ── CLI Runner ────────────────────────────────────────────────────────────────

const [,, cmd, uidArg] = process.argv;

const effectiveUid = uidArg || process.env.FUEL_FIRESTORE_UID;

if (cmd === "push") {
  if (!effectiveUid || effectiveUid === UID_DEFAULT) {
    console.error("❌ UID required. Usage: node scripts/firestore-sync.mjs push <uid>");
    console.error("   Or set FUEL_FIRESTORE_UID env var. Fallback to 'default' is disabled.");
    process.exit(2);
  }
  push(effectiveUid)
    .then(() => pushRelax(effectiveUid))
    .then(() => process.exit(0))
    .catch(e => { console.error(e); process.exit(1); });
} else if (cmd === "pull") {
  if (!effectiveUid || effectiveUid === UID_DEFAULT) {
    console.error("❌ UID required for pull.");
    process.exit(2);
  }
  pull(effectiveUid).then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
} else if (cmd === "sync") {
  if (!effectiveUid || effectiveUid === UID_DEFAULT) {
    console.error("❌ UID required for sync.");
    process.exit(2);
  }
  syncCatalogs(effectiveUid).then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
} else if (cmd === "watch") {
  watchTasks();
} else {
  console.log("Usage: node scripts/firestore-sync.mjs [push|pull|sync|watch] <uid>");
  console.log("  uid: Firebase Auth UID (required, no default fallback).");
  process.exit(1);
}
