import { createApproval, setApprovalStatus } from './firestore.js'
import { skillById, skillRequiresApproval } from './brain.js'

function stubPreview(skillId, ctx) {
  const name = ctx.clientName || ctx.name || 'Klient'
  switch (skillId) {
    case 'deep_dive_notes':
      return {
        title: `Deep-Dive · ${name}`,
        preview:
          `Stub-Analyse für ${name}:\n` +
          `• Wiederkehrendes Thema: Konsistenz vs. Perfektionismus (Platzhalter)\n` +
          `• Stärke: Trainingseinheiten werden geloggt\n` +
          `• Offene Frage: Was blockiert die nächste Stufe?\n` +
          `(Bridge offline — lokaler Stub)`,
      }
    case 'create_exercise_sheet':
      return {
        title: `Übungsblatt · ${name}`,
        preview:
          `# Übungsblatt — ${name}\n\n` +
          `Agenda: ${ctx.agenda || ctx.sessionLabel || 'Session heute'}\n\n` +
          `1. Warm-up / Ankommen (2 Min)\n` +
          `2. Hauptblock laut Plan\n` +
          `3. Reflexion: Was war heute 1 % besser?\n`,
      }
    case 'process_call_transcript':
      return {
        title: `Transkript · ${name}`,
        preview:
          `Verarbeitet (Stub):\n` +
          `• Erkenntnis: Klient braucht klarere Wochenziele\n` +
          `• Hausaufgabe: 3× Training + 1 Check-in-Notiz\n` +
          `• Emotion: motiviert, leicht überfordert\n` +
          `Transkript-Länge: ${(ctx.transcript || '').length} Zeichen`,
      }
    case 'onboard_client':
      return {
        title: `Onboarding · ${ctx.name || 'Neu'}`,
        preview:
          `Willkommen ${ctx.name || ''}!\n` +
          `E-Mail: ${ctx.email || '—'}\n` +
          `Paket: ${ctx.package || '—'}\n\n` +
          `Vorbereitet: Fragebogen-Link, Vertragsdaten-Entwurf.\n` +
          `Freigabe nötig vor Versand.`,
      }
    case 'draft_followup_email':
      return {
        title: `Follow-up · ${name}`,
        preview:
          `Betreff: Nach unserer Session\n\n` +
          `Hallo ${name},\n\n` +
          `kurz die Zusammenfassung:\n` +
          `${ctx.sessionSummary || '• (Session-Notizen einfügen)'}\n\n` +
          `Nächster Schritt: …\n\n` +
          `Viele Grüße\nDaniel`,
      }
    case 'draft_checkin_reminder':
      return {
        title: `Check-in · ${name}`,
        preview:
          `Hey ${name}, kurz nachgefragt — wie läuft's seit ${ctx.daysSince || 'einigen'} Tagen?\n` +
          `Brauchst du Unterstützung bei Training oder Alltag?`,
      }
    default:
      return {
        title: skillId,
        preview: `Stub-Ergebnis für ${skillId}.`,
      }
  }
}

async function persistResult(brain, skillId, ctx, { title, preview, engine, requiresApproval }) {
  const skill = skillById(brain.skills, skillId)
  const needsApproval =
    typeof requiresApproval === 'boolean'
      ? requiresApproval
      : skillRequiresApproval(brain.config, skill)

  const item = await createApproval({
    skillId,
    title: title || skillId,
    preview,
    clientId: ctx.clientId || null,
    clientName: ctx.clientName || ctx.name || null,
    meta: { ...ctx, engine: engine || 'stub', stub: engine === 'stub' },
  })

  if (!needsApproval) {
    await setApprovalStatus(item.id, 'ready', { preview })
    return { ...item, status: 'ready', engine }
  }
  return { ...item, engine }
}

export async function runSkillStub(brain, skillId, ctx = {}) {
  const skill = skillById(brain.skills, skillId)
  if (!skill) throw new Error(`Unbekannter Skill: ${skillId}`)
  const { title, preview } = stubPreview(skillId, ctx)
  return persistResult(brain, skillId, ctx, {
    title,
    preview,
    engine: 'stub',
    requiresApproval: skillRequiresApproval(brain.config, skill),
  })
}

/** Call Coach :9150 bridge; fall back to local stub if offline. */
export async function runSkill(brain, skillId, ctx = {}, { engine = 'claude' } = {}) {
  const skill = skillById(brain.skills, skillId)
  if (!skill) throw new Error(`Unbekannter Skill: ${skillId}`)

  try {
    const res = await fetch('/api/csuite/run', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceId: brain.config?.workspaceId || brain.config?.id || 'coo',
        skillId,
        engine,
        context: ctx,
      }),
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      throw new Error(`Bridge ${res.status}: ${detail.slice(0, 240)}`)
    }
    const data = await res.json()
    if (!data?.ok || !data.preview) throw new Error('Bridge ohne preview')
    return persistResult(brain, skillId, ctx, {
      title: data.title,
      preview: data.preview,
      engine: data.engine || engine,
      requiresApproval: data.requiresApproval,
    })
  } catch (err) {
    console.warn('[csuite] bridge failed, stub fallback', err)
    return runSkillStub(brain, skillId, ctx)
  }
}

export async function runChat(brain, message, { engine = 'claude' } = {}) {
  try {
    const res = await fetch('/api/csuite/run', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceId: brain.config?.workspaceId || brain.config?.id || 'coo',
        engine,
        message,
      }),
    })
    if (!res.ok) throw new Error(`Bridge ${res.status}`)
    const data = await res.json()
    if (!data?.preview) throw new Error('leer')
    return { text: data.preview, engine: data.engine || engine }
  } catch (err) {
    console.warn('[csuite] chat bridge failed', err)
    return { text: stubChatReply(message, brain), engine: 'stub' }
  }
}

export async function fetchEngines() {
  try {
    const res = await fetch('/api/csuite/engines', { headers: { Accept: 'application/json' } })
    if (!res.ok) return []
    const data = await res.json()
    return Array.isArray(data?.engines) ? data.engines : []
  } catch {
    return []
  }
}

export function stubChatReply(userText, brain) {
  const focus = brain.config?.focus || 'Coaching-Delivery'
  return (
    `[COO Stub · ${focus}]\n` +
    `Verstanden: „${String(userText).slice(0, 200)}".\n` +
    `Bridge offline — Skill-Buttons nutzen oder Freigaben rechts prüfen.`
  )
}
