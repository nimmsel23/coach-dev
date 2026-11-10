/**
 * firestore-admin.mjs
 *
 * Firebase Admin SDK singleton for the Fuel Centre server.
 * Lazy-initialised: if no service-account file or UID is configured the
 * module is a no-op so local-only mode keeps working.
 *
 * Env vars (same as firestore-sync.mjs for consistency):
 *   FUEL_FIRESTORE_SA   – path to service-account JSON  (default: ~/.env/firebase-fitness.json)
 *   FUEL_CLOUD_UID      – Firestore document UID        (required for writes)
 *
 * Sync model:
 *   PUSH (fire-and-forget): every local write immediately pushes to Firestore.
 *   PULL (hourly):          Firestore → local, timestamp-guarded (last-write-wins).
 *                           Nutrition rows are upserted individually (no array overwrite)
 *                           to avoid the meal-loss bug documented in nutrition-db.mjs.
 *                           Pulled meals then run through nutrition-enrichment.mjs
 *                           (catalog match / macro sanity / micro lookup+estimate);
 *                           if enrichment changed anything it's pushed straight back.
 *
 * This module is transport only (push/pull to Firestore) — the enrichment
 * logic itself lives in ../services/nutrition-enrichment.mjs, kept separate
 * on purpose so this file doesn't grow into a catch-all.
 */

import fs   from "fs";
import path from "path";
import { createRequire } from "module";
import { todayISO } from "../../shared/utils/validation.mjs";
import logger from "./logger.mjs";
import { GLOBAL_DATA_DIR } from "../config/paths.mjs";
import { getAllClientUids } from "./client-manager.mjs";

const require = createRequire(import.meta.url);

const SA_PATH = process.env.FUEL_FIRESTORE_SA
  ? path.resolve(process.env.FUEL_FIRESTORE_SA)
  : path.join(process.env.HOME, ".env", "firebase-fitness.json");

