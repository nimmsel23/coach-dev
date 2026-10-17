/**
 * firestore/user.js — User settings, layout, body entries, and profile for Firestore.
 */

import {
  collection, doc, setDoc, getDoc, getDocs,
  query, orderBy, limit, serverTimestamp,
} from "firebase/firestore";

import { db } from "../../../firebase.js";
import { getUid, hasAuthSession } from "./core.js";
import {
  getSettings as getLocalSettings,
  saveSettings as saveLocalSettings,
  getLayout as getLocalLayout,
  saveLayout as saveLocalLayout,
  getPushSettings as getLocalPushSettings,
  savePushSettings as saveLocalPushSettings,
  getBodyEntry as getLocalBodyEntry,
  saveBodyEntry as saveLocalBodyEntry,
  getBodyEntries as getLocalBodyEntries,
} from "../local/user.js";

// ── Settings ──────────────────────────────────────────────────────────────────

export async function getSettings() {
  if (!hasAuthSession()) return getLocalSettings();
  const snap = await getDoc(doc(db, "fitness", getUid(), "settings", "general"));
  if (!snap.exists()) return { theme: "honey", themeMode: "manual" };
  return snap.data();
}

export async function saveSettings(settings) {
  if (!hasAuthSession()) return saveLocalSettings(settings);
  await setDoc(doc(db, "fitness", getUid(), "settings", "general"), {
    ...settings,
    updated_at: serverTimestamp(),
  });
  return { ok: true };
}

// ── Layout ────────────────────────────────────────────────────────────────────

export async function getLayout() {
  if (!hasAuthSession()) return getLocalLayout();
  const snap = await getDoc(doc(db, "fitness", getUid(), "settings", "layout"));
  if (!snap.exists()) return null;
  return snap.data()?.layout;
}

export async function saveLayout(layout) {
  if (!hasAuthSession()) return saveLocalLayout(layout);
  await setDoc(doc(db, "fitness", getUid(), "settings", "layout"), {
    layout,
    updated_at: serverTimestamp(),
  });
  return { ok: true };
}

export async function getPushSettings() {
  if (!hasAuthSession()) return getLocalPushSettings();
  const snap = await getDoc(doc(db, "fitness", getUid(), "settings", "push"));
  if (!snap.exists()) {
    return {
      enabled: false,
      tokens: [],
      types: {},
      reminderTime: "18:00",
    };
  }
  const data = snap.data() || {};
  const tokens = Array.from(new Set([
    ...(Array.isArray(data.tokens) ? data.tokens : []),
    ...(data.token ? [data.token] : []),
  ].filter(Boolean)));
  return {
    enabled: false,
    types: {},
    reminderTime: "18:00",
    ...data,
    token: tokens[0] || data.token || null,
    tokens,
  };
}

export async function savePushSettings(settings) {
  if (!hasAuthSession()) return saveLocalPushSettings(settings);
  await setDoc(doc(db, "fitness", getUid(), "settings", "push"), {
    ...settings,
    tokens: Array.from(new Set([
      ...(Array.isArray(settings?.tokens) ? settings.tokens : []),
      ...(settings?.token ? [settings.token] : []),
    ].filter(Boolean))),
    updated_at: serverTimestamp(),
  });
  return { ok: true };
}

// ── Body entries ──────────────────────────────────────────────────────────────

export async function getBodyEntry(date) {
  if (!hasAuthSession()) return getLocalBodyEntry(date);
  const snap = await getDoc(doc(db, "fitness", getUid(), "body", date));
  if (!snap.exists()) return null;
  return snap.data();
}

export async function saveBodyEntry(date, data) {
  if (!hasAuthSession()) return saveLocalBodyEntry(date, data);
  await setDoc(doc(db, "fitness", getUid(), "body", date), {
    ...data,
    date,
    saved_at: serverTimestamp(),
  });
  return { ok: true };
}

export async function getBodyEntries(days = 30) {
  if (!hasAuthSession()) return getLocalBodyEntries(days);
  const q = query(
    collection(db, "fitness", getUid(), "body"),
    orderBy("date", "desc"),
    limit(days),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data());
}

// ── User profile ──────────────────────────────────────────────────────────────

// Gemeinsames Profil (app-übergreifend, fuel/fitness/vitalos): users/{uid}/meta/profile.
// Nur Felder mit gleicher Bedeutung in jeder App; Anamnese/clientStatus/Coach-Daten
// bleiben in fitness/{uid}/profile/metadata (Coach-Panel liest dort).
const SHARED_PROFILE_FIELDS = ["gender", "age", "heightCm", "weightKg", "chronicConditions", "medications"];

function pickShared(data) {
  const out = {};
  for (const k of SHARED_PROFILE_FIELDS) if (data?.[k] !== undefined && data[k] !== null && data[k] !== "") out[k] = data[k];
  if (out.gender === "male") out.gender = "m";
  if (out.gender === "female") out.gender = "f";
  return out;
}

export async function getUserProfile(uid) {
  if (!uid) return null;
  try {
    const [legacySnap, sharedSnap] = await Promise.all([
      getDoc(doc(db, "fitness", uid, "profile", "metadata")),
      getDoc(doc(db, "users", uid, "meta", "profile")),
    ]);
    const legacy = legacySnap.exists() ? legacySnap.data() : null;
    const shared = sharedSnap.exists() ? pickShared(sharedSnap.data()) : {};
    // Gemeinsames Profil gewinnt; fehlende Felder werden einmalig aus dem Altbestand übernommen.
    const backfill = {};
    for (const [k, v] of Object.entries(pickShared(legacy))) if (shared[k] === undefined) backfill[k] = v;
    if (Object.keys(backfill).length && uid === getUid()) {
      try {
        await setDoc(doc(db, "users", uid, "meta", "profile"), { ...backfill, updated_at: serverTimestamp() }, { merge: true });
      } catch (error) {
        console.error("Profil-Backfill fehlgeschlagen:", error);
      }
    }
    if (!legacy && !Object.keys(shared).length) return null;
    return { ...legacy, ...backfill, ...shared };
  } catch (error) {
    console.error("Fehler beim Laden des Profils:", error);
    return null;
  }
}

export async function updateUserProfile(uid, data) {
  if (!uid) return false;
  try {
    await setDoc(doc(db, "fitness", uid, "profile", "metadata"), {
      ...data,
      updated_at: serverTimestamp(),
    }, { merge: true });
    const shared = pickShared(data);
    if (Object.keys(shared).length) {
      await setDoc(doc(db, "users", uid, "meta", "profile"), {
        ...shared,
        updated_at: serverTimestamp(),
      }, { merge: true });
    }
    return true;
  } catch (error) {
    console.error("Fehler beim Speichern des Profils:", error);
    return false;
  }
}
