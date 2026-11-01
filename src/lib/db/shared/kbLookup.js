/**
 * shared/kbLookup.js — Übung → KB-Eintrag, für den Muskel-Fallback der Coverage.
 *
 * Eine Session-Übung ohne eigene primaryMuscles/secondaryMuscles/stabilizers
 * holt ihre Muskeln aus dem Katalog. Bis zu diesem Modul lief das nur über den
 * kleingeschriebenen display_name — Übungen mit anderer Schreibweise, deutschem/
 * englischem Zweitnamen, Alias oder nur mit exercise_id fanden nichts und zählten
 * für die Coverage gar nicht.
 *
 * Reihenfolge der Treffer (von sicher nach vage):
 *   1. exercise_id / id der Session-Übung
 *   2. Name exakt (klein)            — bisheriges Verhalten, unverändert
 *   3. Name gefaltet (ä→ae, -/_→Leerzeichen, Satzzeichen weg)
 *   4. Name ohne Klammerzusatz ("Schulterpresse (Maschine)" → "schulterpresse")
 *
 * Katalog gewinnt vor Yuhonas-Mirror: der Mirror (Standard-Übungs-/Muskel-DB, die
 * den noch unfertigen Katalog überbrückt) wird nur als letzter Fallback befragt.
 */

export function foldName(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[-_/]/g, " ")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function stripParens(s) {
  return String(s || "").replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Baut die Lookup-Map. Schlüssel bleiben (wie bisher) der kleingeschriebene
 * display_name, damit alle bestehenden `kbMap.get(name.toLowerCase())`-Aufrufer
 * unverändert funktionieren; zusätzlich ID-, Zweitnamen-, Alias- und
 * gefaltete Schlüssel. Primärnamen gewinnen immer vor Aliassen.
 */
export function buildKbMap(kbExercises) {
  const map = new Map();
  const list = (Array.isArray(kbExercises) ? kbExercises : []).filter(Boolean);

  // 1. Primärname — "letzter gewinnt" wie der bisherige kbMap.set()-Aufbau.
  for (const ex of list) {
    const key = String(ex.display_name || ex.name || ex.exercise_id || "").toLowerCase();
    if (key) map.set(key, ex);
  }
  // 2. Alles weitere nur, wenn der Schlüssel noch frei ist.
  const add = (key, ex) => {
    const k = String(key || "").toLowerCase();
    if (k && !map.has(k)) map.set(k, ex);
  };
  for (const ex of list) {
    add(ex.exercise_id, ex);
    add(ex.id, ex);
    add(ex.name, ex);
    add(ex.german, ex);
    add(ex.english, ex);
    // Frühere IDs (z.B. "inbox_back_squat" aus alten Sessions): Sessions werden
    // nie umgeschrieben, die alte ID löst hier auf die Kanon-ID auf.
    for (const legacy of ex.legacy_ids || []) add(legacy, ex);
  }
  for (const ex of list) {
    for (const alias of [...(ex.aliases || []), ...(ex.search_aliases || [])]) add(alias, ex);
  }
  // 3. Gefaltete Varianten aller bisherigen Schlüssel.
  for (const [key, ex] of Array.from(map.entries())) add(foldName(key), ex);
  return map;
}

/** KB-Eintrag zu einer Session-Übung oder null. */
export function findKbExercise(kbMap, ex) {
  if (!kbMap || !ex) return null;
  for (const id of [ex.exercise_id, ex.id]) {
    const hit = id && kbMap.get(String(id).toLowerCase());
    if (hit) return hit;
  }
  const name = String(ex.name || "");
  if (!name) return null;
  return kbMap.get(name.toLowerCase())
    || kbMap.get(foldName(name))
    || kbMap.get(foldName(stripParens(name)))
    || null;
}

/** Hat die Übung selbst schon Muskel-Angaben? */
export function hasInlineMuscles(ex) {
  return !!(ex?.primaryMuscles?.length || ex?.secondaryMuscles?.length || ex?.stabilizers?.length);
}

function hasKbMuscles(rec) {
  return !!(rec?.primary_muscles?.length || rec?.primaryMuscles?.length
    || rec?.secondary_muscles?.length || rec?.secondaryMuscles?.length);
}

/**
 * Übungen (über alle Sessions), für die weder Session noch Katalog Muskeln kennen.
 * @returns {string[]} eindeutige Namen
 */
export function unresolvedExerciseNames(sessions, kbMap) {
  const out = new Set();
  for (const s of Array.isArray(sessions) ? sessions : []) {
    for (const ex of Array.isArray(s?.exercises) ? s.exercises : []) {
      if (hasInlineMuscles(ex)) continue;
      const rec = findKbExercise(kbMap, ex);
      if (hasKbMuscles(rec)) continue;
      const name = ex.name || ex.exercise_id || ex.id;
      if (name) out.add(String(name));
    }
  }
  return Array.from(out);
}

/**
 * Letzter Fallback: Yuhonas-Mirror (Standard-Übungs-/Muskel-DB dieses Geräts).
 * Lädt den Mirror nur, wenn wirklich Übungen ungeklärt sind (IndexedDB-Lesen +
 * Parsen ist nicht gratis), und nie, wenn er nicht verfügbar ist — Fehler
 * lassen die Coverage unverändert.
 *
 * Ergänzt `kbMap` um gefaltete Namen/IDs der Treffer; vorhandene Katalog-
 * Schlüssel werden nie überschrieben.
 */
export async function augmentKbMapWithMirror(kbMap, sessions, loadMirrorIndex = defaultMirrorIndex) {
  const missing = unresolvedExerciseNames(sessions, kbMap);
  if (missing.length === 0) return { resolved: 0, unresolved: [] };
  let index = null;
  try { index = await loadMirrorIndex(); } catch { index = null; }
  if (!index || index.size === 0) return { resolved: 0, unresolved: reportUnresolved(missing) };

  let resolved = 0;
  const unresolved = [];
  for (const name of missing) {
    const hit = index.get(name.toLowerCase()) || index.get(foldName(name)) || index.get(foldName(stripParens(name)));
    if (hit) {
      for (const k of [name.toLowerCase(), foldName(name)]) if (!kbMap.has(k)) kbMap.set(k, hit);
      resolved++;
    } else {
      unresolved.push(name);
    }
  }
  return { resolved, unresolved: reportUnresolved(unresolved) };
}

// Diagnose: Übungen, für die weder Session, Katalog noch Mirror Muskeln kennen,
// zählen nicht zur Coverage. Pro Name einmal pro Seitenladung in die Konsole,
// damit sie sich gezielt im Katalog (Alias/Eintrag) beheben lassen.
const reportedUnresolved = new Set();
function reportUnresolved(names) {
  const fresh = names.filter((n) => !reportedUnresolved.has(n));
  fresh.forEach((n) => reportedUnresolved.add(n));
  if (fresh.length && typeof console !== "undefined") {
    console.info("[coverage] Übungen ohne Muskeldaten (zählen nicht zur Coverage):", fresh);
  }
  return names;
}

async function defaultMirrorIndex() {
  const mod = await import("../../exerciseDbs/search.js");
  return mod.getMirrorMuscleIndex();
}
