/**
 * firestore/devices.js — users/{uid}/devices/{deviceId}
 *
 * App-übergreifende Geräteliste (gleiches Schema wie fuel-dev
 * `src/client/lib/db/firestore/devices.js`): `app` = anlegende App,
 * app-spezifische Geräte-Wahlen unter `prefs.<app>`. Die Geräte-ID liegt im
 * localStorage und gilt pro Origin — dasselbe Telefon hat in fuel und fitness
 * daher zwei Einträge.
 */

import {
  doc,
  serverTimestamp,
} from "firebase/firestore";
import { getDoc, setDoc } from "./offline.js";
import { db } from "../../../firebase.js";
import { getUid } from "./core.js";

import { describeDevice } from "../../deviceInfo.js";

const APP = "fitness";
const DEVICE_ID_KEY = "fitness-device-id";

export function getDeviceId() {
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    return null;
  }
}

export async function getDevice() {
  const id = getDeviceId();
  if (!id) return null;
  const snap = await getDoc(doc(db, "users", getUid(), "devices", id));
  return snap.exists() ? snap.data() : null;
}

// Legt das Gerät beim ersten Login an, danach nur last_seen_at; prefs = Geräte-Wahlen dieser App.
export async function registerDevice(prefs = null) {
  const id = getDeviceId();
  if (!id) return;
  try {
    const existing = await getDevice();
    await setDoc(doc(db, "users", getUid(), "devices", id), {
      app: APP,
      ...(prefs ? { prefs: { [APP]: prefs } } : {}),
      label: describeDevice(),
      ...(existing?.registered_at ? {} : { registered_at: serverTimestamp() }),
      last_seen_at: serverTimestamp(),
    }, { merge: true });
  } catch (error) {
    console.error("Geräte-Registrierung fehlgeschlagen:", error);
  }
}
