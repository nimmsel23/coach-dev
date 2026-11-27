import { api } from './runtime.js'
import { renderMarkdown } from './markdown.js'

let selected = null
let selectedEvent = null
export function selectedClientContext() { return selected ? { ...selected, ...selectedEvent } : null }
const escape = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
const when = value => !value ? 'Zeit fehlt' : value.length === 10 ? value : new Date(value).toLocaleString('de-AT', { dateStyle: 'short', timeStyle: 'short' })
const date = value => value ? String(value).slice(0, 10) : 'Datum fehlt'

export async function mountCooFrontdoor(root, { onAction, onSelect }) {
  let selection = 0
  let snapshot = null
  let logRevision = null
  root.innerHTML = '<p>Klienten und Arbeitsstand werden geladen …</p>'
  async function loadClient(id) {
    const request = ++selection
    selected = null
    selectedEvent = null
    const eventSelect = root.querySelector("#coo-event")
    if (eventSelect) eventSelect.value = ""
    snapshot = null
    logRevision = null
    onSelect()
    const panel = root.querySelector('#coo-context')
    panel.innerHTML = '<p role="status">Klientenstand wird geladen …</p>'
    try {
      const data = await api(`/coo/clients/${encodeURIComponent(id)}/context`)
      if (request !== selection) return
      selected = { clientId: data.client.id, expectedContextRevision: data.revision }
      snapshot = data
      const eventSelect = root.querySelector("#coo-event")
      if (eventSelect) eventSelect.disabled = false
      onSelect()
      const labels = { available: 'Vorhanden', empty: 'Noch keine Einträge', error: 'Lesefehler', 'not-linked': 'Nicht zugeordnet', 'not-synced': 'Kein lokaler Datenstand' }
      panel.innerHTML = `
        <div class="coo-context-head"><div><h3>${escape(data.client.name)}</h3><p class="sub">${data.client.role === 'contact' ? 'Kontakt' : 'Klient'} · Stand geladen ${new Date(data.checkedAt).toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' })}</p></div><a class="btn ghost" href="/k/${encodeURIComponent(id)}">Klientenakte öffnen</a></div>
        <div class="actions coo-actions">
          <button class="btn ok" data-coo-action="prepare">Gespräch vorbereiten</button>
          <button class="btn" data-coo-action="review">Trainingsstand prüfen</button>
          <button class="btn" data-coo-action="followup">Follow-up entwerfen</button>
          <button class="btn" data-coo-log>Trainingsverlauf & frühere Entwürfe</button>
          <button class="btn ghost" data-coo-refresh>Stand neu laden</button>
        </div>
        <p class="hint">Beim Start werden die unten aufgeführten Klientendaten mit dem oben gewählten KI-Modell verarbeitet. Das Ergebnis erscheint zur Prüfung.</p>
        <div data-coo-log-panel></div>
        <div class="coo-context-grid">
          <section><h4>Letzte Notizen</h4>${data.notes.length ? data.notes.map(note => `<p><strong>${escape(date(note.date))}</strong><br>${escape(note.text)}</p>`).join('') : '<p>Keine datierten Coaching-Notizen vorhanden.</p>'}
          ${data.memo.length ? `<details><summary>Klienten-Merkblatt lesen</summary><pre>${escape(data.memo[0].text)}</pre></details>` : '<p>Kein Klienten-Merkblatt hinterlegt.</p>'}</section>
          <section><h4>Letzte gespeicherte Trainings</h4>${data.workouts.length ? `<ul>${data.workouts.map(item => `<li>${escape(date(item.finishedAt))} · ${escape(item.name)}</li>`).join('')}</ul>` : '<p>Keine gespeicherten Trainings in den gelesenen Quellen.</p>'}
          <h4>Trainingspläne</h4>${data.plans.length ? `<ul>${data.plans.map(item => `<li>${escape(item.name)} · ${({ published: 'Freigegeben', draft: 'Entwurf', archived: 'Archiviert' })[item.status] || escape(item.status)} · Version ${escape(item.version)}<br><span class="hint">Geändert ${escape(date(item.updatedAt))}${item.deliveredAt ? ` · übergeben ${escape(date(item.deliveredAt))}` : ' · keine Übergabe dokumentiert'}</span></li>`).join('')}</ul>` : '<p>Kein lokaler Trainingsplan vorhanden.</p>'}</section>
          <section><h4>Dokumentierte offene Punkte</h4>${data.followups.length ? `<ul>${data.followups.map(item => `<li>${escape(item.text)} <span class="hint">(${escape(item.source)})</span></li>`).join('')}</ul>` : '<p>Keine offenen Checkboxen in den gelesenen Notizen. Das ist keine Bestätigung, dass alles erledigt ist.</p>'}
          <details><summary>Verwendete Quellen</summary><ul>${data.sources.map(source => `<li>${escape(source.label)}: ${labels[source.status] || escape(source.status)}${source.message ? ` — ${escape(source.message)}` : ''}</li>`).join('')}</ul></details></section>
        </div>`
    } catch (error) {
      if (request !== selection) return
      panel.innerHTML = `<p role="alert">Klientenstand nicht verfügbar: ${escape(error.message)}</p><button class="btn" data-coo-refresh>Erneut laden</button>`
    }
  }
  try {
    const data = await api('/coo/overview')
    root.innerHTML = `<nav class="actions" aria-label="Arbeitsbereiche"><a class="btn ghost" href="/workspace/">Workspace öffnen</a><a class="btn ghost" href="/coach/local.html">Trainingsplanung öffnen</a></nav><div class="coo-roster"><label>Klient oder Kontakt<select id="coo-client"><option value="">Bitte auswählen</option>${data.clients.map(client => `<option value="${escape(client.id)}">${escape(client.name)}${client.role === 'contact' ? ' · Kontakt' : ''}${client.openJobs ? ` · ${client.openJobs} offen` : ''}</option>`).join('')}</select></label><div id="coo-calendar"><strong>Termine</strong><p>Google-Kalender wird geladen …</p></div></div><div id="coo-context"><p>${data.clients.length ? 'Wähle einen Klienten. Der COO lädt seine vorhandenen Unterlagen.' : 'Keine sichtbaren Klienten in der vorhandenen Registry.'}</p></div>`
    root.querySelector('#coo-client').addEventListener('change', event => {
      if (event.target.value) loadClient(event.target.value)
      else { selection++; selected = null; selectedEvent = null; snapshot = null; if (root.querySelector("#coo-event")) root.querySelector("#coo-event").disabled = true; root.querySelector('#coo-context').innerHTML = '<p>Bitte einen Klienten auswählen.</p>'; onSelect() }
    })
    async function loadCalendar(refresh = false) {
      const panel = root.querySelector('#coo-calendar')
      panel.innerHTML = '<strong>Termine</strong><p role="status">Google-Kalender wird geladen …</p>'
      selectedEvent = null
      try {
        const calendar = await api(`/coo/calendar?refresh=${refresh}`)
        panel.innerHTML = `<strong>Google-Termine</strong><p>${escape(calendar.message)}</p>${calendar.status === 'connected' ? `<label>Termin für den ausgewählten Klienten<select id="coo-event" ${selected ? '' : 'disabled'}><option value="">Ohne bestätigten Termin vorbereiten</option>${calendar.events.map(item => `<option value="${escape(item.id)}">${escape(when(item.start))} · ${escape(item.title)}</option>`).join('')}</select></label>` : ''}<button class="btn ghost" data-calendar-refresh>Kalender neu laden</button>`
        panel.querySelector('[data-calendar-refresh]').addEventListener('click', () => loadCalendar(true))
        panel.querySelector('#coo-event')?.addEventListener('change', event => {
          const item = calendar.events.find(row => row.id === event.target.value)
          selectedEvent = item ? { eventId: item.id, expectedEventRevision: item.revision } : null
        })
      } catch (error) { panel.innerHTML = `<p role="alert">Kalenderstand unbekannt: ${escape(error.message)}</p>` }
    }
    loadCalendar()
    root.addEventListener('click', async event => {
      if (event.target.closest('[data-coo-refresh]')) {
        const id = root.querySelector('#coo-client').value
        if (id) await loadClient(id)
        return
      }
      const logReview = event.target.closest('[data-coo-log-review]')
      if (logReview && selected && logRevision) {
        logReview.disabled = true
        try { await onAction('deep_dive_notes', { operation: 'review', includeFitnessLog: true, expectedLogRevision: logRevision, brief: 'Werte den ausgewählten fitness-log-Verlauf mit den vorhandenen Plänen aus. Benenne Datenlücken und belegte Beobachtungen mit Datum. Trainingstage sind zusammengefasste Einheiten; keine unbelegte Aussage über Fortschritt oder Adhärenz.' }) }
        finally { logReview.disabled = false }
        return
      }
      const logButton = event.target.closest('[data-coo-log]')
      if (logButton && selected) {
        const id = selected.clientId
        const panel = root.querySelector('[data-coo-log-panel]')
        panel.innerHTML = '<p role="status">Trainingsverlauf wird geladen …</p>'
        logButton.disabled = true
        try {
          const data = await api(`/coo/clients/${encodeURIComponent(id)}/log`)
          if (selected?.clientId !== id) return
          logRevision = data.revision || null
          panel.innerHTML = data.status !== 'available' ? `<p>${escape(data.message)}</p>` : `
            <section><h3>fitness-log · letzte 90 Tage</h3><button class="btn" data-coo-log-review>Verlauf mit COO auswerten</button>
            <p>${escape(data.stats.total_sessions)} Trainingstage · ${escape(data.stats.sessions_per_week)} pro Woche. Mehrere Einheiten am selben Tag werden hier zusammengefasst.</p>
            ${data.sessions.length ? data.sessions.map(row => `<details><summary>${escape(row.date)} · ${escape(row.block || row.kind)} · ${escape(row.exercises.length)} Übungen</summary><ul>${row.exercises.map(ex => `<li>${escape(ex.name || ex.exerciseName || ex.exercise_id || 'Übung')}<pre>${escape((Array.isArray(ex.sets) ? ex.sets : []).map((set, i) => `Satz ${i + 1}: ${set.reps ?? '–'} Wdh.${set.weight != null ? ` · ${set.weight} kg` : ''}`).join('\n'))}</pre></li>`).join('')}</ul>${row.notes ? `<p>${escape(row.notes)}</p>` : ''}</details>`).join('') : '<p>Keine lokalen Trainingstage in diesem Zeitraum.</p>'}
            <h4>Frühere Konsolen-Entwürfe</h4><p class="hint">Bestehende fitness-log-Entwürfe, nur zur Ansicht. Sie sind von den COO-Freigaben getrennt und werden nicht automatisch versendet.</p>
            ${data.drafts.length ? data.drafts.map(row => `<details><summary>${escape(row.created_at)} · ${row.kind === 'gap' ? 'Trainingspause' : 'Feedback'} · ${escape(row.status || 'Entwurf')}</summary><div class="draft-prose">${renderMarkdown(row.text)}</div></details>`).join('') : '<p>Keine früheren Konsolen-Entwürfe vorhanden.</p>'}</section>`
        } catch (error) { if (selected?.clientId === id) panel.innerHTML = `<p role="alert">${escape(error.message)}</p>` }
        finally { logButton.disabled = false }
        return
      }
      const button = event.target.closest('[data-coo-action]')
      if (!button || !snapshot || !selected) return
      const prompts = {
        prepare: ['deep_dive_notes', 'Bereite das nächste Gespräch mit diesem Klienten vor. Gliedere in belegten Stand mit Quellen und Datum, dokumentierte offene Punkte, drei sinnvolle Fragen und einen kurzen Gesprächsablauf. Verwende nur einen ausdrücklich ausgewählten Kalendereintrag im Quellenpaket. Ohne Kalendereintrag ist kein Termin bestätigt.'],
        review: ['deep_dive_notes', 'Prüfe den dokumentierten Trainingsstand dieses Klienten: gespeicherte Trainings und lokale Pläne gegenüberstellen, Datenlücken nennen und Fragen für das nächste Gespräch ableiten. Keine unbewiesenen Aussagen über Fortschritt oder Trainingsadhärenz.'],
        followup: ['draft_followup_email', 'Erstelle einen persönlichen Follow-up-Entwurf auf Basis der dokumentierten Notizen. Keine nicht dokumentierten Gesprächsinhalte, Vereinbarungen oder erfolgte Termine erfinden. Fehlende Informationen als Rückfragen kennzeichnen.'],
      }
      const [skillId, brief] = prompts[button.dataset.cooAction]
      button.disabled = true
      try { await onAction(skillId, { brief, operation: button.dataset.cooAction }) } finally { button.disabled = false }
    })
  } catch (error) {
    root.innerHTML = `<p role="alert">COO-Arbeitsstand nicht erreichbar: ${escape(error.message)}</p><button class="btn" data-coo-retry>Erneut verbinden</button>`
    root.querySelector('[data-coo-retry]').addEventListener('click', () => mountCooFrontdoor(root, { onAction, onSelect }), { once: true })
  }
}
