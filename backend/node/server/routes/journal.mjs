import { z } from "@hono/zod-openapi";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { defineJsonRoute } from "../lib/routes.mjs";

export function registerJournal(app, ctx) {
  const { FITNESS_UID, DATA_DIR, localToday, mirrorJournal, readJournalFull, listJournals, journalEntriesPath, journalFreetextBody, journalUpsertEntry } = ctx;
// ── Journal ───────────────────────────────────────────────────────────────────
app.openapi(defineJsonRoute({
  method: "get",
  path: "/journal",
  tags: ["journal"],
  summary: "Journal-Eintrag lesen",
  query: z.object({ date: z.string().optional() }),
}), async (c) => {
  const { date: dateQ } = c.req.valid("query");
  const uid  = c.req.header("X-User-UID") || FITNESS_UID;
  const date = dateQ || localToday();
  // Firestore-first
  const fsContent = await readJournalFull(uid, date);
  if (fsContent) return c.json({ ok: true, content: fsContent, mtime: date, source: "firestore" });
  // Offline-Fallback: lokale .md Dateien
  const localDirs = [
    { file: path.join(os.homedir(), ".aos", "fitness", "users", uid, "journal", `${date}.md`), label: null },
    { file: path.join(DATA_DIR, "journal", `${date}.md`), label: null },
    { file: path.join(os.homedir(), ".aos", "fuel", "users", uid, "nutrition_journal", `${date}.md`), label: "Fuel" },
  ].filter(({ file }) => fs.existsSync(file));
  if (!localDirs.length) return c.json({ ok: false }, 404);
  const content = localDirs.map(({ file, label }) => {
    // Fitness-Journale: JSONL ist SOT → nur den Freitext-Eintrag in die
    // editierbare Textarea (die gerenderte .md enthält zusätzlich die
    // Habit-/Firestore-Blöcke). Fuel bleibt Rohtext.
    const jsonl = journalEntriesPath(file);
    const text = (label !== "Fuel" && fs.existsSync(jsonl))
      ? journalFreetextBody(file, `freetext-${date}`)
      : fs.readFileSync(file, "utf8");
    return label ? `## ${label} – ${date}\n\n${text}` : text;
  }).join("\n\n---\n\n");
  const mtime = localDirs.map(({ file }) => fs.statSync(file).mtime).reduce((a, b) => a > b ? a : b).toISOString().slice(0, 10);
  return c.json({ ok: true, content, mtime, source: "local" });
});

app.openapi(defineJsonRoute({
  method: "post",
  path: "/journal",
  tags: ["journal"],
  summary: "Journal-Eintrag speichern",
  query: z.object({ date: z.string().optional() }),
  jsonBody: z.object({ content: z.string().optional() }).loose(),
}), async (c) => {
  const { date: dateQ } = c.req.valid("query");
  const { content } = c.req.valid("json");
  const uid           = c.req.header("X-User-UID") || FITNESS_UID;
  const date          = dateQ || localToday();
  // Pro-uid-Ordner (wie GET oben schon macht) statt fix an den beim Server-
  // Start aufgelösten DATA_DIR (= FITNESS_UID) — sonst landet der Eintrag
  // eines anderen Klienten (X-User-UID-Header) immer im falschen Journal.
  const dir           = path.join(os.homedir(), ".aos", "fitness", "users", uid, "journal");
  fs.mkdirSync(dir, { recursive: true });
  const file          = path.join(dir, `${date}.md`);
  // Freitext-Tagesblock als EIN Eintrag (stabile id `freetext-<date>`) in die
  // JSONL-SOT upserten statt die Datei zu overwriten — Daemon-Events und
  // Freitext räumen sich so nicht mehr gegenseitig weg.
  journalUpsertEntry(file, { id: `freetext-${date}`, source: "freetext", ts: "", body: content || "" });
  mirrorJournal(date, { text: content || "" }, uid);
  return c.json({ ok: true });
});

app.openapi(defineJsonRoute({
  method: "get",
  path: "/journal/list",
  tags: ["journal"],
  summary: "Journal-Liste laden",
  query: z.object({ limit: z.coerce.number().int().positive().max(500).optional().default(50) }),
}), async (c) => {
  const { limit: limitCount } = c.req.valid("query");
  const uid = c.req.header("X-User-UID") || FITNESS_UID;
  // Firestore-first
  const fsEntries = await listJournals(uid, limitCount);
  if (fsEntries) return c.json({ ok: true, entries: fsEntries, source: "firestore" });
  // Offline-Fallback
  const dirs = [
    path.join(os.homedir(), ".aos", "fitness", "users", uid, "journal"),
    path.join(DATA_DIR, "journal"),
    path.join(os.homedir(), ".aos", "fuel", "users", uid, "nutrition_journal"),
  ];
  const seen = new Map();
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter(f => f.endsWith(".md"))) {
      const date = f.replace(".md", "");
      const mtime = fs.statSync(path.join(dir, f)).mtime.toISOString();
      if (!seen.has(date) || mtime > seen.get(date)) seen.set(date, mtime);
    }
  }
  const entries = [...seen.entries()]
    .sort((a, b) => b[0].localeCompare(a[0])).slice(0, limitCount)
    .map(([date, mtime]) => ({ date, mtime }));
  return c.json({ ok: true, entries, source: "local" });
});

}
