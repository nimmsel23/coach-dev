/**
 * offlineFirestore.js — Offline-first Drop-ins für firebase/firestore.
 *
 * Problem: Mit persistentem Cache liest/schreibt Firestore zwar lokal, ABER
 *  - getDoc()/getDocs() warten im "Lie-Fi" (WLAN verbunden, kein Internet) bis zu ~10 s auf den Server,
 *    bevor sie auf den Cache zurückfallen;
 *  - setDoc()/updateDoc()/addDoc()/deleteDoc()/batch.commit() lösen ihr Promise erst auf, wenn der SERVER
 *    bestätigt hat — `await setDoc(...)` hängt also offline für immer und blockiert Screens/Flows.
 *
 * Lösung (gleiche Signaturen, einfach den Import tauschen):
 *  - Lesen: Server und Cache laufen parallel. Antwortet der Server innerhalb READ_TIMEOUT_MS, gilt er (frisch).
 *    Sonst kommt der Cache-Stand sofort zurück, die Server-Anfrage läuft im Hintergrund weiter und
 *    füllt den Cache. Nach einem Timeout liest die App SLOW_WINDOW_MS lang cache-zuerst (kein erneutes Warten).
 *  - Schreiben: Der Schreibvorgang ist lokal sofort angenommen (Firestore-Queue in IndexedDB, sync später).
 *    Das Promise wird nach WRITE_ACCEPT_MS als "lokal angenommen" aufgelöst; schnelle Fehler
 *    (permission-denied, invalid-argument) kommen weiterhin als Exception an, späte werden nur geloggt.
 *  - deferStart(): Hintergrundarbeit (Sync, Listener, Token-Refresh) erst NACH dem ersten Render starten.
 *
 * Nicht ersetzt: runTransaction (braucht den Server), onSnapshot (liefert ohnehin zuerst den Cache).
 */
import * as fs from "firebase/firestore";

export const READ_TIMEOUT_MS = 2500;
export const WRITE_ACCEPT_MS = 1200;
export const SLOW_WINDOW_MS = 60_000;

const TIMEOUT = Symbol("timeout");
const later = (ms) => new Promise((resolve) => setTimeout(() => resolve(TIMEOUT), ms));

/** Fabrik, damit die Logik ohne echtes Firestore testbar ist (`fs` = Modul-Namespace von firebase/firestore). */
export function createOfflineFirestore(fs, { readTimeoutMs = READ_TIMEOUT_MS, writeAcceptMs = WRITE_ACCEPT_MS, slowWindowMs = SLOW_WINDOW_MS } = {}) {
  let slowUntil = 0;
  const isNetworkSlow = () => Date.now() < slowUntil;

  /** Hintergrund-Refresh: Fehler schlucken, Erfolg beendet den "langsam"-Modus. */
  function track(serverPromise) {
    serverPromise.then(() => { slowUntil = 0; }, () => {});
    return serverPromise;
  }

  async function readWithCacheFallback({ server, cache, usable }) {
    if (isNetworkSlow()) {
      try {
        const snap = await cache();
        if (usable(snap)) { track(server()); return snap; }
      } catch { /* Cache-Miss → unten normal weiter */ }
    }
    const pending = track(server());
    const first = await Promise.race([pending, later(readTimeoutMs)]);
    if (first !== TIMEOUT) return first;
    slowUntil = Date.now() + slowWindowMs;
    try {
      const snap = await cache();
      if (usable(snap)) return snap;
    } catch { /* nichts im Cache */ }
    return pending; // Nichts lokal vorhanden: weiter auf den Server (bzw. dessen eigenes Offline-Ende) warten
  }

  const getDoc = (ref) => readWithCacheFallback({
    server: () => fs.getDoc(ref),
    cache: () => fs.getDocFromCache(ref),
    usable: (snap) => snap.exists(),
  });

  const getDocs = (query) => readWithCacheFallback({
    server: () => fs.getDocs(query),
    cache: () => fs.getDocsFromCache(query),
    usable: (snap) => !snap.empty,
  });

  function acceptLocally(promise, ms = writeAcceptMs) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => { settled = true; resolve(undefined); }, ms);
      promise.then(
        (value) => { clearTimeout(timer); if (!settled) { settled = true; resolve(value); } },
        (error) => {
          clearTimeout(timer);
          if (settled) console.warn("[offline] verzögerter Schreibfehler (lokal bereits angenommen):", error);
          else { settled = true; reject(error); }
        },
      );
    });
  }

  const setDoc = (ref, data, options) => acceptLocally(options === undefined ? fs.setDoc(ref, data) : fs.setDoc(ref, data, options));
  const updateDoc = (ref, ...args) => acceptLocally(fs.updateDoc(ref, ...args));
  const deleteDoc = (ref) => acceptLocally(fs.deleteDoc(ref));

  /** addDoc mit clientseitig erzeugter ID: liefert die Referenz sofort, der Server folgt später. */
  async function addDoc(collectionRef, data) {
    const ref = fs.doc(collectionRef);
    await setDoc(ref, data);
    return ref;
  }

  function writeBatch(db) {
    const batch = fs.writeBatch(db);
    const commit = batch.commit.bind(batch);
    batch.commit = () => acceptLocally(commit());
    return batch;
  }

  return { getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc, writeBatch, acceptLocally, isNetworkSlow };
}

const real = createOfflineFirestore(fs);
export const { getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc, writeBatch, acceptLocally, isNetworkSlow } = real;

// ── Start im Hintergrund ─────────────────────────────────────────────────────

/** Führt fn nach dem ersten Render aus (Idle bzw. spätestens nach `delay` ms). Fehler werden still behandelt. */
export function deferStart(fn, { delay = 1500 } = {}) {
  const run = () => { try { Promise.resolve(fn()).catch(() => {}); } catch { /* still */ } };
  if (typeof window === "undefined") { setTimeout(run, delay); return; }
  const schedule = () => (typeof window.requestIdleCallback === "function"
    ? window.requestIdleCallback(run, { timeout: Math.max(delay, 1500) })
    : setTimeout(run, delay));
  if (document.readyState === "complete") schedule();
  else window.addEventListener("load", () => setTimeout(schedule, 0), { once: true });
}
