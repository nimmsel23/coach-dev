/**
 * firestore/kb.js — Exercise Knowledge Base CRUD for Firestore.
 * Favourites are localStorage-backed and mode-agnostic (→ shared/favourites.js).
 */

import {
  collection,
  doc,
  serverTimestamp,
} from "firebase/firestore";
import { setDoc, getDoc, getDocs } from "./offline.js";

import { db } from "../../../firebase.js";
import { getStaticMuscle, getStaticMuscleDocs } from "../../kb/muscles.js";
import { normalizeExerciseRecord } from "../shared/exercise.js";
import { withoutNonExercises } from "../shared/nonExercises.js";
import { NON_EXERCISE_BLOCK } from "../shared/nonExercises.generated.js";
import {
  getMirrorExercise, isLegacyYuhonasId, mergeRanked, searchMirrors,
} from "../../exerciseDbs/search.js";
import { PUSH_EXERCISES } from "./push.generated.js";
import { PULL_EXERCISES } from "./pull.generated.js";
import { LEGS_EXERCISES } from "./legs.generated.js";
export { getFavourites, toggleFavourite } from "../shared/favourites.js";

// EXERCISE_BULK_DATA (scripts/build-exercise-bulk-data.mjs, aus
// unreviewed_wger.yml/unreviewed_yuhonas.yml) deckt den statischen,
// praktisch nie wechselnden Rohimport-Teil des Katalogs ab (~1700 Übungen).
// Diese IDs werden aus dem Firestore-Fetch rausgefiltert, damit sie nicht
// doppelt im Suchindex landen und nicht bei jeder Suche live nachgeladen
// werden müssen — nur der kleine, aktiv wachsende kuratierte/expert-Teil
// kommt noch aus Firestore. KB-YAML bleibt SSOT, siehe src/CLAUDE.md.
//
// Das Bulk-Modul (~1,8 MB) liegt nicht im Haupt-Bundle, sondern wird beim
// ersten Zugriff (Suche) per dynamic import nachgeladen und danach gecacht.
let _bulkPromise = null;
function _loadBulk() {
  if (!_bulkPromise) {
    _bulkPromise = import("./exerciseBulkData.generated.js")
      .then((m) => ({
        data: m.EXERCISE_BULK_DATA,
        ids: new Set(m.EXERCISE_BULK_DATA.map((ex) => ex.exercise_id || ex.id)),
      }))
      .catch((err) => { _bulkPromise = null; throw err; });
  }
  return _bulkPromise;
}

// ── Exercises ─────────────────────────────────────────────────────────────────

export async function getExercise(exerciseId) {
  const snap = await getDoc(doc(db, "fitness", "kb", "exercises", exerciseId));
  const found = snap.exists() ? snap.data() : null;
  // yuhonas_*-IDs: Daten aus dem Geräte-Mirror statt aus dem alten Bulk-Doc,
  // außer der Katalog hat einen kuratierten Eintrag. Ohne Mirror: Rückfall.
  if (isLegacyYuhonasId(exerciseId) && !(found && _isCurated(found))) {
    const mirrored = await getMirrorExercise(exerciseId).catch(() => null);
    if (mirrored) return mirrored;
  }
  return found;
}

export async function getAllExercises() {
  const snap = await getDocs(collection(db, "fitness", "kb", "exercises"));
  // Nicht-Übungen (Aktivitäten wie HIIT, kb/registry/non_exercises.yml) bleiben
  // draußen, solange ihr Firestore-Doc noch existiert.
  return withoutNonExercises(snap.docs.map((d) => ({ id: d.id, ...d.data() })), NON_EXERCISE_BLOCK);
}

// Wie getAllExercises(), aber ohne die Bulk-Übungen, die bereits statisch im
// Client-Bundle liegen (EXERCISE_BULK_DATA) — vermeidet, ~1700 Docs live zu
// laden, nur um sie danach wegzufiltern.
async function _getCuratedExercises() {
  const { ids } = await _loadBulk();
  const snap = await getDocs(collection(db, "fitness", "kb", "exercises"));
  return withoutNonExercises(
    snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((ex) => !ids.has(ex.exercise_id || ex.id)),
    NON_EXERCISE_BLOCK,
  );
}

