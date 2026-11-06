import { api } from "./core";
import { normalizeExerciseRecord } from "../shared/exercise.js";
import { getStaticMuscle, getStaticMuscleDocs } from "../../kb/muscles.js";
import {
  dropLegacyYuhonas, getMirrorExercise, isLegacyYuhonasId, mergeRanked, searchMirrors,
} from "../../exerciseDbs/search.js";

const DEFAULT_SESSION_SOURCES = { wger: true, yuhonas: true, coach: true };

function loadSessionSources() {
  try {
    const raw = JSON.parse(localStorage.getItem('fitness-sessionSources') || '{}');
    return { ...DEFAULT_SESSION_SOURCES, ...(raw || {}) };
  } catch {
    return { ...DEFAULT_SESSION_SOURCES };
  }
}

export async function getExercise(exerciseId) {
  let found = null;
  try {
    const data = await api.get("/fitness/exercises/all");
    found = (data?.exercises || []).find((ex) => String(ex.exercise_id || ex.id) === String(exerciseId)) || null;
  } catch {
    found = null;
  }
  // yuhonas_*-IDs: kuratierte Katalog-Einträge (Expert/Inbox) behalten Vorrang,
  // sonst kommen die Daten aus dem Geräte-Mirror statt aus dem alten
  // Bulk-Record (unreviewed_yuhonas.yml). Ohne geladenen Mirror bleibt der
  // Katalog-Record als Rückfall, damit alte Session-Einträge lesbar bleiben.
  if (isLegacyYuhonasId(exerciseId) && !(found && (found.source === "expert" || found.source === "inbox"))) {
    const mirrored = await getMirrorExercise(exerciseId).catch(() => null);
    if (mirrored) return mirrored;
  }
  return found;
}

export async function getAllExercises() {
  try {
    const data = await api.get("/fitness/exercises/all");
    return data?.exercises || [];
  } catch {
    return [];
  }
}

export async function saveExercise(exerciseId, data) {
  const exId = exerciseId || data.exercise_id || data.id;
  _curatedCache = null;
  try {
    return await api.post(`/fitness/exercises/${exId}`, data);
  } catch {
    return { ok: false };
  }
}

// Kuratierte Katalog-Einträge (Expert/Inbox): IDs, die trotz `yuhonas_*`-Präfix
// echte Coach-Drafts sind, und die yuhonas-Roh-IDs, die der Katalog schon abdeckt.
let _curatedCache = null;
async function getCuratedCatalog() {
  if (!_curatedCache) {
    _curatedCache = getAllExercises().then((all) => {
      const curated = all.filter((r) => r.source === "expert" || r.source === "inbox");
      return {
        ids: new Set(curated.map((r) => r.exercise_id)),
        rawYuhonas: new Set(
          curated.flatMap((r) => [r.yuhonas_id, ...(r.external_ids?.yuhonas || [])]).filter(Boolean).map(String),
        ),
      };
    }).catch(() => {
      _curatedCache = null;
      return { ids: new Set(), rawYuhonas: new Set() };
    });
  }
  return _curatedCache;
}

// opts.mirror = true (Session/Plan): yuhonas-Treffer kommen aus dem Geräte-Mirror
// (lib/exerciseDbs), die alten yuhonas_*-Bulk-Records des Katalogs werden
// ausgefiltert. Ohne Flag (Coach-Katalog) bleibt das bisherige Verhalten.
export async function searchExercises(query, limit = 12, opts = {}) {
  const q = String(query || "").trim();
  if (!q) return { ok: true, results: [], query: q, suggestions: [] };
  try {
    const sources = loadSessionSources();
    const active = Object.entries(sources).filter(([, v]) => v).map(([k]) => k).join(',') || 'wger';
    const fetchLimit = opts.mirror ? Math.min(limit * 3, 50) : limit;
    const data = await api.get(`/fitness/search?q=${encodeURIComponent(q)}&limit=${fetchLimit}&sources=${active}`);
    if (!opts.mirror) {
      if (!data) return { ok: false, results: [], query: q };
      return {
        ...data,
        results: Array.isArray(data.results) ? data.results.map((ex) => normalizeExerciseRecord(ex)) : [],
      };
    }
    const curated = await getCuratedCatalog();
    const rows = dropLegacyYuhonas(Array.isArray(data?.results) ? data.results : [], curated.ids);
    const { results: hits, missing } = await searchMirrors(q, { enabled: sources, skipIds: curated.rawYuhonas });
    const results = mergeRanked(rows, hits, q, limit).map((ex) => normalizeExerciseRecord(ex));
    return {
      ok: !!data || hits.length > 0,
      query: q,
      results,
      mirrorMissing: missing,
      suggestions: results.slice(0, 3).map((r) => ({ canonical_id: r.id, display_name: r.name })),
    };
  } catch {
    return { ok: false, results: [], query: q };
  }
}

export async function getAnatomy(exerciseId) {
  try {
    const data = await api.get(`/exercise/${encodeURIComponent(exerciseId)}/teaching`);
    return data?.lesson || null;
  } catch {
    return null;
  }
}

export async function saveAnatomy(exerciseId, data) {
  const exId = exerciseId || data.exercise_id || data.id;
  try {
    const result = await api.post(`/exercise/${encodeURIComponent(exId)}/teaching`, {
      ...data,
      exercise_id: exId,
    });
    return result || { ok: false };
  } catch {
    return { ok: false };
  }
}
export async function getAllMuscles() {
  return getStaticMuscleDocs();
}

export async function getMuscle(muscleId) {
  return getStaticMuscle(muscleId);
}

// Local KB Functions

export async function getConfig() {
  try {
    return await api.get("/fitness/config");
  } catch {
    return null;
  }
}

export { getFavourites, toggleFavourite } from "../shared/favourites.js";
export { parseQuick } from "../shared/parse.js";

// Inbox-Funktionen (getInbox, approveInbox, reenrichInbox, sendToInbox,
// queueForEnrichment, ...) leben jetzt in ./inbox.js — siehe index.js-Barrel.
// Coach-Feed-Funktionen (getGlobalJournalFeed, getAllUserProfiles,
// saveCoachFeedback) leben jetzt in ./coach.js.
