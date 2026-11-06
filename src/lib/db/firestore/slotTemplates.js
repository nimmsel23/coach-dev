/**
 * firestore/slotTemplates.js — wiederverwendbare Session-Slot-Bausteine pro Block.
 */

import {
  collection,
  doc,
  query,
  where,
  serverTimestamp,
} from "firebase/firestore";
import { setDoc, getDocs, deleteDoc } from "./offline.js";

import { db } from "../../../firebase.js";
import { getUid, hasAuthSession } from "./core.js";
import {
  getSlotTemplates as getLocalSlotTemplates,
  saveSlotTemplate as saveLocalSlotTemplate,
  deleteSlotTemplate as deleteLocalSlotTemplate,
} from "../local/slotTemplates.js";

export async function getSlotTemplates(block = null) {
  if (!hasAuthSession()) return getLocalSlotTemplates(block);
  const col = collection(db, "fitness", getUid(), "slotTemplates");
  const q = block ? query(col, where("block", "==", block)) : col;
  const snap = await getDocs(q);
  return snap.docs.map(d => d.data());
}

export async function saveSlotTemplate(template) {
  if (!hasAuthSession()) return saveLocalSlotTemplate(template);
  await setDoc(doc(db, "fitness", getUid(), "slotTemplates", template.id), {
    ...template,
    updated_at: serverTimestamp(),
  });
  return { ok: true };
}

export async function deleteSlotTemplate(id) {
  if (!hasAuthSession()) return deleteLocalSlotTemplate(id);
  await deleteDoc(doc(db, "fitness", getUid(), "slotTemplates", id));
  return { ok: true };
}
