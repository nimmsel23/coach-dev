import { z } from "@hono/zod-openapi";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { defineJsonRoute } from "../lib/routes.mjs";

export function registerFirestore(app, ctx) {
  const { FITNESS_UID, DATA_DIR, STATIC_DIR, readJson, writeJson, mirrorSession, getFirestoreStatus, pullAllSessions, pullJournalTree, journalUpsertEntry, log } = ctx;
// ── Firestore ─────────────────────────────────────────────────────────────────
app.openapi(defineJsonRoute({
  method: "get",
  path: "/firestore/status",
  tags: ["firestore"],
  summary: "Firestore-Verbindungsstatus",
}), async (c) => c.json(await getFirestoreStatus()));

app.openapi(defineJsonRoute({
  method: "post",
  path: "/firestore/pull",
  tags: ["firestore"],
  summary: "Sessions und Journal aus Firestore ziehen",
  query: z.object({ uid: z.string().optional() }),
}), async (c) => {
  const { uid: uidQ } = c.req.valid("query");
  const uid = uidQ || c.req.header("X-User-UID");
  if (!uid || uid === "default") {
    return c.json({
      ok: false,
      error: "uid Pflicht (kein default). Übergib via ?uid=... oder X-User-UID Header. Verfügbare uids siehe ~/.aos/fitness/users/",
    }, 400);
  }
  const status = await getFirestoreStatus();
  if (!status.ok) return c.json({ ok: false, error: "Firestore nicht verbunden" }, 503);

  const [docs, journalTree] = await Promise.all([
    pullAllSessions(uid),
    pullJournalTree(uid),
  ]);
  if (!docs || !journalTree) return c.json({ ok: false, error: "Pull fehlgeschlagen" }, 500);

  const sessDir = path.join(os.homedir(), ".aos", "fitness", "users", uid, "sessions");
  const journalDir = path.join(os.homedir(), ".aos", "fitness", "users", uid, "journal");
  fs.mkdirSync(sessDir, { recursive: true });
  fs.mkdirSync(journalDir, { recursive: true });

  let pulled = 0, skipped = 0, conflicts = 0;
  const conflictDates = [];
  let journalPulled = 0, habitJournalPulled = 0, habitRecordPulled = 0;

  const formatTs = (value) => {
    if (!value) return "";
    if (typeof value === "string") return value.slice(0, 16);
    if (value instanceof Date) return value.toISOString().slice(0, 16);
    if (typeof value.toDate === "function") return value.toDate().toISOString().slice(0, 16);
    return "";
  };

  // Upsert in die Tages-JSONL-SOT (journal-store.mjs) + Neu-Render der .md.
  // `id` = Firestore-doc-id, identisch zum Python-Daemon-Pfad (mirror.py).
  const appendJournalBlock = (date, source, id, block, ts = "") =>
    journalUpsertEntry(path.join(journalDir, `${date}.md`),
      { id, source, ts, body: block });

  for (const { date, data } of docs) {
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) { skipped++; continue; }
    const localPath = path.join(sessDir, `${date}.json`);
    const local = readJson(localPath);
    const cloudTs = data.saved_at || "";
    const localTs = local?.saved_at || "";

    // Strategie: kein Lokal → schreiben. Sonst nur wenn cloud strikt neuer ist.
    if (local && localTs && cloudTs && localTs >= cloudTs) { skipped++; continue; }
    if (local && (!cloudTs || !localTs)) {
      // Mehrdeutig — überspringen + melden statt blind überschreiben
      conflicts++; conflictDates.push(date); continue;
    }

    writeJson(localPath, data);
    try { syncSessionToDb(date, data); } catch (e) {
      log.warn(`[pull] SQLite-Sync fehler für ${date}: ${e.message}`);
    }
    pulled++;
  }

  for (const { id, data } of journalTree.journal) {
    const date = data?.date || "";
    const text = String(data?.text || "").trim();
    if (!date || !text) continue;
    const time = formatTs(data?.time);
    if (appendJournalBlock(date, "journal", id, `**${time}** ${text}`, time)) {
      journalPulled++;
    }
  }

  for (const { id, data } of journalTree.habitJournals) {
    const date = data?.date || "";
    if (!date) continue;
    const text = String(data?.text || "").trim();
    const coachFeedback = String(data?.coachFeedback || "").trim();
    const habitId = data?.habitId || "";
    const habitName = journalTree.habitNames?.[habitId] || `Habit:${habitId}`;
    const time = formatTs(data?.recorded_at || data?.updated_at);
    let block = `**Habit: ${habitName}**`;
    if (time) block += ` _${time}_`;
    if (text) block += `\n${text}`;
    if (coachFeedback) block += `\n> **Coach Feedback:** ${coachFeedback}`;
    if (appendJournalBlock(date, "habit_journals", id, block, formatTs(data?.recorded_at || data?.updated_at))) {
      habitJournalPulled++;
    }
  }

  for (const { id, data } of journalTree.habitRecords) {
    const date = data?.date || "";
    if (!date) continue;
    const habitId = data?.habitId || "";
    const habitName = journalTree.habitNames?.[habitId] || `Habit:${habitId}`;
    const completion = data?.completion || "DONE";
    const time = formatTs(data?.recorded_at);
    let block = `**${habitName}** ${completion}`;
    if (time) block += ` _${time}_`;
    if (appendJournalBlock(date, "habit_records", id, block, time)) {
      habitRecordPulled++;
    }
  }

  return c.json({
    ok: true,
    pulled,
    skipped,
    conflicts,
    conflict_dates: conflictDates,
    journal_pulled: journalPulled,
    habit_journal_pulled: habitJournalPulled,
    habit_record_pulled: habitRecordPulled,
  });
});

