// Coaching Notes ("WhatsApp Wisdom Drops") — coach-verfasste Erklärstücke
// (Trainingsmethoden, Faustregeln), aus fitness/catalog/kb/coaching_notes/
// zur Build-Zeit generiert (siehe scripts/build-coaching-notes.mjs). Gleiches
// Prinzip wie sixpackData/exerciseBulkData: seltene Änderungen, kein Firestore-
// Sync nötig, funktioniert offline in beiden Build-Varianten identisch.
import { COACHING_NOTES } from './coachNotesData.generated';

export function getCoachingNotesByTag(tag) {
  if (!tag) return [];
  const needle = tag.toLowerCase();
  return COACHING_NOTES.filter((note) => {
    const tags = (note.tags || []).map((t) => String(t).toLowerCase());
    const activityTypes = (note.applies_to?.activity_types || []).map((t) => String(t).toLowerCase());
    const topics = (note.applies_to?.topics || []).map((t) => String(t).toLowerCase());
    return tags.includes(needle) || activityTypes.includes(needle) || topics.includes(needle);
  });
}

export function getCoachingNote(id) {
  return COACHING_NOTES.find((note) => note.id === id) || null;
}

export function getAllCoachingNotes() {
  return COACHING_NOTES;
}
