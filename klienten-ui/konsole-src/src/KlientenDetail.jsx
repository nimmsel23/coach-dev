import { useState, useEffect, useRef } from 'react'
import { XMarkIcon, TrashIcon } from '@heroicons/react/24/outline'

const TABS = [
  { id: 'uebersicht', label: 'Übersicht' },
  { id: 'crm',        label: 'CRM' },
  { id: 'zahlung',    label: 'Zahlung' },
  { id: 'notizen',    label: 'Notizen' },
  { id: 'habitsync',  label: 'HabitSync' },
  { id: 'training',   label: '→ ClientForge' },
]

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const DAYS_DE = { Mon: 'Mo', Tue: 'Di', Wed: 'Mi', Thu: 'Do', Fri: 'Fr', Sat: 'Sa', Sun: 'So' }

function eur(value) {
  const n = Number(value || 0)
  if (!Number.isFinite(n)) return '0,00 EUR'
  return `${n.toFixed(2).replace('.', ',')} EUR`
}

function PlanEditor({ clientId }) {
  const [weekLabel, setWeekLabel] = useState('')
  const [activeDays, setActiveDays] = useState(new Set())
  const [dayData, setDayData] = useState({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/client/${clientId}/plan`)
      .then((r) => r.json())
      .then((d) => {
        const p = d.data || {}
        const week = p.weeks?.[0] || {}
        setWeekLabel(week.label || '')

        const active = new Set()
        const days = {}
        for (const day of week.days || []) {
          active.add(day.day)
          days[day.day] = {
            block: day.block || '',
            exercises: (day.exercises || []).map((e) => e.name || e).join('\n'),
          }
        }
        setActiveDays(active)
        setDayData(days)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [clientId])

  async function save() {
    setSaving(true)
    const days = DAYS.filter((d) => activeDays.has(d)).map((d) => ({
      day: d,
      block: dayData[d]?.block || '',
      exercises: (dayData[d]?.exercises || '')
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((name) => ({ name })),
    }))
    try {
      await fetch(`/api/client/${clientId}/plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weeks: [{ label: weekLabel || 'Woche 1', days }] }),
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch {
      alert('Fehler beim Speichern')
    } finally {
      setSaving(false)
    }
  }

  function toggleDay(day) {
    setActiveDays((prev) => {
      const n = new Set(prev)
      if (n.has(day)) n.delete(day)
      else n.add(day)
      return n
    })
    if (!dayData[day]) {
      setDayData((prev) => ({ ...prev, [day]: { block: '', exercises: '' } }))
    }
  }

  if (loading) return <div className="text-gray-500 py-6 text-sm">Lade…</div>

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <input
          value={weekLabel}
          onChange={(e) => setWeekLabel(e.target.value)}
          placeholder="Zyklus / Wochenbezeichnung"
          className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-indigo-500"
        />
        <button
          onClick={save}
          disabled={saving}
          className={`px-5 py-2 rounded-lg text-sm font-semibold transition-colors ${saved ? 'bg-emerald-600 text-white' : 'bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50'}`}
        >
          {saved ? '✓ Gespeichert' : saving ? '…' : 'Speichern'}
        </button>
      </div>

      <div className="space-y-2">
        {DAYS.map((day) => {
          const active = activeDays.has(day)
          const data = dayData[day] || { block: '', exercises: '' }
          return (
            <div key={day} className={`border rounded-xl overflow-hidden ${active ? 'border-indigo-600' : 'border-gray-800'}`}>
              <div className="flex items-center gap-3 px-4 py-3 bg-gray-900">
                <button
                  onClick={() => toggleDay(day)}
                  className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-colors ${active ? 'bg-indigo-600 border-indigo-600' : 'border-gray-600 hover:border-gray-400'}`}
                >
                  {active && (
                    <svg viewBox="0 0 10 8" fill="none" className="w-3 h-3">
                      <path d="M1 4l2.5 2.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
                <span className="font-mono text-sm font-bold text-gray-300 w-6">{DAYS_DE[day]}</span>
                <input
                  value={data.block}
                  onChange={(e) =>
                    setDayData((prev) => ({
                      ...prev,
                      [day]: { ...prev[day], block: e.target.value },
                    }))
                  }
                  placeholder="Block (z.B. Push A)"
                  disabled={!active}
                  className="flex-1 bg-transparent text-sm text-gray-200 placeholder:text-gray-600 focus:outline-none disabled:opacity-30"
                />
              </div>

              {active && (
                <div className="px-4 pb-3 pt-2 bg-gray-950/50">
                  <textarea
                    value={data.exercises}
                    onChange={(e) =>
                      setDayData((prev) => ({
                        ...prev,
                        [day]: { ...prev[day], exercises: e.target.value },
                      }))
                    }
                    placeholder={'Übungen (eine pro Zeile)\nz.B. Bankdrücken\nSchulterdrücken\nTrizeps Dips'}
                    rows={4}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-indigo-500 resize-none"
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function KlientenDetail({ clientId, onClose }) {
  const [tab, setTab] = useState('uebersicht')
  const [sessions, setSessions] = useState([])
  const [gaps, setGaps] = useState([])
  const [journal, setJournal] = useState([])
  const [newNote, setNewNote] = useState('')
  const [billing, setBilling] = useState(null)
  const [billingError, setBillingError] = useState(null)
  const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [invoiceAmount, setInvoiceAmount] = useState('')
  const [invoiceDesc, setInvoiceDesc] = useState('')
  const [invoicePaid, setInvoicePaid] = useState(false)
  const [billingBusy, setBillingBusy] = useState(false)
  const [loading, setLoading] = useState(true)

  const [crm, setCrm] = useState(null)
  const [crmError, setCrmError] = useState(null)
  const [crmBusy, setCrmBusy] = useState(false)
  const [linkContactId, setLinkContactId] = useState('')
  const [crmSearch, setCrmSearch] = useState('')
  const [crmResults, setCrmResults] = useState([])
  const [crmSearchBusy, setCrmSearchBusy] = useState(false)
  const crmSearchTimer = useRef(null)

  const [habits, setHabits] = useState([])
  const [habitRecords, setHabitRecords] = useState([])
  const [habitsError, setHabitsError] = useState(null)
  const [habitsLoading, setHabitsLoading] = useState(false)

  const reloadBilling = async () => {
    try {
      const r = await fetch(`/api/client/${clientId}/billing`)
      const obj = await r.json().catch(() => null)
      if (!r.ok || !obj?.ok) throw new Error(obj?.error || `HTTP ${r.status}`)
      setBilling(obj)
      setBillingError(null)
    } catch (err) {
      setBilling(null)
      setBillingError(String(err?.message || err))
    }
  }

  useEffect(() => {
    if (!clientId) return
    setLoading(true)

    Promise.all([
      fetch(`/api/client/${clientId}/session/list`).then(r => r.json()),
      fetch(`/api/client/${clientId}/coverage/gaps`).then(r => r.json()),
      fetch(`/api/client/${clientId}/journal/list`).then(r => r.json()),
      reloadBilling().then(() => ({ ok: true })).catch(() => ({ ok: false })),
    ])
      .then(([s, g, j]) => {
        setSessions(s.ok ? s.sessions.slice(0, 5) : [])
        setGaps(g.ok ? g.gaps : [])
        setJournal(j.ok ? j.entries : [])
      })
      .finally(() => setLoading(false))
  }, [clientId])

  const reloadCrm = async () => {
    try {
      const r = await fetch(`/api/client/${clientId}/crm`)
      const obj = await r.json().catch(() => null)
      if (!r.ok || !obj?.ok) throw new Error(obj?.error || `HTTP ${r.status}`)
      setCrm(obj)
      setCrmError(null)
    } catch (err) {
      setCrm(null)
      setCrmError(String(err?.message || err))
    }
  }

  useEffect(() => {
    if (!clientId) return
    reloadCrm()
    loadHabits()
  }, [clientId])

  const loadHabits = async () => {
    setHabitsLoading(true)
    setHabitsError(null)
    try {
      const [hRes, rRes] = await Promise.all([
        fetch(`/api/client/${clientId}/habitsync/api/habit/list`),
        fetch(`/api/client/${clientId}/habitsync/api/record/list`),
      ])
      if (!hRes.ok) throw new Error(`Habits HTTP ${hRes.status}`)
      const hData = await hRes.json()
      setHabits(Array.isArray(hData.data) ? hData.data : Array.isArray(hData) ? hData : [])
      if (rRes.ok) {
        const rData = await rRes.json()
        setHabitRecords(Array.isArray(rData.data) ? rData.data : Array.isArray(rData) ? rData : [])
      }
    } catch (err) {
      setHabitsError(String(err?.message || err))
    } finally {
      setHabitsLoading(false)
    }
  }

  const searchCrmContacts = async (q) => {
    if (!q.trim()) { setCrmResults([]); return }
    setCrmSearchBusy(true)
    try {
      const url = `/api/integrations/espocrm/Contact?searchParams[name][value]=${encodeURIComponent(q)}&searchParams[name][type]=contains&maxSize=10`
      const r = await fetch(url)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const data = await r.json()
      setCrmResults(data.list || [])
    } catch {
      setCrmResults([])
    } finally {
      setCrmSearchBusy(false)
    }
  }

  const onCrmSearchChange = (val) => {
    setCrmSearch(val)
    clearTimeout(crmSearchTimer.current)
    crmSearchTimer.current = setTimeout(() => searchCrmContacts(val), 380)
  }

  const linkCrm = async () => {
    if (!linkContactId.trim()) return
    setCrmBusy(true)
    try {
      const r = await fetch(`/api/client/${clientId}/crm/link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId: linkContactId.trim() }),
      })
      const obj = await r.json().catch(() => null)
      if (!r.ok || !obj?.ok) throw new Error(obj?.error || `HTTP ${r.status}`)
      setLinkContactId('')
      await reloadCrm()
    } catch (err) {
      alert(`CRM link fehlgeschlagen: ${String(err?.message || err)}`)
    } finally {
      setCrmBusy(false)
    }
  }

  const unlinkCrm = async () => {
    setCrmBusy(true)
    try {
      const r = await fetch(`/api/client/${clientId}/crm/unlink`, { method: 'POST' })
      const obj = await r.json().catch(() => null)
      if (!r.ok || !obj?.ok) throw new Error(obj?.error || `HTTP ${r.status}`)
      await reloadCrm()
    } catch (err) {
      alert(`CRM unlink fehlgeschlagen: ${String(err?.message || err)}`)
    } finally {
      setCrmBusy(false)
    }
  }

  const createInvoice = async () => {
    const amt = Number(String(invoiceAmount).replace(',', '.'))
    if (!Number.isFinite(amt) || amt <= 0) {
      alert('Bitte einen gueltigen Betrag eingeben.')
      return
    }
    if (!invoiceDate || !/^\d{4}-\d{2}-\d{2}$/.test(invoiceDate)) {
      alert('Bitte ein gueltiges Datum (YYYY-MM-DD) eingeben.')
      return
    }

    setBillingBusy(true)
    try {
      const r = await fetch('/api/billing/invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          date: invoiceDate,
          amount: amt,
          paid: invoicePaid,
          description: invoiceDesc,
        }),
      })
      const obj = await r.json().catch(() => null)
      if (!r.ok || !obj?.ok) throw new Error(obj?.error || `HTTP ${r.status}`)
      setInvoiceAmount('')
      setInvoiceDesc('')
      setInvoicePaid(false)
      await reloadBilling()
    } catch (err) {
      alert(`Rechnung konnte nicht angelegt werden: ${String(err?.message || err)}`)
    } finally {
      setBillingBusy(false)
    }
  }

  const deleteInvoice = async (invoiceId) => {
    if (!confirm(`Rechnung #${invoiceId} wirklich löschen?`)) return
    setBillingBusy(true)
    try {
      const r = await fetch(`/api/billing/invoice/${invoiceId}`, { method: 'DELETE' })
      const obj = await r.json().catch(() => null)
      if (!r.ok || !obj?.ok) throw new Error(obj?.error || `HTTP ${r.status}`)
      await reloadBilling()
    } catch (err) {
      alert(`Löschen fehlgeschlagen: ${String(err?.message || err)}`)
    } finally {
      setBillingBusy(false)
    }
  }

  const togglePaid = async (invoiceId, paid) => {
    setBillingBusy(true)
    try {
      const r = await fetch(`/api/billing/invoice/${invoiceId}/paid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paid: !paid }),
      })
      const obj = await r.json().catch(() => null)
      if (!r.ok || !obj?.ok) throw new Error(obj?.error || `HTTP ${r.status}`)
      await reloadBilling()
    } catch (err) {
      alert(`Status konnte nicht geaendert werden: ${String(err?.message || err)}`)
    } finally {
      setBillingBusy(false)
    }
  }

  const saveNote = async () => {
    if (!newNote.trim()) return
    const today = new Date().toISOString().split('T')[0]
    const res = await fetch(`/api/client/${clientId}/journal/entry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: today, content: newNote })
    })
    if (!res.ok) { alert('Speichern fehlgeschlagen'); return }
    setNewNote('')
    const j = await (await fetch(`/api/client/${clientId}/journal/list`)).json()
    setJournal(j.ok ? j.entries : [])
  }

  const deleteNote = async (date) => {
    if (!confirm(`Eintrag vom ${date} löschen?`)) return
    await fetch(`/api/client/${clientId}/journal/entry?date=${date}`, { method: 'DELETE' })
    const j = await (await fetch(`/api/client/${clientId}/journal/list`)).json()
    setJournal(j.ok ? j.entries : [])
  }

  if (loading) return <div className="p-10 text-gray-500">Lade Klientendaten…</div>

  return (
    <div className="flex-1 bg-gray-950 p-6 overflow-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-100">Klient: {clientId}</h1>
        <div className="flex items-center gap-3">
          <a
            href={`/schmiede/${clientId}/`}
            className="text-xs px-3 py-1.5 rounded-lg bg-indigo-900/60 hover:bg-indigo-800 text-indigo-300 hover:text-indigo-100 transition font-medium"
          >
            ClientForge öffnen
          </a>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-200">
            <XMarkIcon className="w-7 h-7" />
          </button>
        </div>
      </div>

      <div className="flex border-b border-gray-800 mb-6">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-5 py-3 font-medium ${
              tab === t.id
                ? 'border-b-2 border-indigo-500 text-indigo-400'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'uebersicht' && (
        <div className="space-y-8">
          <div>
            <h2 className="text-lg font-semibold mb-3 text-gray-200">Letzte Sessions</h2>
            {sessions.length === 0 ? (
              <p className="text-gray-500">Noch keine Einheiten</p>
            ) : (
              <ul className="space-y-2">
                {sessions.map((s, i) => (
                  <li key={i} className="bg-gray-900 border border-gray-800 p-4 rounded-lg text-gray-200">
                    {s.date} – {s.block || '—'}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h2 className="text-lg font-semibold mb-3 text-gray-200">Coverage Gaps</h2>
            {gaps.length === 0 ? (
              <p className="text-emerald-400">Keine Lücken erkannt</p>
            ) : (
              <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {gaps.map((g, i) => (
                  <li key={i} className="bg-rose-950/60 border border-rose-900/50 px-3 py-2 rounded text-rose-300 text-sm">
                    {g.date} – {!g.hasSession ? 'Kein Training' : ''}{!g.hasSession && !g.hasJournal ? ' & ' : ''}{!g.hasJournal ? 'Kein Journal' : ''}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {tab === 'training' && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-200">Coaching → ClientForge</h2>
          <p className="text-sm text-gray-400">
            Trainingspläne, Yuhonas und Ernährungspläne liegen in ClientForge.
            Die Konsole bleibt bei CRM und Buchhaltung.
          </p>
          <a
            href={`/schmiede/${clientId}/`}
            className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg"
          >
            ClientForge öffnen ↗
          </a>
        </div>
      )}

      {tab === 'notizen' && (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold mb-3 text-gray-200">
              Neuer Eintrag ({new Date().toLocaleDateString('de-DE')})
            </h2>
            <textarea
              value={newNote}
              onChange={e => setNewNote(e.target.value)}
              placeholder="Notiz / Trainingsprotokoll / Feedback..."
              className="w-full h-32 bg-gray-900 border border-gray-700 rounded-lg p-4 text-gray-200 focus:outline-none focus:border-indigo-500"
            />
            <button
              onClick={saveNote}
              disabled={!newNote.trim()}
              className="mt-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700 disabled:text-gray-400 text-white px-5 py-2 rounded-lg"
            >
              Speichern
            </button>
          </div>
          <div>
            <h2 className="text-lg font-semibold mb-3 text-gray-200">Vorherige Einträge</h2>
            {journal.length === 0 ? (
              <p className="text-gray-500">Noch keine Notizen</p>
            ) : (
              <div className="space-y-3">
                {journal.map((entry, i) => (
                  <div key={i} className="bg-gray-900 border border-gray-800 rounded-lg p-4 flex gap-3">
                    <div className="flex-1">
                      <div className="text-sm text-gray-400 mb-1">{entry.date}</div>
                      <div className="whitespace-pre-line text-gray-200">{entry.content}</div>
                    </div>
                    <button
                      onClick={() => deleteNote(entry.date)}
                      className="text-gray-600 hover:text-rose-400 transition-colors shrink-0 mt-1"
                    >
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'habitsync' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-200">HabitSync</h2>
            <button onClick={loadHabits} disabled={habitsLoading}
              className="text-xs text-gray-300 hover:text-white bg-gray-800 hover:bg-gray-700 px-3 py-1.5 rounded-lg transition">
              Refresh
            </button>
          </div>

          {habitsError && (
            <div className="bg-rose-950/30 border border-rose-900/50 text-rose-300 rounded-lg p-3 text-sm">
              {habitsError}
            </div>
          )}

          {habitsLoading && <div className="text-gray-500 text-sm py-4">Lade Habits…</div>}

          {!habitsLoading && !habitsError && habits.length === 0 && (
            <div className="text-gray-500 text-sm py-4">Keine Habits konfiguriert oder kein HabitSync-Token.</div>
          )}

          {!habitsLoading && habits.length > 0 && (() => {
            const today = new Date()
            const days = Array.from({ length: 7 }, (_, i) => {
              const d = new Date(today)
              d.setDate(today.getDate() - (6 - i))
              return d.toISOString().slice(0, 10)
            })
            return (
              <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
                <div className="grid text-xs text-gray-500 uppercase tracking-wider px-4 py-2 border-b border-gray-800"
                  style={{ gridTemplateColumns: '1fr repeat(7, 28px)', gap: '4px' }}>
                  <span>Habit</span>
                  {days.map(d => <span key={d} className="text-center">{d.slice(8)}</span>)}
                </div>
                {habits.map(habit => (
                  <div key={habit.id} className="grid items-center px-4 py-2.5 border-b border-gray-800/60 last:border-b-0 hover:bg-gray-800/40 transition"
                    style={{ gridTemplateColumns: '1fr repeat(7, 28px)', gap: '4px' }}>
                    <span className="text-sm text-gray-200 font-medium truncate pr-2">{habit.name}</span>
                    {days.map(d => {
                      const done = habitRecords.some(r => r.habitId === habit.id && r.date === d && r.value)
                      return (
                        <div key={d} className="flex justify-center">
                          <div className={`w-5 h-5 rounded-full border-2 ${done
                            ? 'bg-emerald-500 border-emerald-500'
                            : 'bg-transparent border-gray-700'}`} />
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            )
          })()}
        </div>
      )}

      {tab === 'crm' && (
        <div className="space-y-4">
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-gray-200">EspoCRM</h2>
              <button
                onClick={reloadCrm}
                disabled={crmBusy}
                className="text-xs text-gray-300 hover:text-white bg-gray-800 hover:bg-gray-700 px-3 py-1.5 rounded-lg transition"
              >
                Refresh
              </button>
            </div>

            {crmError && <div className="text-sm text-rose-300">CRM: {crmError}</div>}

            {!crmError && crm?.ok && (
              <div className="space-y-3">
                <div className="text-sm text-gray-300">
                  Contact ID: <span className="font-mono text-gray-200 break-all">{crm.contactId}</span>
                </div>
                <div className="bg-gray-950 border border-gray-800 rounded-lg p-4 text-sm text-gray-200">
                  <div className="font-semibold">{crm.contact?.name || '—'}</div>
                  <div className="text-gray-400 text-xs mt-1">email: {crm.contact?.emailAddress || '—'}</div>
                  <div className="text-gray-400 text-xs">phone: {crm.contact?.phoneNumber || '—'}</div>
                </div>
                <button
                  onClick={unlinkCrm}
                  disabled={crmBusy}
                  className="bg-gray-800 hover:bg-gray-700 disabled:bg-gray-800 disabled:text-gray-500 text-gray-200 px-4 py-2 rounded-lg text-sm font-medium transition"
                >
                  Unlink
                </button>
              </div>
            )}

            <div className="mt-4 pt-4 border-t border-gray-800">
              <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Kontakt suchen</div>
              <div className="relative mb-3">
                <input
                  value={crmSearch}
                  onChange={(e) => onCrmSearchChange(e.target.value)}
                  className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-indigo-500"
                  placeholder="Name suchen…"
                />
                {crmSearchBusy && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500">…</span>
                )}
              </div>
              {crmResults.length > 0 && (
                <div className="bg-gray-950 border border-gray-800 rounded-lg overflow-hidden mb-3">
                  {crmResults.map(c => (
                    <button
                      key={c.id}
                      onClick={() => { setLinkContactId(c.id); setCrmSearch(''); setCrmResults([]) }}
                      className="w-full text-left px-4 py-2.5 border-b border-gray-800 last:border-b-0 hover:bg-gray-800 transition flex items-center justify-between gap-3"
                    >
                      <span className="text-sm text-gray-200 font-medium">{c.name}</span>
                      <span className="text-xs text-gray-500 font-mono truncate max-w-[160px]">{c.id}</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Link contact</div>
              <div className="flex gap-3">
                <input
                  value={linkContactId}
                  onChange={(e) => setLinkContactId(e.target.value)}
                  className="flex-1 bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-indigo-500"
                  placeholder="EspoCRM Contact ID"
                />
                <button
                  onClick={linkCrm}
                  disabled={crmBusy || !linkContactId.trim()}
                  className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-800 disabled:text-gray-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
                >
                  Link
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'zahlung' && (
        <div>
          <h2 className="text-lg font-semibold mb-4 text-gray-200">Zahlungsübersicht</h2>
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 mb-4">
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-3">Neue Rechnung</div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <input
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
                className="bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-indigo-500"
                placeholder="YYYY-MM-DD"
              />
              <input
                value={invoiceAmount}
                onChange={(e) => setInvoiceAmount(e.target.value)}
                className="bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-indigo-500"
                placeholder="Betrag (z.B. 89,00)"
              />
              <input
                value={invoiceDesc}
                onChange={(e) => setInvoiceDesc(e.target.value)}
                className="bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-indigo-500"
                placeholder="Beschreibung"
              />
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm text-gray-300">
                  <input type="checkbox" checked={invoicePaid} onChange={(e) => setInvoicePaid(e.target.checked)} />
                  bezahlt
                </label>
                <button
                  onClick={createInvoice}
                  disabled={billingBusy}
                  className="ml-auto bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-800 disabled:text-gray-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
                >
                  {billingBusy ? '…' : 'Anlegen'}
                </button>
              </div>
            </div>
          </div>

          {billingError && (
            <div className="bg-rose-950/30 border border-rose-900/50 text-rose-200 rounded-lg p-4 text-sm">
              Billing Fehler: {billingError}
            </div>
          )}

          {!billingError && billing?.ok && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
                  <div className="text-xs text-gray-500 uppercase tracking-wider">Offen</div>
                  <div className="mt-1 text-xl font-bold text-amber-300">{billing.summary?.open_count ?? 0}</div>
                  <div className="text-xs text-gray-500">Summe: {eur(billing.summary?.open_sum ?? 0)}</div>
                </div>
                <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
                  <div className="text-xs text-gray-500 uppercase tracking-wider">CRM</div>
                  <div className="mt-1 text-sm text-gray-200 font-mono break-all">crm_id: {billing.crm_id}</div>
                </div>
              </div>

              <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
                <table className="w-full text-sm text-left">
                  <thead className="bg-gray-800">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs uppercase tracking-wider text-gray-400">Datum</th>
                      <th className="px-6 py-3 text-left text-xs uppercase tracking-wider text-gray-400">Beschreibung</th>
                      <th className="px-6 py-3 text-left text-xs uppercase tracking-wider text-gray-400">Betrag</th>
                      <th className="px-6 py-3 text-left text-xs uppercase tracking-wider text-gray-400">Status</th>
                      <th className="px-4 py-3 w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {(billing.invoices || []).length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-6 py-6 text-gray-500">
                          Noch keine Rechnungen
                        </td>
                      </tr>
                    ) : (
                      (billing.invoices || []).map((inv) => (
                        <tr key={inv.id} className="group">
                          <td className="px-6 py-4 text-gray-200 font-mono text-sm">{inv.date || '—'}</td>
                          <td className="px-6 py-4 text-gray-300">{inv.description || '—'}</td>
                          <td className="px-6 py-4 text-gray-200 font-mono">{eur(inv.amount)}</td>
                          <td className="px-6 py-4">
                            <button
                              onClick={() => togglePaid(inv.id, inv.paid)}
                              disabled={billingBusy}
                              className={`text-xs px-2.5 py-1 rounded-full ${
                                inv.paid ? 'bg-emerald-950 text-emerald-300' : 'bg-rose-950 text-rose-300'
                              } ${billingBusy ? 'opacity-60' : 'hover:opacity-90'}`}
                            >
                              {inv.paid ? 'bezahlt' : 'offen'}
                            </button>
                          </td>
                          <td className="px-4 py-4">
                            <button
                              onClick={() => deleteInvoice(inv.id)}
                              disabled={billingBusy}
                              title="Rechnung löschen"
                              className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-600 hover:text-rose-400 disabled:opacity-30"
                            >
                              <TrashIcon className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {!billingError && !billing?.ok && (
            <div className="text-gray-500 text-sm">Keine Billing-Daten verfuegbar.</div>
          )}
        </div>
      )}
    </div>
  )
}