app.openapi(defineJsonRoute({
  method: "post",
  path: "/firestore/sync",
  tags: ["firestore"],
  summary: "Lokale Sessions nach Firestore spiegeln",
}), async (c) => {
  const uid = c.req.header("X-User-UID") || FITNESS_UID;
  const status = await getFirestoreStatus();
  if (!status.ok) return c.json({ ok: false, error: "Firestore nicht verbunden" }, 503);
  const sessDir = path.join(DATA_DIR, "sessions");
  let synced = 0;
  if (fs.existsSync(sessDir)) {
    const files = fs.readdirSync(sessDir)
      .filter(f => f.endsWith(".json") && !f.includes("history"))
      .slice(-30);
    for (const f of files) {
      const date = f.replace(".json", "");
      const data = readJson(path.join(sessDir, f));
      if (data) { mirrorSession(date, data, uid); synced++; }
    }
  }
  // Konsumiert die Retry-Markierung aus firestore-mirror.mjs::fire() — Saves,
  // deren Firestore-Push zuvor fehlgeschlagen ist (z.B. Netzwerk kurz weg),
  // landen hier nicht mehr unsichtbar im Nirwana, sondern werden bei
  // nächster Gelegenheit erneut versucht. Best-effort: Datei wird vor dem
  // erneuten Versuch geleert, ein erneuter Fehlschlag hängt sich über
  // dieselbe fire()-Logik wieder an.
  let retried = 0;
  const retryFile = path.join(path.dirname(sessDir), ".pending-firestore-retries.json");
  if (fs.existsSync(retryFile)) {
    const pending = readJson(retryFile, []);
    fs.unlinkSync(retryFile);
    for (const entry of pending) {
      if (entry.kind !== "session") continue;
      const fname = entry.sessionId ? `${entry.date}__${entry.sessionId}.json` : `${entry.date}.json`;
      const data = readJson(path.join(sessDir, fname));
      if (data) { mirrorSession(entry.date, data, entry.uid || uid); retried++; }
    }
  }
  return c.json({ ok: true, synced, retried });
});

app.openapi(defineJsonRoute({
  method: "get",
  path: "/v1",
  tags: ["system"],
  summary: "Legacy v1 HTML ausliefern",
  responses: {
    200: {
      description: "HTML",
      content: {
        "text/html": { schema: z.string() },
      },
    },
  },
}), (c) => {
  const abs = path.join(STATIC_DIR, "v1.html");
  if (fs.existsSync(abs)) {
    return new Response(fs.createReadStream(abs), {
      headers: { "Content-Type": "text/html;charset=utf-8" },
    });
  }
  return c.text("Not Found", 404);
});

}
