/**
 * SSOT-Barrel für Muskelwissen im Frontend.
 *
 * Enthält:
 * - gebündelte KB-Dokumente aus fitness/catalog/kb/muscles/**
 * - statische Taxonomy-/Viz-Getter
 * - zentrale Re-Exports für Muskel-Translations, Label- und Map-Helfer
 *
 * Alt-Dateien wie ../translations.js, ../muscleLabels.js und ../muscleMap.js
 * bleiben nur als dünne Fassaden bestehen und sollen langfristig hierhin
 * zeigen, damit die Muskel-Utilities an einem Ort auffindbar sind.
 */

import * as yaml from "js-yaml";
import { useEffect, useState } from "react";

import { setKBMuscles } from "../db/shared/muscle.js";

import muscleIndexRaw from "../../../fitness/catalog/kb/muscle_index.yml?raw";

const muscleDocSources = import.meta.glob("../../../fitness/catalog/kb/muscles/**/*.yml", {
  eager: true,
  query: "?raw",
  import: "default",
});

const muscleIndex = yaml.load(muscleIndexRaw) || {};
const indexedMuscles = muscleIndex?.muscles && typeof muscleIndex.muscles === "object" ? muscleIndex.muscles : {};

function parseYamlDoc(raw) {
  const doc = yaml.load(raw);
  return doc && typeof doc === "object" ? doc : {};
}

function parseDocPath(path) {
  const nested = path.match(/\/muscles\/([^/]+)\/([^/]+)\.yml$/);
  if (nested) {
    return {
      kbLevel: "muscle",
      region: nested[1],
      stem: nested[2],
    };
  }
  const topLevel = path.match(/\/muscles\/([^/]+)\.yml$/);
  if (topLevel) {
    return {
      kbLevel: "region",
      region: topLevel[1],
      stem: topLevel[1],
    };
  }
  return null;
}

function buildMuscleDocs() {
  return Object.entries(muscleDocSources)
    .map(([path, raw]) => {
      const meta = parseDocPath(path);
      if (!meta) return null;

      const parsed = parseYamlDoc(raw);
      const indexed = meta.kbLevel === "muscle" ? indexedMuscles[parsed.id || meta.stem] || {} : {};
      const docId = String(parsed.id || meta.stem);

      return {
        ...parsed,
        ...indexed,
        doc_id: docId,
        id: docId,
        region: parsed.region || meta.region,
        kb_level: meta.kbLevel,
      };
    })
    .filter(Boolean)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

function buildTaxonomy(docs) {
  const taxonomy = {};
  for (const doc of docs) {
    if (doc.kb_level !== "muscle" || !doc.id) continue;
    taxonomy[doc.id] = doc;
  }
  return taxonomy;
}

function buildViz(docs, taxonomy) {
  const regionDocs = docs
    .filter((doc) => doc.kb_level === "region" && Array.isArray(doc.muscles))
    .sort((a, b) => (a.muscles?.length || 0) - (b.muscles?.length || 0));

  const wger = {};
  const labels = {};
  const region = {};
  const regionLabels = {};
  const bodyMuscles = {};

  for (const [muscleId, info] of Object.entries(indexedMuscles)) {
    if (info?.wger_id) wger[muscleId] = info.wger_id;
  }

  for (const doc of regionDocs) {
    const regionId = doc.region || doc.doc_id || doc.id;
    if (!regionId) continue;
    regionLabels[regionId] = doc.label_de || doc.display_name || regionId;
    for (const member of doc.muscles) {
      if (!region[member]) region[member] = regionId;
    }
  }

  for (const [muscleId, doc] of Object.entries(taxonomy)) {
    labels[muscleId] = doc.label_de || doc.display_name || muscleId;
    const bodyMusclesEntry = doc?.viz?.body_muscles;
    if (bodyMusclesEntry?.ids?.length) {
      bodyMuscles[muscleId] = {
        view: bodyMusclesEntry.view,
        ids: bodyMusclesEntry.ids,
      };
    }
  }

  const bodyMusclesSlugs = Object.fromEntries(
    Object.entries(bodyMuscles)
      .filter(([, value]) => Array.isArray(value.ids) && value.ids.length)
      .map(([muscleId, value]) => [muscleId, value.ids[0]]),
  );

  return {
    wger,
    labels,
    region,
    region_labels: regionLabels,
    body_muscles: bodyMuscles,
    body_muscles_slugs: bodyMusclesSlugs,
  };
}

const STATIC_MUSCLE_DOCS = buildMuscleDocs();
const STATIC_MUSCLE_TAXONOMY = buildTaxonomy(STATIC_MUSCLE_DOCS);
const STATIC_MUSCLE_VIZ = buildViz(STATIC_MUSCLE_DOCS, STATIC_MUSCLE_TAXONOMY);

setKBMuscles(STATIC_MUSCLE_DOCS);

export function getStaticMuscleDocs() {
  return STATIC_MUSCLE_DOCS;
}

export function getStaticMuscleTaxonomy() {
  return STATIC_MUSCLE_TAXONOMY;
}

export function getStaticMuscle(muscleId) {
  return STATIC_MUSCLE_TAXONOMY[String(muscleId || "")] || null;
}

export function getStaticMuscleViz() {
  return STATIC_MUSCLE_VIZ;
}

export function useMuscleMap() {
  const [map, setMap] = useState(STATIC_MUSCLE_VIZ);
  useEffect(() => {
    setMap(STATIC_MUSCLE_VIZ);
  }, []);
  return map;
}

export function getMuscleMapSync() {
  return STATIC_MUSCLE_VIZ;
}

export {
  translateMuscleGroup,
  canonicalMuscleId,
  splitMuscleEntries,
  formatMuscleDetail,
  MUSCLE_DETAIL_KEY,
  MUSCLE_DETAIL_DEFAULT,
  MUSCLE_DETAIL_OPTIONS,
  loadMuscleDetail,
  saveMuscleDetail,
  muscleToRbhSlug,
  muscleToRmhSlug,
  translateMuscle,
} from "./muscleTranslations.js";
export {
  muskelDe,
  muskelGruppe,
  muskelColor,
  dedupeMuskeln,
} from "./muscleLabels.js";
