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
  let calendarSection = null
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
    if (calendarSection && panel.contains(calendarSection)) root.querySelector('.coo-main').append(calendarSection)
    if (calendarSection) calendarSection.querySelector('summary').innerHTML = 'Termin zuordnen <span>optional</span>'
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
        <div class="coo-context-head"><div><h3>${escape(data.client.name)}</h3><p class="sub">Unterlagen geladen um ${new Date(data.checkedAt).toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' })}</p></div><a class="btn ghost" href="/k/${encodeURIComponent(id)}">Klientenakte öffnen</a></div>
        <div class="coo-task-heading"><h4>Was steht an?</h4><p>Der COO bereitet vor. Du prüfst das Ergebnis.</p></div><div class="actions coo-actions">
          <button class="btn ok" data-coo-action="prepare">Gespräch vorbereiten</button>
          <button class="btn" data-coo-action="review">Trainingsstand prüfen</button>
          <button class="btn" data-coo-action="followup">Follow-up entwerfen</button>
        </div>
        <p class="hint">Verwendet die unten aufgeführten Unterlagen und dein gewähltes KI-Modell. Es wird keine Nachricht versendet.</p>
        <div class="source-toolbar"><h4>Vorhandene Unterlagen</h4><button class="btn ghost" data-coo-refresh>Stand neu laden</button></div><div class="coo-context-grid">
          <section><h4>Letzte Notizen</h4>${data.notes.length ? data.notes.slice(0, 1).map(note => `<p><strong>${escape(date(note.date))}</strong><br>${escape(note.text.slice(0, 240))}${note.text.length > 240 ? '…' : ''}</p>`).join('') + ((data.notes.length > 1 || data.notes[0].text.length > 240) ? `<details><summary>Alle Notizen lesen (${data.notes.length})</summary>${data.notes.map(note => `<p><strong>${escape(date(note.date))}</strong><br>${escape(note.text)}</p>`).join('')}</details>` : '') : '<p>Keine datierten Coaching-Notizen vorhanden.</p>'}
          ${data.memo.length ? `<details><summary>Klienten-Merkblatt lesen</summary><pre>${escape(data.memo[0].text)}</pre></details>` : '<p>Kein Klienten-Merkblatt hinterlegt.</p>'}</section>
          <section><h4>Letzte gespeicherte Trainings</h4>${data.workouts.length ? `<ul>${data.workouts.slice(0, 3).map(item => `<li>${escape(date(item.finishedAt))} · ${escape(item.name)}</li>`).join('')}</ul>${data.workouts.length > 3 ? `<details><summary>Weitere ${data.workouts.length - 3} Trainings</summary><ul>${data.workouts.slice(3).map(item => `<li>${escape(date(item.finishedAt))} · ${escape(item.name)}</li>`).join('')}</ul></details>` : ''}` : '<p>Keine gespeicherten Trainings in den gelesenen Quellen.</p>'}
          <h4>Trainingspläne</h4>${data.plans.length ? `<ul>${data.plans.map(item => `<li>${escape(item.name)} · ${({ published: 'Freigegeben', draft: 'Entwurf', archived: 'Archiviert' })[item.status] || escape(item.status)} · Version ${escape(item.version)}<br><span class="hint">Geändert ${escape(date(item.updatedAt))}${item.deliveredAt ? ` · übergeben ${escape(date(item.deliveredAt))}` : ' · keine Übergabe dokumentiert'}</span></li>`).join('')}</ul>` : '<p>Kein lokaler Trainingsplan vorhanden.</p>'}</section>
          <section><h4>Dokumentierte offene Punkte</h4>${data.followups.length ? `<ul>${data.followups.map(item => `<li>${escape(item.text)} <span class="hint">(${escape(item.source)})</span></li>`).join('')}</ul>` : '<p>Keine offenen Punkte in den gelesenen Notizen markiert.</p>'}
          <details><summary>Quellenstand ansehen</summary><ul>${data.sources.map(source => `<li>${escape(source.label)}: ${labels[source.status] || escape(source.status)}${source.message ? ` — ${escape(source.message)}` : ''}</li>`).join('')}</ul></details></section>
        </div><div class="training-access"><button class="btn" data-coo-log>Trainingsverlauf & frühere Entwürfe</button></div><div data-coo-log-panel></div>`
      if (calendarSection) panel.querySelector('.coo-task-heading').before(calendarSection)
    } catch (error) {
      if (request !== selection) return
      panel.innerHTML = `<p role="alert">Klientenstand nicht verfügbar: ${escape(error.message)}</p><button class="btn" data-coo-refresh>Erneut laden</button>`
    }
  }
  try {
    const data = await api('/coo/overview')
    root.innerHTML = `<aside class="coo-sidebar" aria-label="Personenauswahl">
      <div class="people-head"><h2>Personen</h2><span>${data.clients.length}</span></div>
      <label class="people-search">Person suchen<input type="search" id="coo-search" placeholder="Name eingeben" autocomplete="off"></label>
      <select id="coo-client" aria-label="Ausgewählte Person" class="sr-only" tabindex="-1" aria-hidden="true"><option value="">Bitte auswählen</option>${data.clients.map(client => `<option value="${escape(client.id)}">${escape(client.name)}</option>`).join('')}</select>
      <div class="people-list">${data.clients.map(client => `<button type="button" class="person" data-person="${escape(client.id)}" aria-pressed="false"><span class="person-initial" aria-hidden="true">${escape(client.name.trim().slice(0,1))}</span><span><strong>${escape(client.name)}</strong><small>${client.openJobs ? `${client.openJobs} offene Aufträge` : 'Akte öffnen'}</small></span></button>`).join('')}</div>
      <p id="people-empty" hidden>Keine Person mit diesem Namen.</p>
      <nav aria-label="Arbeitsbereiche"><a href="/workspace/">Workspace öffnen</a><a href="/coach/local.html">Trainingsplanung öffnen</a></nav>
    </aside><div class="coo-main"><div id="coo-context"><div class="coo-welcome"><h2>Mit wem arbeitest du heute?</h2><p>Wähle eine Person. Hier kommen ihre Unterlagen, die Gesprächsvorbereitung und die nächsten Schritte zusammen.</p></div></div><details class="calendar-section"><summary>Termin zuordnen <span>optional</span></summary><div id="coo-calendar"><p>Google-Kalender wird geladen …</p></div></details></div>`
    calendarSection = root.querySelector('.calendar-section')
    root.querySelector('#coo-search').addEventListener('input', event => {
      const query = event.target.value.trim().toLocaleLowerCase('de')
      let matches = 0
      for (const button of root.querySelectorAll('[data-person]')) {
        button.hidden = !button.textContent.toLocaleLowerCase('de').includes(query)
        if (!button.hidden) matches++
      }
      root.querySelector('#people-empty').hidden = matches > 0
    })
    root.querySelector('#coo-client').addEventListener('change', event => {
      try { sessionStorage.setItem('coo-selected-person', event.target.value) } catch {}
      for (const button of root.querySelectorAll('[data-person]')) button.setAttribute('aria-pressed', String(button.dataset.person === event.target.value))
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
          calendarSection.querySelector('summary').textContent = item ? `Termin: ${when(item.start)} – ${item.title}` : 'Termin zuordnen (optional)'
        })
      } catch (error) { panel.innerHTML = `<p role="alert">Kalenderstand unbekannt: ${escape(error.message)}</p>` }
    }
    loadCalendar()
    root.addEventListener('click', async event => {
      const person = event.target.closest('[data-person]')
      if (person) {
        const select = root.querySelector('#coo-client')
        select.value = person.dataset.person
        select.dispatchEvent(new Event('change'))
        return
      }
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
    try {
      const saved = sessionStorage.getItem('coo-selected-person')
      if (data.clients.some(person => person.id === saved)) {
        root.querySelector('#coo-client').value = saved
        root.querySelector('#coo-client').dispatchEvent(new Event('change'))
      }
    } catch {}
  } catch (error) {
    root.innerHTML = `<p role="alert">COO-Arbeitsstand nicht erreichbar: ${escape(error.message)}</p><button class="btn" data-coo-retry>Erneut verbinden</button>`
    root.querySelector('[data-coo-retry]').addEventListener('click', () => mountCooFrontdoor(root, { onAction, onSelect }), { once: true })
  }
}
