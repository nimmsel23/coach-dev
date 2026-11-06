/**
 * useSessionActivity — Activity-Finisher-State, aus useSession.js
 * herausgelöst (PHASE3_TODO.md Stück 4, rein mechanisch, keine
 * Logik/Werte verändert).
 *
 * `activity`/`hasActivity` ist der lokale Editier-Draft (Cardio-Session
 * ODER Finisher am Ende einer Kraft-Session). `activityAddons` ist reine
 * Anzeige/Lösch-Historie bereits gespeicherter Finisher desselben Tages
 * (Merge-Historie, siehe activityAddons in fitness/api/routers/sessions.py)
 * — kein Editier-State, deshalb kein eigener scheduleAutoSave-Trigger hier.
 * `date` kommt bewusst als Parameter herein statt als eigener State: die
 * Datums-Hoheit bleibt beim Haupthook (useSession.js), dieser Hook bekommt
 * bei jedem Render nur den aktuellen Wert gereicht (removeActivityAddon
 * braucht ihn für den API-Call).
 */

import { useState } from 'react';
import { deleteActivityAddon } from '@db';

const DEFAULT_ACTIVITY = { type: 'hiit', duration: '', distanceKm: '', notes: '', muscleTarget: 'core', muscles: ['core'] };

export { DEFAULT_ACTIVITY };

export function useSessionActivity({ date }) {
  const [activity, setActivity] = useState({ ...DEFAULT_ACTIVITY });
  const [hasActivity, setHasActivity] = useState(false);
  // Bereits gespeicherte Finisher dieser Tages-Session (Merge-Historie,
  // siehe activityAddons in fitness/api/routers/sessions.py) — nur Anzeige/
  // Löschen, kein Editier-State wie `activity` oben.
  const [activityAddons, setActivityAddons] = useState([]);

  // Löscht einen einzelnen Finisher aus der bereits gespeicherten
  // activityAddons-Historie (nicht den gerade im Formular editierten
  // `activity`-Draft — der lebt nur lokal bis zum nächsten Save).
  async function removeActivityAddon(index) {
    const result = await deleteActivityAddon(date, index);
    if (result?.ok) setActivityAddons(result.activityAddons || []);
    return result;
  }

  return {
    activity, setActivity,
    hasActivity, setHasActivity,
    activityAddons, setActivityAddons,
    removeActivityAddon,
  };
}