export async function saveExercise(exerciseId, data) {
  const exId = exerciseId || data.exercise_id || data.id;
  if (!exId) return { ok: false, error: "missing_id" };
  await setDoc(doc(db, "fitness", "kb", "exercises", exId), {
    ...data,
    updated_at: serverTimestamp(),
  }, { merge: true });
  _searchCache = null;
  _searchCacheMirror = null;
  return { ok: true, id: exId };
}

// Client-side fuzzy search — Firestore has no full-text index.
// Load once, cache in module scope, score in browser.
let _searchCache = null;
let _searchCacheMirror = null;

const DEFAULT_SESSION_SOURCES = { wger: true, yuhonas: true, coach: true };

function _normalize(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[-_]/g, " ").replace(/\s+/g, " ").trim();
}

function _loadSessionSources() {
  try {
    const raw = JSON.parse(localStorage.getItem("fitness-sessionSources") || "{}");
    return { ...DEFAULT_SESSION_SOURCES, ...(raw || {}) };
  } catch {
    return { ...DEFAULT_SESSION_SOURCES };
  }
}

function _getExerciseSource(ex) {
  const tags = Array.isArray(ex?.tags) ? ex.tags : [];
  if (tags.includes("yuhonas") || ex?.yuhonas_id) return "yuhonas";
  if (tags.includes("wger") || tags.includes("unreviewed") || ex?.wger_id) return "wger";
  return "coach";
}

// Alte yuhonas-Bulk-Records (unreviewed_yuhonas.yml → EXERCISE_BULK_DATA) —
// im Mirror-Modus (Session/Plan) ersetzt durch den Geräte-Mirror.
function _isLegacyYuhonasBulk(ex) {
  return isLegacyYuhonasId(ex.exercise_id || ex.id) && (ex.tags || []).includes("yuhonas");
}

function _isCurated(ex) {
  return _isExpert(ex) || ex.source === "inbox";
}

async function _getSearchPool(useMirror) {
  if (!useMirror) {
    if (!_searchCache) {
      const [{ data }, curated] = await Promise.all([_loadBulk(), _getCuratedExercises()]);
      _searchCache = [...data, ...curated];
    }
    return _searchCache;
  }
  if (!_searchCacheMirror) {
    const { data } = await _loadBulk();
    const bulk = data.filter((ex) => !_isLegacyYuhonasBulk(ex));
    const bulkIds = new Set(bulk.map((ex) => ex.exercise_id || ex.id));
    const snap = await getDocs(collection(db, "fitness", "kb", "exercises"));
    const curated = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((ex) => !bulkIds.has(ex.exercise_id || ex.id))
      // Alte yuhonas_*-Bulk-Docs in Firestore fallen weg, kuratierte Drafts bleiben.
      .filter((ex) => !isLegacyYuhonasId(ex.exercise_id || ex.id) || _isCurated(ex));
    _searchCacheMirror = [...bulk, ...curated];
  }
  return _searchCacheMirror;
}