const UID = process.env.FUEL_CLOUD_UID || null;
const UID_LIST = String(process.env.FUEL_CLOUD_UIDS || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

// How many days back the hourly pull looks (today + N-1 previous days).
const PULL_DAYS = Math.max(1, Math.min(Number(process.env.FUEL_FIRESTORE_PULL_DAYS || 90), 365));
const PULL_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

/** @type {import("firebase-admin/firestore").Firestore | null} */
let _db = null;
let _initAttempted = false;

// Real status, read by GET /dev/health — no more guessing from a dead
// Bridge ping endpoint (the old /api/fuel-firestore/status never existed
// as a fuel-dev route, it pinged AlphaOS Bridge on :9080 which has nothing
// to do with this sync).
const _status = {
  lastPushAt: null,
  lastPushError: null,
  lastPullAt: null,
  lastPullError: null,
  pushCount: 0,
  catalogPushCount: 0,
  runtimePushCount: 0,
  pullCount: 0,
  activeUids: [],
  listenerCount: 0,
};

export function getSyncStatus() {
  const activeUids = discoverSyncUids();
  return {
    configured: activeUids.length > 0,
    uid: UID,
    uids: activeUids,
    saPath: SA_PATH,
    saExists: fs.existsSync(SA_PATH),
    connected: Boolean(getDb()),
    pullDays: PULL_DAYS,
    pullIntervalMs: PULL_INTERVAL_MS,
    ..._status,
  };
}

function getDb() {
  if (_initAttempted) return _db;
  _initAttempted = true;

  const activeUids = discoverSyncUids();
  if (activeUids.length === 0) {
    logger.info("[firestore-admin] no sync uids discovered – Firestore sync disabled.");
    return null;
  }
  if (!fs.existsSync(SA_PATH)) {
    logger.warn(`[firestore-admin] Service-account not found at ${SA_PATH} – Firestore sync disabled.`);
    return null;
  }

  try {
    const admin = require("firebase-admin");
    if (!admin.apps.length) {
      const sa = JSON.parse(fs.readFileSync(SA_PATH, "utf-8"));
      admin.initializeApp({ credential: admin.credential.cert(sa) });
    }
    _db = admin.firestore();
    logger.info(`[firestore-admin] ✅ Firestore Admin ready (uids=${activeUids.join(",")})`);
  } catch (e) {
    logger.warn("[firestore-admin] Init failed:", e.message);
    _db = null;
  }
  return _db;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function recentDates(n) {
  const dates = [];
  const base = new Date(`${todayISO()}T12:00:00`);
  for (let i = 0; i < n; i++) {
    const d = new Date(base);
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

function markPushOk(kind = "runtime") {
  _status.lastPushAt = new Date().toISOString();
  _status.lastPushError = null;
  _status.pushCount += 1;
  if (kind === "catalog") _status.catalogPushCount += 1;
  else _status.runtimePushCount += 1;
}

function markPushError(message) {
  _status.lastPushError = message;
}

function userNutritionDir(uid = UID) {
  if (!uid || uid === "default") return null;
  return path.join(GLOBAL_DATA_DIR, "users", uid, "nutrition");
}

// Cross-User-Schutz: ein Firestore-Dokument unter nutrition/<X>/… gehört
// ausschliesslich <X>. Trägt es ein owner_uid, das nicht zum erwarteten uid
// passt, ist es fremd hereingesynct — nicht verarbeiten (sonst landen fremde
// Logs im lokalen Store und werden beim nächsten Push zurückgeschrieben).
// Fehlendes owner_uid = Alt-Dokument vor diesem Feld → toleriert.
function ownerOk(data, uid, label) {
  if (data && data.owner_uid && data.owner_uid !== uid) {
    logger.error(
      `[firestore-admin] OWNER MISMATCH ${label} owner_uid=${data.owner_uid} ` +
      `expected=${uid} — übersprungen (cross-user guard)`
    );
    return false;
  }
  return true;
}

function userSupplementsDir(uid = UID) {
  if (!uid || uid === "default") return null;
  return path.join(GLOBAL_DATA_DIR, "users", uid, "supplements");
}

function userSupplementsLogDir(uid = UID) {
  const supplementsDir = userSupplementsDir(uid);
  return supplementsDir ? path.join(supplementsDir, "logs") : null;
}

function localUserUids() {
  const usersDir = path.join(GLOBAL_DATA_DIR, "users");
  if (!fs.existsSync(usersDir)) return [];
  return fs.readdirSync(usersDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== "default")
    .map((entry) => entry.name);
}

function discoverSyncUids() {
  const uids = new Set();
  if (UID && UID !== "default") uids.add(UID);
  for (const uid of UID_LIST) {
    if (uid && uid !== "default") uids.add(uid);
  }
  for (const uid of getAllClientUids()) {
    if (uid && uid !== "default") uids.add(uid);
  }
  for (const uid of localUserUids()) {
    if (uid && uid !== "default") uids.add(uid);
  }
  const result = Array.from(uids).sort();
  _status.activeUids = result;
  return result;
}

// ── PUSH ─────────────────────────────────────────────────────────────────────

/**
 * Push the nutrition meal catalog to Firestore — MERGED, not overwritten.
 *
 * Vorher (bis 2026-07-31): merge:false Full-Overwrite mit dem lokalen
 * Dateistand. Das hat Katalog-Löschungen, die während lokaler Downtime über
 * die Cloud-UI gemacht wurden, beim nächsten lokalen Push kommentarlos
 * rückgängig gemacht (lokal war ja "nicht informiert" über die
 * Cloud-Löschung) — siehe git log für den konkreten Vorfall
 * (meal_ashwagandha/kasekrainer/nussschnecke kamen wiederholt zurück).
 *
 * Jetzt: 3-Wege-Merge pro ID —
 *   1. Remote-Katalog laden.
 *   2. Lokale Items reinmergen, aber nur wenn sie neuer sind (updated_at)
 *      oder remote die ID noch gar nicht kennt — Cloud-Items, die lokal
 *      unbekannt sind (z.B. während Downtime hinzugefügt), bleiben erhalten.
 *   3. Lokal tombstoned IDs werden explizit aus dem Ergebnis entfernt —
 *      eine lokale Löschung gewinnt IMMER, unabhängig vom Remote-Stand.
 */
export async function pushNutritionCatalog(items, options = {}) {
  const db = getDb();
  if (!db) return;
  try {
    const uid = options.uid || UID;
    const deletedIds = Array.isArray(options.deletedIds) ? options.deletedIds : null;
    const sourcePath = options.sourcePath || "repo:catalogs/nutrition/meals";
    if (!uid || uid === "default") {
      logger.info(
        `[firestore-admin] scope=catalog direction=push uid=default ` +
        `target=nutrition path=${sourcePath} result=skip reason=local_only`
      );
      return;
    }
    const { listDeletedMealIds } = await import("../services/nutrition-catalog.mjs");
    const ref = db.collection("nutrition").doc(uid).collection("meta").doc("catalog");

    const snap = await ref.get();
    const remoteItems = snap.exists ? (snap.data().items || []) : [];

    const merged = new Map(remoteItems.map((it) => [it.id, it]));
    for (const local of items) {
      const remote = merged.get(local.id);
      const localNewer = !remote || !remote.updated_at || !local.updated_at
        || new Date(local.updated_at) >= new Date(remote.updated_at);
      if (localNewer) merged.set(local.id, local);
    }
    for (const deletedId of (deletedIds || listDeletedMealIds())) merged.delete(deletedId);

    const mergedItems = Array.from(merged.values());
    await ref.set({ items: mergedItems, updated_at: new Date().toISOString() }, { merge: false });
    logger.info(
      `[firestore-admin] scope=catalog direction=push uid=${uid} ` +
      `target=nutrition path=firestore:nutrition/${uid}/meta/catalog result=ok count=${mergedItems.length}`
    );
    markPushOk("catalog");
  } catch (e) {
    logger.error("[firestore-admin] pushNutritionCatalog failed:", e.message);
    markPushError(e.message);
  }
}

/**
 * Push the full supplements catalog to Firestore.
 * Called fire-and-forget after every supplement catalog mutation.
 */
export async function pushSupplementsCatalog(items, options = {}) {
  const db = getDb();
  if (!db) return;
  try {
    const uid = options.uid || UID;
    const sourcePath = options.sourcePath || "repo:catalogs/supplements/catalog.yaml";
    if (!uid || uid === "default") {
      logger.info(
        `[firestore-admin] scope=catalog direction=push uid=default ` +
        `target=supplements path=${sourcePath} result=skip reason=local_only`
      );
      return;
    }
    await db.collection("supplements").doc(uid).collection("meta").doc("catalog")
      .set({ items, updated_at: new Date().toISOString() }, { merge: false });
    logger.info(
      `[firestore-admin] scope=catalog direction=push uid=${uid} ` +
      `target=supplements path=firestore:supplements/${uid}/meta/catalog result=ok count=${items.length}`
    );
    markPushOk("catalog");
  } catch (e) {
    logger.error("[firestore-admin] pushSupplementsCatalog failed:", e.message);
    markPushError(e.message);
  }
}

/**
 * Push a single day's nutrition log to Firestore.
 * Called fire-and-forget after every meal upsert / delete.
 *
 * @param {string}   date    – YYYY-MM-DD
 * @param {object[]} meals   – from getMealsForDate()
 * @param {number}   waterMl – from getWater()
 */
export async function pushNutritionLog(date, meals, waterMl, options = {}) {
  const db = getDb();
  if (!db) return;
  try {
    const uid = options.uid || UID;
    if (!uid || uid === "default") {
      logger.info(
        `[firestore-admin] scope=runtime direction=push uid=default ` +
        `target=nutrition/logs/${date} result=skip reason=local_only`
      );
      return;
    }
    const { getNutritionDeletedIds } = await import("../services/nutrition-db.mjs");
    const now = new Date().toISOString();

    // Tombstones aus dem korrekten (ggf. per-uid) Verzeichnis lesen — ohne
    // options landete das bei NUTRITION_DIR, sodass Löschungen nie nach
    // Firestore kamen.
    const localDeleted = getNutritionDeletedIds(date, options);

    // Bestehende Remote-Tombstones mit-übernehmen: der Push ist ein
    // Full-Overwrite (merge:false), würde eine cloud-seitige Löschung sonst
    // wieder plattmachen. Union bilden und die meals dagegen filtern, damit
    // ein Push nie eine getilgte Mahlzeit wiederbelebt.
    let remoteDeleted = [];
    try {
      const snap = await db.collection("nutrition").doc(uid).collection("logs").doc(date).get();
      if (snap.exists) {
        const rd = snap.data().deleted_meal_ids;
        if (Array.isArray(rd)) remoteDeleted = rd;
      }
    } catch { /* Remote-Read best effort */ }

    const deleted_meal_ids = Array.from(new Set([...localDeleted, ...remoteDeleted].filter(Boolean)));
    const cleanMeals = (meals || []).filter((m) => !deleted_meal_ids.includes(m?.id));

    await db.collection("nutrition").doc(uid).collection("logs").doc(date)
      .set({ meals: cleanMeals, water_ml: waterMl, deleted_meal_ids, owner_uid: uid, updated_at: now }, { merge: false });
    logger.info(
      `[firestore-admin] scope=runtime direction=push uid=${uid} ` +
      `target=nutrition/logs/${date} result=ok count=${cleanMeals.length} tombstones=${deleted_meal_ids.length}`
    );
    markPushOk("runtime");
  } catch (e) {
    logger.error("[firestore-admin] pushNutritionLog failed:", e.message);
    markPushError(e.message);
  }
}

export async function pushNutritionJournal(date, content, options = {}) {
  const db = getDb();
  if (!db) return;
  try {
    const uid = options.uid || UID;
    if (!uid || uid === "default") {
      logger.info(
        `[firestore-admin] scope=runtime direction=push uid=default ` +
        `target=nutrition/journal/${date} result=skip reason=local_only`
      );
      return;
    }
    const now = new Date().toISOString();
    await db.collection("nutrition").doc(uid).collection("journal").doc(date)
      .set({ date, content, owner_uid: uid, updated_at: now }, { merge: true });
    logger.info(
      `[firestore-admin] scope=runtime direction=push uid=${uid} ` +
      `target=nutrition/journal/${date} result=ok`
    );
    markPushOk("runtime");
  } catch (e) {
    logger.error("[firestore-admin] pushNutritionJournal failed:", e.message);
    markPushError(e.message);
  }
}

/**
 * Push a single day's supplement log to Firestore.
 * Called fire-and-forget after every intake mutation.
 *
 * @param {string} date – YYYY-MM-DD
 * @param {object} log  – { date, intakes: [...] }
 */
export async function pushSupplementLog(date, log, options = {}) {
  const db = getDb();
  if (!db) return;
  try {
    const uid = options.uid || UID;
    if (!uid || uid === "default") {
      logger.info(
        `[firestore-admin] scope=runtime direction=push uid=default ` +
        `target=supplements/logs/${date} result=skip reason=local_only`
      );
      return;
    }
    const now = new Date().toISOString();
    await db.collection("supplements").doc(uid).collection("logs").doc(date)
      .set({ ...log, owner_uid: uid, updated_at: now }, { merge: false });
    logger.info(
      `[firestore-admin] scope=runtime direction=push uid=${uid} ` +
      `target=supplements/logs/${date} result=ok count=${log.intakes?.length ?? 0}`
    );
    markPushOk("runtime");
  } catch (e) {
    logger.error("[firestore-admin] pushSupplementLog failed:", e.message);
    markPushError(e.message);
  }
}

// ── PULL ─────────────────────────────────────────────────────────────────────

/**
 * Pull recent nutrition + supplement logs from Firestore.
 * Last-write-wins via updated_at timestamp comparison.
 * Nutrition meals are upserted row-by-row (never array-overwrite) to
 * avoid the data-loss bug that motivated the SQLite migration.
 *
 * Services resolve their own file paths internally (config/paths.mjs), so
 * this function needs no path arguments.
 */
/**
 * Pull the Firestore meal catalog into the local catalogs/nutrition/meals/
 * YAML files. Push-only until now (see pushNutritionCatalog) — meant a
 * catalog entry added via the Cloud/GUI while the local server was running
 * never showed up locally (e.g. the "Ziegenkäse" case, 2026-08-25).
 *
 * One-directional merge, remote → local:
 *   - remote items missing locally, or newer than the local copy, are written
 *   - local tombstones always win (a local deletion is never resurrected)
 *   - only genuinely new items (unknown locally before this pull) trigger the
 *     Haiku catalog-verify pass, so re-pulling an already-known item never
 *     re-fires it
 *   - a remote item whose *name* already matches a different local id is a
 *     duplicate (e.g. Cloud auto-creates a "logged" catalog entry on save,
 *     which can collide with a manually-added entry for the same meal) — the
 *     duplicate id is graveyarded (tombstoned) instead of written as a second
 *     local file
 *   - anything normalizeMeal() changed on import (type coercion, dedup) is
 *     out of sync with Firestore's raw copy, so the corrected local catalog
 *     is pushed straight back — same push-after-enrichment pattern already
 *     used for logs in doPullRecentLogs()
 */
export async function pullNutritionCatalog(db, uid = UID) {
  const { loadCatalog, listDeletedMealIds, importMealFromRemote, tombstoneMealId } = await import("../services/nutrition-catalog.mjs");
  const nutritionDir = userNutritionDir(uid);
  if (!uid || !nutritionDir) return;

  const ref = db.collection("nutrition").doc(uid).collection("meta").doc("catalog");
  const snap = await ref.get();
  if (!snap.exists) return;

  const normalizeName = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");

  const remoteItems = snap.data().items || [];
  const local = loadCatalog(nutritionDir, { uid });
  const localById = new Map(local.items.map((it) => [it.id, it]));
  const localByName = new Map(local.items.map((it) => [normalizeName(it.name), it]));
  const deletedIds = new Set(listDeletedMealIds(nutritionDir));

  let imported = 0;
  let graveyarded = 0;
  for (const remote of remoteItems) {
    if (!remote?.id || deletedIds.has(remote.id)) continue;

    const existingById = localById.get(remote.id);
    const nameKey = normalizeName(remote.name || remote.description);
    const existingByName = existingById || localByName.get(nameKey);

    // Same dish, different id already known locally under a different id →
    // duplicate, bury the incoming id instead of writing a second file.
    if (existingByName && existingByName.id !== remote.id) {
      tombstoneMealId(remote.id, nutritionDir, { uid, catalog: local });
      deletedIds.add(remote.id);
      graveyarded += 1;
      continue;
    }

    const remoteNewer = !existingById || !existingById.updated_at || !remote.updated_at
      || new Date(remote.updated_at) > new Date(existingById.updated_at);
    if (!remoteNewer) continue;
    importMealFromRemote(remote, { isNew: !existingById, nutritionDir, uid, catalog: local });
    imported += 1;
  }

  if (imported > 0) {
    logger.info(
      `[firestore-admin] scope=catalog direction=pull uid=${uid} ` +
      `target=nutrition path=${nutritionDir || "repo:catalogs/nutrition/meals"} result=ok imported=${imported} total=${remoteItems.length}`
    );
  }
  if (graveyarded > 0) {
    logger.info(
      `[firestore-admin] scope=catalog direction=pull uid=${uid} ` +
      `target=nutrition path=${nutritionDir || "repo:catalogs/nutrition/meals"} result=graveyarded count=${graveyarded}`
    );
  }

  // Push back whatever normalizeMeal() coerced/deduped so Firestore converges
  // to the same corrected state instead of keeping the raw/duplicate data
  // forever (mirrors the log-enrichment push-back below).
  if (imported > 0 || graveyarded > 0) {
    const syncedCatalog = loadCatalog(nutritionDir, { uid });
    await pushNutritionCatalog(syncedCatalog.items, {
      uid,
      deletedIds: syncedCatalog.deleted_ids || [],
      sourcePath: nutritionDir ? path.join(nutritionDir, "catalog.json") : "repo:catalogs/nutrition/meals",
    });
  }
}

export async function pullSupplementsCatalog(db, uid = UID) {
  const { loadCatalogForUser, saveCatalogFromRemote } = await import("../services/supplements-catalog.mjs");
  const supplementsDir = userSupplementsDir(uid);
  if (!uid || !supplementsDir) return;

  const ref = db.collection("supplements").doc(uid).collection("meta").doc("catalog");
  const snap = await ref.get();
  if (!snap.exists) return;

  const remote = snap.data();
  const local = loadCatalogForUser(supplementsDir, { uid });
  const remoteItems = Array.isArray(remote.items) ? remote.items : [];
  const localAt = local.updated_at ? new Date(local.updated_at).getTime() : 0;
  const remoteAt = remote.updated_at ? new Date(remote.updated_at).getTime() : 0;

  if (remoteAt < localAt && local.items?.length) {
    logger.info(`[firestore-admin] scope=catalog direction=pull uid=${uid} target=supplements path=${path.join(supplementsDir, "catalog.json")} result=skip reason=local_newer`);
    return;
  }

  saveCatalogFromRemote({ ...local, ...remote, items: remoteItems }, supplementsDir, { uid });
  logger.info(
    `[firestore-admin] scope=catalog direction=pull uid=${uid} ` +
    `target=supplements path=${path.join(supplementsDir, "catalog.json")} result=ok count=${remoteItems.length}`
  );
}

async function doPullRecentLogs(db, uid = UID) {
  // Lazy-import services to avoid circular deps at module load time.
  const { upsertMeal, upsertWater, deleteMealsByIds, getNutritionDeletedIds }   = await import("../services/nutrition-db.mjs");
  const { loadLog, saveLogFromRemote } = await import("../services/supplements-log.mjs");
  const { enrichNutritionLog }        = await import("../services/nutrition-enrichment.mjs");
  const { writeEntry }                = await import("../services/nutrition-notes.mjs");
  const { addDeletedIntakeIds, getDeletedIntakeIds } = await import("../services/log-tombstones.mjs");
  logger.info(`[firestore-admin] scope=runtime direction=pull uid=${uid} target=all result=start`);

  try {
    await pullNutritionCatalog(db, uid);
  } catch (e) {
    logger.error(`[firestore-admin] pull nutrition/meta/catalog uid=${uid} failed:`, e.message);
  }
  try {
    await pullSupplementsCatalog(db, uid);
  } catch (e) {
    logger.error(`[firestore-admin] pull supplements/meta/catalog uid=${uid} failed:`, e.message);
  }

  const dates = recentDates(PULL_DAYS);

  for (const date of dates) {
    // ── Nutrition log ──────────────────────────────────────────────────────
    try {
      const nutSnap = await db.collection("nutrition").doc(uid).collection("logs").doc(date).get();
      if (nutSnap.exists && ownerOk(nutSnap.data(), uid, `nutrition/logs/${date}`)) {
        const remote = nutSnap.data();
        const remoteAt = remote.updated_at ? new Date(remote.updated_at).getTime() : 0;
        const remoteDeletedIds = Array.isArray(remote.deleted_meal_ids) ? remote.deleted_meal_ids : [];
        const localDeletedIds = getNutritionDeletedIds(date, { nutritionDir: userNutritionDir(uid) });
        const mergedDeletedIds = Array.from(new Set([...remoteDeletedIds, ...localDeletedIds]));

        // Enrich (catalog-match / macro-sanity / micro-lookup+estimate)
        // before writing – so the local DB already gets the filled-in data.
        const { meals: enrichedMeals, changed } = await enrichNutritionLog(
          (remote.meals || [])
            .filter((m) => !mergedDeletedIds.includes(m.id))
            .map((m) => ({ ...m, date }))
          ,
          { nutritionDir: userNutritionDir(uid), uid }
        );

        deleteMealsByIds(date, mergedDeletedIds, {
          nutritionDir: userNutritionDir(uid),
          nutritionDbPath: path.join(userNutritionDir(uid), "nutrition.db"),
          uid,
        });

        // Upsert each meal individually – no array overwrite, no data loss.
        for (const meal of enrichedMeals) {
          // Only upsert if remote meal is newer than what might be local.
          // meal.updated_at may not exist on old records; treat absence as "pull it".
          const mealRemoteAt = meal.updated_at ? new Date(meal.updated_at).getTime() : remoteAt;
          upsertMeal(meal, {
            nutritionDir: userNutritionDir(uid),
            nutritionDbPath: path.join(userNutritionDir(uid), "nutrition.db"),
            uid,
            skipPush: true,
          });
          void mealRemoteAt; // timestamp noted, upsert always wins for now (remote is authoritative)
        }

        if (remote.water_ml != null) {
          upsertWater(date, remote.water_ml, {
            nutritionDir: userNutritionDir(uid),
            nutritionDbPath: path.join(userNutritionDir(uid), "nutrition.db"),
            uid,
            skipPush: true,
          });
        }

        logger.info(
          `[firestore-admin] scope=runtime direction=pull uid=${uid} ` +
          `target=nutrition/logs/${date} result=ok count=${remote.meals?.length ?? 0}`
        );

        // Enrichment added data Firestore didn't have – push it straight back.
        if (changed) {
          await pushNutritionLog(date, enrichedMeals, remote.water_ml ?? 0, { uid });
          logger.info(`[firestore-admin] scope=runtime direction=pushback uid=${uid} target=nutrition/logs/${date} result=enriched`);
        } else if (mergedDeletedIds.length !== remoteDeletedIds.length) {
          await pushNutritionLog(date, enrichedMeals, remote.water_ml ?? 0, { uid });
          logger.info(`[firestore-admin] scope=runtime direction=pushback uid=${uid} target=nutrition/logs/${date} result=tombstones`);
        }
      }
    } catch (e) {
      logger.error(`[firestore-admin] pull nutrition/logs/${date} uid=${uid} failed:`, e.message);
    }

    // ── Supplement log ─────────────────────────────────────────────────────
    try {
      const suppSnap = await db.collection("supplements").doc(uid).collection("logs").doc(date).get();
      if (suppSnap.exists && ownerOk(suppSnap.data(), uid, `supplements/logs/${date}`)) {
        const remote = suppSnap.data();
        const supplementsLogDir = userSupplementsLogDir(uid);
        const local  = loadLog(date, supplementsLogDir || undefined);
        const remoteDeletedIds = Array.isArray(remote.deleted_intake_ids) ? remote.deleted_intake_ids : [];
        const localDeletedIds = getDeletedIntakeIds(date, supplementsLogDir || undefined);
        const mergedDeletedIds = Array.from(new Set([...remoteDeletedIds, ...localDeletedIds]));

        const remoteAt = remote.updated_at ? new Date(remote.updated_at).getTime() : 0;
        const localAt  = local.updated_at  ? new Date(local.updated_at).getTime()  : 0;

        if (remoteAt >= localAt) {
          addDeletedIntakeIds(date, remoteDeletedIds, supplementsLogDir || undefined);
          const remoteIntakes = (remote.intakes || []).filter((i) => !mergedDeletedIds.includes(i.id));
          const remoteIds = new Set(remoteIntakes.map(i => i.id));
          const localOnly = (local.intakes || []).filter(i => !remoteIds.has(i.id) && !mergedDeletedIds.includes(i.id));
          const merged = {
            ...remote,
            intakes: [...remoteIntakes, ...localOnly],
            deleted_intake_ids: mergedDeletedIds,
          };
          saveLogFromRemote(merged, supplementsLogDir || undefined);
          logger.info(
            `[firestore-admin] scope=runtime direction=pull uid=${uid} ` +
            `target=supplements/logs/${date} result=ok count=${merged.intakes.length}`
          );
        } else {
          logger.info(
            `[firestore-admin] scope=runtime direction=pull uid=${uid} ` +
            `target=supplements/logs/${date} result=skip reason=local_newer`
          );
        }
      }
    } catch (e) {
      logger.error(`[firestore-admin] pull supplements/logs/${date} uid=${uid} failed:`, e.message);
    }

    try {
      const journalSnap = await db.collection("nutrition").doc(uid).collection("journal").doc(date).get();
      if (journalSnap.exists && ownerOk(journalSnap.data(), uid, `nutrition/journal/${date}`)) {
        const remote = journalSnap.data();
        writeEntry(date, remote.content || "", path.join(GLOBAL_DATA_DIR, "users", uid, "nutrition_journal"));
      }
    } catch (e) {
      logger.error(`[firestore-admin] pull nutrition/journal/${date} uid=${uid} failed:`, e.message);
    }
  }
}

// ── Scheduler ─────────────────────────────────────────────────────────────────

/**
 * Manually trigger a pull outside the hourly schedule — used by the
 * POST /dev/sync/pull button in the Dev/Prod tab.
 */
export async function pullNow(options = {}) {
  return pullRecentLogs(options.uids);
}

/**
 * Start the hourly Firestore pull scheduler.
 * Also fires once immediately on startup (after a short delay to let the
 * server finish booting).
 */
export function startFirestorePullScheduler() {
  if (!getDb()) return; // no-op in local-only mode
  const uids = discoverSyncUids();
  if (uids.length === 0) {
    logger.info("[firestore-admin] no sync uids discovered – scheduler remains idle");
    return;
  }

  // Initial pull after 5 s so the server is fully up first.
  setTimeout(() => {
    startCatalogRealtimeSync();
    return pullRecentLogs().catch(e =>
    logger.error("[firestore-admin] startup pull failed:", e.message)
    );
  }, 5_000);

  // Hourly pull — fallback net for logs/journal/supplements, which have no
  // realtime listener (too many docs to watch cheaply).
  setInterval(() => {
    startCatalogRealtimeSync();
    return pullRecentLogs().catch(e =>
      logger.error("[firestore-admin] hourly pull failed:", e.message)
    );
  }, PULL_INTERVAL_MS);

  logger.info(
    `[firestore-admin] 🔄 Hourly pull scheduler started ` +
    `(every ${PULL_INTERVAL_MS / 60000} min, last ${PULL_DAYS} days, uids=${uids.join(",")})`
  );

  startCatalogRealtimeSync();
}

/**
 * Realtime catalog sync — the meal catalog is a single doc, so unlike logs
 * it's cheap to watch with onSnapshot instead of waiting up to an hour.
 * A Cloud/mobile edit now reaches the local catalog within seconds instead
 * of on the next hourly cycle (the original "catalog blieb stale" bug).
 * Skips the snapshot that fires immediately on subscribe (that's just the
 * current state, already covered by the startup pull above) and any pull
 * triggered by our own write-back inside pullNutritionCatalog().
 */
const _listenerState = new Map();

async function pullRecentLogs(uids = null) {
  const db = getDb();
  if (!db) return;

  const targetUids = (uids && uids.length ? uids : discoverSyncUids()).filter(Boolean);
  if (targetUids.length === 0) {
    logger.info("[firestore-admin] pull skipped – no sync uids discovered");
    return;
  }

  const startedAt = new Date();
  logger.info(
    `[firestore-admin] 🔽 pull cycle #${_status.pullCount + 1} started ` +
    `(last ${PULL_DAYS} days, uids=${targetUids.join(",")})`
  );
  try {
    for (const uid of targetUids) {
      await doPullRecentLogs(db, uid);
    }
    _status.lastPullAt = new Date().toISOString();
    _status.lastPullError = null;
    _status.pullCount += 1;
    logger.info(`[firestore-admin] ✅ pull cycle #${_status.pullCount} done in ${Date.now() - startedAt.getTime()}ms`);
  } catch (e) {
    _status.lastPullError = e.message;
    logger.error(`[firestore-admin] ❌ pull cycle failed: ${e.message}`);
    throw e;
  }
}

function ensureCatalogListener(db, uid, target, pullFn) {
  const key = `${target}:${uid}`;
  if (_listenerState.has(key)) return;
  const ref = db.collection(target).doc(uid).collection("meta").doc("catalog");

  let sawInitial = false;
  let pulling = false;

  const unsubscribe = ref.onSnapshot(
    (snap) => {
      if (!sawInitial) {
        sawInitial = true;
        return;
      }
      if (snap.metadata?.hasPendingWrites) return;
      if (pulling) return;

      pulling = true;
      logger.info(`[firestore-admin] 🔔 remote ${target} catalog change detected uid=${uid} — pulling`);
      pullFn(db, uid)
        .catch((e) => logger.error(`[firestore-admin] realtime ${target} catalog pull uid=${uid} failed:`, e.message))
        .finally(() => { pulling = false; });
    },
    (e) => logger.error(`[firestore-admin] ${target} catalog onSnapshot uid=${uid} error:`, e.message)
  );

  _listenerState.set(key, unsubscribe);
  _status.listenerCount = _listenerState.size;
}

function startCatalogRealtimeSync() {
  const db = getDb();
  const uids = discoverSyncUids();
  for (const uid of uids) {
    ensureCatalogListener(db, uid, "nutrition", pullNutritionCatalog);
    ensureCatalogListener(db, uid, "supplements", pullSupplementsCatalog);
  }
  logger.info(`[firestore-admin] 🔔 Realtime catalog listeners attached count=${_listenerState.size}`);
}

export { getDb, UID };
