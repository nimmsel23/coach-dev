import { createInboxDraft, describeCoachError, reenrichInbox, saveExercise } from '@db'
import { sourceIds } from './db/shared/catalogSources.js'

export function exerciseKey(ex) {
  return String(ex?.exercise_id || ex?.id || '')
}

export function exerciseLabel(ex) {
  return ex?.display_name || ex?.name || ex?.german || exerciseKey(ex) || 'Übung'
}

export function draftSlug(ex) {
  const raw = exerciseKey(ex).replace(/^(wger_|yuhonas_|inbox_)/i, '').trim()
  if (raw) return raw.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
  return exerciseLabel(ex).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || null
}

export function isArchivedExercise(ex) {
  const tags = Array.isArray(ex?.tags) ? ex.tags : []
  return Boolean(ex?.archived || tags.includes('archived'))
}

function withArchivedTag(ex, archived) {
  const tags = Array.isArray(ex?.tags) ? ex.tags.filter((tag) => tag !== 'archived') : []
  if (archived) tags.push('archived')
  return {
    ...ex,
    exercise_id: exerciseKey(ex),
    id: exerciseKey(ex),
    tags,
    archived: Boolean(archived),
    archived_at: archived ? new Date().toISOString() : null,
  }
}

export async function renameCatalogExercise(ex, nextName) {
  const name = String(nextName || '').trim()
  if (!name) throw new Error('Name fehlt')
  const id = exerciseKey(ex)
  if (!id) throw new Error('missing_id')
  const payload = {
    ...ex,
    exercise_id: id,
    id,
    display_name: name,
    german: name,
    name,
  }
  const result = await saveExercise(id, payload)
  if (!result?.ok) throw new Error(result?.error || 'Umbenennen fehlgeschlagen')
  return { ...payload, ...(result.exercise || {}) }
}

export async function archiveCatalogExercise(ex, archived = true) {
  const id = exerciseKey(ex)
  if (!id) throw new Error('missing_id')
  const payload = withArchivedTag(ex, archived)
  const result = await saveExercise(id, payload)
  if (!result?.ok) throw new Error(result?.error || 'Archivieren fehlgeschlagen')
  return { ...payload, ...(result.exercise || {}) }
}

/** Erzeugt Inbox-Draft und optional sofortiges Enrichment. Approve bleibt manuell. */
export async function requeueCatalogExercise(ex, { enrich = true } = {}) {
  const id = exerciseKey(ex)
  const displayName = exerciseLabel(ex)
  const draft = await createInboxDraft({
    display_name: displayName,
    exercise_id: draftSlug(ex) || id,
    wger_id: sourceIds(ex, 'wger', true)[0] || null,
    yuhonas_id: sourceIds(ex, 'yuhonas', true)[0] || null,
    force: true,
  })
  if (!draft?.ok && !draft?.id) {
    throw new Error(describeCoachError(draft, 'Inbox-Draft fehlgeschlagen'))
  }
  const draftId = draft.id || `inbox_${draftSlug(ex) || id}`
  if (!enrich) return { draft, enriched: null }
  const enriched = await reenrichInbox(draftId, null, {
    exercise_id: draftSlug(ex) || id,
    display_name: displayName,
    file_id: draftId,
  })
  return { draft, enriched }
}
