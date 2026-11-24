/**
 * Shared C-Suite dashboard runtime (ESM).
 * Git-brain stays file-based; this only backs HITL queue + auth awareness.
 */
import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js'
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js'
import {
  getFirestore,
  collection,
  doc,
  addDoc,
  setDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js'

const firebaseConfig = {
  apiKey: 'AIzaSyD1hvp2UYrvizLOzoSqOX-bwRWcCpJVAlg',
  authDomain: 'fitness-aos.firebaseapp.com',
  projectId: 'fitness-aos',
  storageBucket: 'fitness-aos.firebasestorage.app',
  messagingSenderId: '842575255284',
  appId: '1:842575255284:web:65c4831683a893c110f0a1',
}

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig)
const auth = getAuth(app)
const db = getFirestore(app)

function readLs(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback
  } catch {
    return fallback
  }
}

function writeLs(key, value) {
  localStorage.setItem(key, JSON.stringify(value))
}

/**
 * @param {string} roleId
 * @param {{ queueKey: string, onQueue?: (items: any[]) => void }} opts
 */
export function createFirebaseAdapter(roleId, opts) {
  const queueKey = opts.queueKey
  const state = {
    mode: 'mock',
    user: null,
    unsub: null,
  }

  function approvalsCol() {
    return collection(db, 'csuite', roleId, 'approvals')
  }

  const adapter = {
    get mode() {
      return state.mode
    },
    get user() {
      return state.user
    },
    async connect() {
      return new Promise((resolve) => {
        const done = (mode, note) => {
          state.mode = mode
          resolve({ ok: true, mode, note, user: state.user })
        }
        // Parent CEO portal may announce auth; also watch same-origin persistence.
        onAuthStateChanged(auth, async (user) => {
          state.user = user
          if (!user) {
            if (state.unsub) {
              state.unsub()
              state.unsub = null
            }
            done('mock', 'Nicht angemeldet — localStorage')
            return
          }
          try {
            if (state.unsub) state.unsub()
            const q = query(approvalsCol(), orderBy('createdAt', 'desc'))
            state.unsub = onSnapshot(
              q,
              (snap) => {
                const items = snap.docs.map((d) => {
                  const data = d.data() || {}
                  return {
                    id: d.id,
                    ...data,
                    createdAt:
                      typeof data.createdAt === 'string'
                        ? data.createdAt
                        : data.createdAt?.toDate?.()?.toISOString?.() || new Date().toISOString(),
                  }
                })
                writeLs(queueKey, items)
                opts.onQueue?.(items)
              },
              (err) => {
                console.warn('[csuite] Firestore listen failed → localStorage', err)
                state.mode = 'mock'
                opts.onQueue?.(readLs(queueKey, []))
              },
            )
            done('firestore', `Auth ${user.email || user.uid}`)
          } catch (err) {
            console.warn('[csuite] Firestore connect failed', err)
            done('mock', String(err?.message || err))
          }
        })
      })
    },
    async listApprovals() {
      return readLs(queueKey, [])
    },
    async upsertApproval(item) {
      if (state.mode === 'firestore' && state.user) {
        try {
          const payload = {
            status: item.status || 'pending_approval',
            skillId: item.skillId || '',
            title: item.title || '',
            preview: item.preview || '',
            clientId: item.clientId || null,
            clientName: item.clientName || null,
            meta: item.meta || {},
            updatedAt: serverTimestamp(),
            ownerUid: state.user.uid,
          }
          if (item.id && !String(item.id).startsWith('local_')) {
            await setDoc(doc(db, 'csuite', roleId, 'approvals', item.id), payload, { merge: true })
            return { ...item, ...payload }
          }
          const ref = await addDoc(approvalsCol(), {
            ...payload,
            createdAt: serverTimestamp(),
          })
          return { ...item, id: ref.id }
        } catch (err) {
          console.warn('[csuite] upsertApproval Firestore failed', err)
          state.mode = 'mock'
        }
      }
      const list = readLs(queueKey, [])
      const i = list.findIndex((x) => x.id === item.id)
      if (i >= 0) list[i] = item
      else list.unshift(item)
      writeLs(queueKey, list)
      window.dispatchEvent(new Event('csuite-approvals'))
      return item
    },
    async removeApproval(id) {
      if (state.mode === 'firestore' && state.user && id && !String(id).startsWith('local_')) {
        try {
          await deleteDoc(doc(db, 'csuite', roleId, 'approvals', id))
        } catch (err) {
          console.warn('[csuite] removeApproval Firestore failed', err)
        }
      }
      writeLs(
        queueKey,
        readLs(queueKey, []).filter((x) => x.id !== id),
      )
      window.dispatchEvent(new Event('csuite-approvals'))
    },
  }

  window.addEventListener('message', (event) => {
    if (event.origin !== window.location.origin) return
    const data = event.data
    if (!data || data.type !== 'csuite-auth') return
    // Auth cookie/IndexedDB is shared same-origin; message is a nudge + audit trail.
    if (data.email || data.uid) {
      console.info('[csuite] parent auth', data.email || data.uid)
    }
  })

  return adapter
}

export async function copyText(text) {
  const value = String(text || '')
  try {
    await navigator.clipboard.writeText(value)
    return true
  } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = value
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      ta.remove()
      return true
    } catch {
      return false
    }
  }
}

export function mailtoDraft(preview, title = 'Entwurf') {
  const body = encodeURIComponent(preview || '')
  const subject = encodeURIComponent(title || 'Freigabe')
  return `mailto:?subject=${subject}&body=${body}`
}
