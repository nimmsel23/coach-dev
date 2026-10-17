/**
 * firestore/core.js — Firebase init, auth, and base helpers.
 */

import {
  doc, setDoc, serverTimestamp,
} from "firebase/firestore";
import {
  onAuthStateChanged,
  signInWithPopup, signInWithRedirect, getRedirectResult, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signOut as fbSignOut, updateProfile,
} from "firebase/auth";

import { db, auth, googleProvider } from "../../../firebase.js";

export { db, auth, googleProvider };

export function isLocalMode() { return false; }

// ── api compat shim ───────────────────────────────────────────────────────────
// Views that bypass @db and call api directly hit this no-op in firebase builds.
const noopApi = (verb) => async () => {
  console.warn(`[db.firestore] api.${verb}() called — view bypasses @db contract`);
  return null;
};
export const api = { get: noopApi("get"), post: noopApi("post"), delete: noopApi("delete") };

// ── Auth ──────────────────────────────────────────────────────────────────────

let currentUid = null;
let _lastProfileKey = null;

export function watchAuth(callback) {
  return onAuthStateChanged(auth, async (user) => {
    currentUid = user ? user.uid : null;
    if (user) {
      const profileKey = `${user.uid}:${user.email}:${user.displayName}`;
      if (profileKey !== _lastProfileKey) {
        _lastProfileKey = profileKey;
        try {
          await setDoc(doc(db, "fitness", user.uid, "profile", "metadata"), {
            email: user.email || "",
            displayName: user.displayName || "",
            updated_at: serverTimestamp(),
          }, { merge: true });
        } catch (e) {
          console.error("Profile metadata sync error:", e);
        }
      }
    }
    callback?.(user);
  });
}

// iOS (Safari/PWA/In-App-Browser) blockt Auth-Popups bzw. verliert ihren Rückkanal
// → dort Redirect-Flow. iPadOS meldet sich als "MacIntel" mit Touch.
function needsRedirectAuth() {
  const ua = navigator.userAgent || "";
  const iOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone;
  return iOS || standalone;
}

// Ergebnis eines vorangegangenen Redirect-Logins einsammeln; fängt vor allem Fehler ab
// (onAuthStateChanged feuert ohnehin).
getRedirectResult(auth).catch((error) => {
  console.error("Redirect-Login Fehler:", error);
});

export async function signIn() {
  if (needsRedirectAuth()) {
    await signInWithRedirect(auth, googleProvider);
    return;
  }
  await signInWithPopup(auth, googleProvider);
}

export async function signInEmail(email, password) {
  await signInWithEmailAndPassword(auth, email, password);
}

export async function signUpEmail(email, password, displayName) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  if (displayName) await updateProfile(cred.user, { displayName });
}

export async function signOut() { await fbSignOut(auth); }

export function hasAuthSession() {
  return Boolean(currentUid);
}

export function getUid() {
  if (!currentUid) throw new Error("Nicht eingeloggt");
  return currentUid;
}

const DESKTOP_FITNESS_API_BASE = "http://127.0.0.1:6100/fitness";
const FUNNEL_FITNESS_API_BASE = "https://ideapad.tail7a15d6.ts.net/fitness/fitness";
const LOCAL_FITNESS_API_STORAGE_KEY = "fitness-local-api-base";

function cleanApiBase(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function resolveLocalFitnessApiBase() {
  if (import.meta.env.MODE === "coach") return "";
  if (typeof window !== "undefined") {
    try {
      const stored = cleanApiBase(window.localStorage?.getItem(LOCAL_FITNESS_API_STORAGE_KEY));
      if (stored) return stored;
    } catch {}
  }

  const envBase = cleanApiBase(import.meta.env?.VITE_LOCAL_FITNESS_API_BASE);
  if (envBase) return envBase;

  if (typeof window !== "undefined") {
    const host = window.location?.hostname || "";
    if (host === "fitness-aos.web.app" || host === "fitness-aos.firebaseapp.com") {
      return FUNNEL_FITNESS_API_BASE;
    }
  }

  return DESKTOP_FITNESS_API_BASE;
}

export const LOCAL_FITNESS_API_BASE = resolveLocalFitnessApiBase();
const LOCAL_FITNESS_NOTIFY = `${LOCAL_FITNESS_API_BASE}/notify`;
export function pingBridge() {
  if (import.meta.env.MODE === "coach") return;
  fetch(LOCAL_FITNESS_NOTIFY, { method: "POST" }).catch(() => {});
}
