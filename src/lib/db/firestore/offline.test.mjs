import { test } from "node:test";
import assert from "node:assert/strict";
import { createOfflineFirestore } from "./offline.js";

const snap = (exists, data = {}) => ({ exists: () => exists, empty: !exists, data: () => data });
const never = () => new Promise(() => {});
const T = { readTimeoutMs: 30, writeAcceptMs: 30, slowWindowMs: 200 };

test("getDoc: Server schnell → Serverwert (frisch)", async () => {
  const o = createOfflineFirestore({ getDoc: async () => snap(true, { v: "server" }), getDocFromCache: async () => snap(true, { v: "cache" }) }, T);
  assert.equal((await o.getDoc("r")).data().v, "server");
});

test("getDoc: Server hängt (Lie-Fi) → nach Timeout Cache, danach cache-zuerst ohne erneutes Warten", async () => {
  let serverCalls = 0;
  const o = createOfflineFirestore({ getDoc: () => { serverCalls++; return never(); }, getDocFromCache: async () => snap(true, { v: "cache" }) }, T);
  const t0 = Date.now();
  assert.equal((await o.getDoc("r")).data().v, "cache");
  assert.ok(Date.now() - t0 >= 25);
  assert.ok(o.isNetworkSlow());
  const t1 = Date.now();
  assert.equal((await o.getDoc("r")).data().v, "cache");
  assert.ok(Date.now() - t1 < 20, "zweiter Zugriff wartet nicht erneut");
  assert.equal(serverCalls, 2, "Hintergrund-Refresh läuft weiter");
});

test("getDoc: leerer Cache + hängender Server → wartet weiter auf den Server (nichts anzuzeigen)", async () => {
  let resolveServer;
  const o = createOfflineFirestore({ getDoc: () => new Promise((r) => { resolveServer = r; }), getDocFromCache: async () => { throw new Error("miss"); } }, T);
  const p = o.getDoc("r");
  await new Promise((r) => setTimeout(r, 60));
  resolveServer(snap(true, { v: "spät" }));
  assert.equal((await p).data().v, "spät");
});

test("getDocs: leerer Cache gilt nicht als Treffer, gefüllter schon", async () => {
  const o = createOfflineFirestore({ getDocs: never, getDocsFromCache: async () => snap(true) }, T);
  assert.equal((await o.getDocs("q")).empty, false);
});

test("setDoc: löst nach WRITE_ACCEPT auf, auch wenn der Server nie bestätigt; schnelle Fehler kommen an", async () => {
  const hang = createOfflineFirestore({ setDoc: never }, T);
  const t0 = Date.now();
  await hang.setDoc("r", { a: 1 });
  assert.ok(Date.now() - t0 < 200);
  const denied = createOfflineFirestore({ setDoc: async () => { throw Object.assign(new Error("x"), { code: "permission-denied" }); } }, T);
  await assert.rejects(denied.setDoc("r", {}), /x/);
});

test("setDoc: ein später Fehler wird nur geloggt (kein unhandled rejection)", async () => {
  const o = createOfflineFirestore({ setDoc: () => new Promise((_, rej) => setTimeout(() => rej(new Error("spät")), 60)) }, T);
  const orig = console.warn; const logged = []; console.warn = (...a) => logged.push(a);
  await o.setDoc("r", {});
  await new Promise((r) => setTimeout(r, 90));
  console.warn = orig;
  assert.equal(logged.length, 1);
});

test("addDoc: Referenz sofort (clientseitige ID), batch.commit nicht blockierend", async () => {
  const written = [];
  const fs = { doc: () => ({ id: "neu" }), setDoc: (r, d) => { written.push([r.id, d]); return never(); }, writeBatch: () => ({ commit: never }) };
  const o = createOfflineFirestore(fs, T);
  assert.equal((await o.addDoc("col", { x: 1 })).id, "neu");
  assert.deepEqual(written, [["neu", { x: 1 }]]);
  await o.writeBatch("db").commit();
});
