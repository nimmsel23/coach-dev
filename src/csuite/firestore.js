/**
 * C-Suite state: Firestore `csuite/coo/...` with localStorage fallback.
 * MVP: no rules deploy yet — write Firestore when possible, else persist locally.
 */

import {
  collection,
  doc,
  addDoc,
  updateDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore'
import { db, auth } from '../firebase.js'

const ROLE = 'coo'
const LS_APPROVALS = 'csuite-coo-approvals-v1'
const LS_THREAD = 'csuite-coo-thread-v1'

function nowIso() {
  return new Date().toISOString()
}

function readLs(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

function writeLs(key, value) {
  localStorage.setItem(key, JSON.stringify(value))
}

function uid() {
  return `local_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function canUseFirestore() {
  try {
    return Boolean(db && auth?.currentUser)
  } catch {
    return false
  }
}

function approvalsCol() {
  return collection(db, 'csuite', ROLE, 'approvals')
}

function threadDoc() {
  return doc(db, 'csuite', ROLE, 'threads', 'main')
}

/** Subscribe to approvals. Callback receives array sorted newest-first. */
export function watchApprovals(onChange) {
  if (!canUseFirestore()) {
    const emit = () => onChange(readLs(LS_APPROVALS, []))
    emit()
    const handler = (e) => {
      if (e.key === LS_APPROVALS || e.type === 'csuite-approvals') emit()
    }
    window.addEventListener('storage', handler)
    window.addEventListener('csuite-approvals', handler)
    return () => {
      window.removeEventListener('storage', handler)
      window.removeEventListener('csuite-approvals', handler)
    }
  }

  const q = query(approvalsCol(), orderBy('createdAt', 'desc'))
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      onChange(items)
    },
    () => {
      // Permission denied → local fallback
      onChange(readLs(LS_APPROVALS, []))
    },
  )
}

export async function createApproval(payload) {
  const item = {
    status: 'pending_approval',
    skillId: payload.skillId,
    title: payload.title,
    preview: payload.preview,
    clientId: payload.clientId || null,
    clientName: payload.clientName || null,
    meta: payload.meta || {},
    createdAt: nowIso(),
    updatedAt: nowIso(),
  }

  if (canUseFirestore()) {
    try {
      const ref = await addDoc(approvalsCol(), {
        ...item,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      return { id: ref.id, ...item }
    } catch (err) {
      console.warn('[csuite] Firestore createApproval failed, using local', err)
    }
  }

  const local = { id: uid(), ...item }
  const list = [local, ...readLs(LS_APPROVALS, [])]
  writeLs(LS_APPROVALS, list)
  window.dispatchEvent(new Event('csuite-approvals'))
  return local
}

export async function setApprovalStatus(id, status, edits = {}) {
  const patch = {
    status,
    updatedAt: nowIso(),
    ...edits,
  }

  if (canUseFirestore() && !String(id).startsWith('local_')) {
    try {
      await updateDoc(doc(db, 'csuite', ROLE, 'approvals', id), {
        ...patch,
        updatedAt: serverTimestamp(),
      })
      return
    } catch (err) {
      console.warn('[csuite] Firestore setApprovalStatus failed, using local', err)
    }
  }

  const list = readLs(LS_APPROVALS, []).map((a) => (a.id === id ? { ...a, ...patch } : a))
  writeLs(LS_APPROVALS, list)
  window.dispatchEvent(new Event('csuite-approvals'))
}

export function loadThreadMessages() {
  return readLs(LS_THREAD, [])
}

export function appendThreadMessage(role, content) {
  const list = [...loadThreadMessages(), { id: uid(), role, content, at: nowIso() }]
  writeLs(LS_THREAD, list.slice(-80))
  return list
}

export function clearThread() {
  writeLs(LS_THREAD, [])
}

/** Placeholder for future Firestore thread sync */
export { threadDoc }
