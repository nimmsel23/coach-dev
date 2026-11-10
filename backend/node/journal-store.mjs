/**
 * journal-store.mjs — Node-Portierung von fitness/runtime/journal_store.py
 *
 * `journal/YYYY-MM-DD.entries.jsonl` ist die Quelle der Wahrheit für
 * Tages-Journale (eine JSON-Zeile pro Eintrag). Die `.md` ist ein reines
 * Derivat, das nach jeder Änderung komplett neu gerendert wird.
 *
 * Sortier- und Formatregel von `renderMd` sind mit der Python-Seite
 * abgestimmt, damit beide dieselbe `.md` byte-identisch erzeugen.
 * Wer eine Regel hier ändert, muss `fitness/runtime/journal_store.py`
 * mitziehen.
 *
 * Eintrags-Schema: { id, source, ts, body, meta? }
 *   source ∈ journal | habit_records | habit_journals | freetext | session_note
 *   ts     ISO-8601 oder "" ("" sortiert zuerst)
 *
 * Identität ist das Paar (source, id), nicht die id allein — dieselbe
 * Firestore-doc-id kommt über mehrere Subkollektionen vor. Marker:
 * <!-- entry:<source>:<id> -->
 */

import fs from "node:fs";
import path from "node:path";

export const ENTRY_SOURCES = new Set([
  "journal", "habit_records", "habit_journals", "freetext", "session_note",
]);

export function entriesPath(mdPath) {
  const p = String(mdPath);
  if (p.endsWith(".entries.jsonl")) return p;
  return p.replace(/\.md$/, "") + ".entries.jsonl";
}

export function mdPathFor(jsonlPath) {
  const p = String(jsonlPath);
  if (p.endsWith(".entries.jsonl")) return p.slice(0, -".entries.jsonl".length) + ".md";
  return p.replace(/\.[^.]+$/, "") + ".md";
}

export function normalizeEntry(entry) {
  const out = {
    id: String(entry?.id ?? "").trim(),
    source: String(entry?.source ?? "freetext").trim(),
    ts: String(entry?.ts ?? ""),
    body: String(entry?.body ?? ""),
  };
  if (entry?.meta && typeof entry.meta === "object" && Object.keys(entry.meta).length) {
    out.meta = entry.meta;
  }
  return out;
}

function entryKey(e) {
  return [String(e?.ts ?? ""), String(e?.source ?? ""), String(e?.id ?? "")];
}

function cmpKey(a, b) {
  const ka = entryKey(a), kb = entryKey(b);
  for (let i = 0; i < ka.length; i++) {
    if (ka[i] < kb[i]) return -1;
    if (ka[i] > kb[i]) return 1;
  }
  return 0;
}

function identity(e) {
  return JSON.stringify([String(e?.source ?? ""), String(e?.id ?? "")]);
}

function atomicWrite(p, data) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.tmp.${process.pid}`;
  fs.writeFileSync(tmp, data, "utf8");
  fs.renameSync(tmp, p);
}

export function loadEntries(jsonlPath) {
  const jf = entriesPath(jsonlPath);
  if (!fs.existsSync(jf)) return [];
  const entries = [];
  for (const line of fs.readFileSync(jf, "utf8").split("\n")) {
    const s = line.trim();
    if (!s) continue;
    try {
      const obj = JSON.parse(s);
      if (obj && typeof obj === "object" && obj.id) entries.push(normalizeEntry(obj));
    } catch { /* malformed line skipped */ }
  }
  return entries;
}

export function dumpEntries(jsonlPath, entries) {
  const jf = entriesPath(jsonlPath);
  const lines = entries.map(e => JSON.stringify(normalizeEntry(e)));
  atomicWrite(jf, lines.length ? lines.join("\n") + "\n" : "");
}

export function renderMd(entries) {
  const blocks = entries.slice().sort(cmpKey).map(e => {
    const body = String(e?.body ?? "").replace(/\n+$/, "");
    return `<!-- entry:${e?.source}:${e?.id} -->\n${body}\n`;
  });
  return blocks.join("\n");
}

function renderSidecar(jsonlPath, entries) {
  dumpEntries(jsonlPath, entries);
  atomicWrite(mdPathFor(entriesPath(jsonlPath)), renderMd(entries));
}

function sameEntry(a, b) {
  const na = normalizeEntry(a), nb = normalizeEntry(b);
  return JSON.stringify(na) === JSON.stringify(nb);
}

export function upsertEntry(mdOrJsonlPath, entry) {
  const jf = entriesPath(mdOrJsonlPath);
  const norm = normalizeEntry(entry);
  if (!norm.id) return false;
  const entries = loadEntries(jf);
  const idx = entries.findIndex(e => identity(e) === identity(norm));
  if (idx >= 0) {
    if (sameEntry(entries[idx], norm)) return false;
    entries[idx] = norm;
  } else {
    entries.push(norm);
  }
  renderSidecar(jf, entries);
  return true;
}

export function deleteEntry(mdOrJsonlPath, entryId, source = null) {
  const jf = entriesPath(mdOrJsonlPath);
  const entries = loadEntries(jf);
  const kept = entries.filter(e => !(e.id === entryId && (source === null || e.source === source)));
  if (kept.length === entries.length) return false;
  renderSidecar(jf, kept);
  return true;
}

export function freetextBody(mdOrJsonlPath, entryId = null) {
  const entries = loadEntries(mdOrJsonlPath);
  if (entryId != null) {
    const hit = entries.find(e => e.id === entryId);
    if (hit) return String(hit.body ?? "");
  }
  const ft = entries.find(e => e.source === "freetext");
  return ft ? String(ft.body ?? "") : "";
}
