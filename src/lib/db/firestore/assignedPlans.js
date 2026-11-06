import { db } from '../../../firebase.js'
import {
  doc,
  collection,
  query,
  where,
} from 'firebase/firestore';
import { getDoc, setDoc, getDocs, updateDoc } from './offline.js';// Get all plans assigned to current user (as client)
export async function getAssignedPlans(clientUid) {
  try {
    const plansRef = collection(db, 'fitness', clientUid, 'wf_workouts')
    const q = query(plansRef, where('assignedTo', '==', clientUid))
    const snap = await getDocs(q)
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
  } catch (error) {
    console.error('Error fetching assigned plans:', error)
    return []
  }
}

// Get coach's assigned plans for a specific client
export async function getCoachAssignedPlans(coachUid, clientUid) {
  try {
    const plansRef = collection(db, 'fitness', clientUid, 'wf_workouts')
    const q = query(
      plansRef,
      where('createdBy', '==', coachUid),
      where('assignedTo', '==', clientUid)
    )
    const snap = await getDocs(q)
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
  } catch (error) {
    console.error('Error fetching coach assigned plans:', error)
    return []
  }
}

// Assign a plan to a client (coach action). `plan` is either an existing
// planId (legacy — updates an already-existing wf_workouts doc) or a full
// plan object (coach built it locally and pushes it as a new doc).
export async function assignPlanToClient(coachUid, clientUid, plan) {
  try {
    if (typeof plan === 'string') {
      const planRef = doc(db, 'fitness', clientUid, 'wf_workouts', plan)
      await updateDoc(planRef, {
        createdBy: coachUid,
        assignedTo: clientUid,
        assignedAt: new Date().toISOString(),
      })
      return true
    }

    const { id, ...rest } = plan || {}
    const planId = id || doc(collection(db, 'fitness', clientUid, 'wf_workouts')).id
    const planRef = doc(db, 'fitness', clientUid, 'wf_workouts', planId)
    await setDoc(planRef, {
      ...rest,
      createdBy: coachUid,
      assignedTo: clientUid,
      assignedAt: new Date().toISOString(),
    }, { merge: true })
    return true
  } catch (error) {
    console.error('Error assigning plan:', error)
    return false
  }
}

// Get completion status for a plan on a specific date
export async function getPlanCompletions(clientUid, planId, date) {
  try {
    const completionRef = doc(db, 'fitness', clientUid, 'wf_workouts', planId, 'completions', date)
    const snap = await getDoc(completionRef)
    return snap.exists() ? snap.data() : null
  } catch (error) {
    console.error('Error fetching plan completions:', error)
    return null
  }
}

// Mark exercises as done/not done in a plan for a specific date
export async function updatePlanCompletions(clientUid, planId, date, doneExerciseIds) {
  try {
    const completionRef = doc(db, 'fitness', clientUid, 'wf_workouts', planId, 'completions', date)
    await setDoc(completionRef, {
      date,
      doneExerciseIds: Array.isArray(doneExerciseIds) ? doneExerciseIds : [],
      completedAt: new Date().toISOString(),
    }, { merge: true })
    return true
  } catch (error) {
    console.error('Error updating plan completions:', error)
    return false
  }
}

// Toggle a single exercise in a plan for a date
export async function toggleExerciseCompletion(clientUid, planId, date, exerciseId) {
  try {
    const completionRef = doc(db, 'fitness', clientUid, 'wf_workouts', planId, 'completions', date)
    const snap = await getDoc(completionRef)
    const currentDone = snap.exists() ? (snap.data().doneExerciseIds || []) : []

    const newDone = currentDone.includes(exerciseId)
      ? currentDone.filter(id => id !== exerciseId)
      : [...currentDone, exerciseId]

    await setDoc(completionRef, {
      date,
      doneExerciseIds: newDone,
      completedAt: new Date().toISOString(),
    }, { merge: true })

    return true
  } catch (error) {
    console.error('Error toggling exercise completion:', error)
    return false
  }
}

// Get completion progress for coach view
export async function getClientPlanProgress(clientUid, planId) {
  try {
    const planRef = doc(db, 'fitness', clientUid, 'wf_workouts', planId)
    const planSnap = await getDoc(planRef)
    if (!planSnap.exists()) return null

    const today = new Date().toISOString().split('T')[0]
    const completionRef = doc(db, 'fitness', clientUid, 'wf_workouts', planId, 'completions', today)
    const completionSnap = await getDoc(completionRef)

    const planData = planSnap.data()
    const completionData = completionSnap.exists() ? completionSnap.data() : null
    const exercises = planData.exercises || []
    const doneCount = completionData?.doneExerciseIds?.length || 0

    return {
      planId,
      planName: planData.name || 'Unnamed Plan',
      totalExercises: exercises.length,
      doneExercises: doneCount,
      completionPercentage: exercises.length > 0 ? Math.round((doneCount / exercises.length) * 100) : 0,
      lastUpdate: completionData?.completedAt || null,
    }
  } catch (error) {
    console.error('Error fetching plan progress:', error)
    return null
  }
}