// opts.mirror = true (Session/Plan): yuhonas-Treffer kommen aus dem Geräte-Mirror
// (lib/exerciseDbs). Ohne Flag (Coach-Katalog) bleibt das bisherige Verhalten.
export async function searchExercises(query, limit = 12, opts = {}) {
  const q = String(query || "").trim();
  if (!q) return { ok: true, results: [], query: q, suggestions: [] };
  const useMirror = !!opts.mirror;
  const searchPool = await _getSearchPool(useMirror);

  const sources = _loadSessionSources();
  const superseded = _buildSupersededExternalRefs(searchPool);
  const pool = searchPool.filter((ex) => {
    if (_isSupersededExternalExercise(ex, superseded)) return false;
    const source = _getExerciseSource(ex);
    return sources[source] !== false;
  });

  const qn = _normalize(q);
  const qTokens = qn.split(" ").filter(Boolean);
  const scoredAll = pool.map((ex) => {
    if (ex.merged_into || ex.superseded_by) return { ex, score: 0 };
    const hay = [ex.display_name, ex.german, ex.english, ex.name, ex.exercise_id, ex.id, ...(ex.aliases || []), ...(ex.search_aliases || []), ...(ex.tags || [])].map(_normalize);
    let score = 0;
    if (hay.some((h) => h === qn))                                                    score = 100;
    else if (hay.some((h) => h.startsWith(qn)))                                       score = 80;
    else if (hay.some((h) => h.includes(qn)))                                         score = 60;
    else if (qTokens.length > 1 && qTokens.every((t) => hay.some((h) => h.includes(t)))) score = 50;
    else if (qTokens.some((t) => hay.some((h) => h.includes(t))))                     score = 20;
    return { ex, score };
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score);

  const toRecord = (ex) => normalizeExerciseRecord({
    ...ex,
    id: ex.exercise_id || ex.id,
    name: ex.display_name || ex.german || ex.name || ex.exercise_id || ex.id,
    source: _getExerciseSource(ex),
  });

  let results;
  let mirrorMissing = [];
  if (useMirror) {
    const { results: hits, missing } = await searchMirrors(q, { enabled: sources, skipIds: superseded.yuhonas });
    mirrorMissing = missing;
    const catalogHits = scoredAll.map(({ ex, score }) => ({ record: toRecord(ex), score }));
    results = mergeRanked([], [...catalogHits, ...hits], q, limit).map((ex) => normalizeExerciseRecord(ex));
  } else {
    results = scoredAll.slice(0, limit).map(({ ex }) => toRecord(ex));
  }
  return {
    ok: true, source: "firestore", query: q, results, mirrorMissing,
    suggestions: results.slice(0, 3).map((r) => ({ canonical_id: r.id, display_name: r.name })),
  };
}

function _isExpert(ex) {
  const tags = ex.tags || [];
  return ex.source === "expert" || tags.includes("expert");
}

function _buildSupersededExternalRefs(exercises) {
  const refs = { wger: new Set(), yuhonas: new Set() };
  for (const ex of exercises || []) {
    if (!_isExpert(ex)) continue;
    if (ex.wger_id) refs.wger.add(String(ex.wger_id));
    const external = ex.external_ids || {};
    for (const id of external.wger || []) refs.wger.add(String(id));
    for (const id of external.yuhonas || []) refs.yuhonas.add(String(id));
  }
  return refs;
}

function _isSupersededExternalExercise(ex, refs) {
  if (_isExpert(ex)) return false;
  if (ex.merged_into || ex.superseded_by) return true;
  if (ex.wger_id && refs.wger.has(String(ex.wger_id))) return true;
  if (ex.yuhonas_id && refs.yuhonas.has(String(ex.yuhonas_id))) return true;
  return false;
}

// Push/Pull/Legs-Split der expert-approved Exercises, offline verfügbar wie
// EXERCISE_BULK_DATA (scripts/build-ppl-data.mjs, aus kb/exercises/**/*.yml,
// siehe fitness/catalog/kb/AGENTS.md). Kein Firestore-Fetch nötig — Bucket
// wächst nur, wenn ein Coach eine neue Übung approved + neu gebaut wird.
export function getPushPullLegsCatalog() {
  return { push: PUSH_EXERCISES, pull: PULL_EXERCISES, legs: LEGS_EXERCISES };
}

// ── Anatomy & Muscles ─────────────────────────────────────────────────────────

export async function getAnatomy(exerciseId) {
  const snap = await getDoc(doc(db, "fitness", "kb", "anatomy", exerciseId));
  if (!snap.exists()) return null;
  return snap.data();
}

export async function saveAnatomy(exerciseId, data) {
  const exId = exerciseId || data.exercise_id || data.id;
  if (!exId) return { ok: false, error: "missing_id" };
  await setDoc(doc(db, "fitness", "kb", "anatomy", exId), {
    ...data,
    exercise_id: exId,
    updated_at: serverTimestamp(),
  }, { merge: true });
  return { ok: true, exercise_id: exId, lesson: { ...data, exercise_id: exId } };
}
export async function getAllMuscles() {
  return getStaticMuscleDocs();
}

export async function getMuscle(muscleId) {
  return getStaticMuscle(muscleId);
}

// Anatomy & Muscles CRUD weiter oben definiert.

// Inbox-Funktionen (sendToInbox, queueForEnrichment, getInbox, approveInbox,
// reenrichInbox, ...) leben jetzt in ./inbox.js — siehe index.firestore.js-Barrel.
