import { useEffect, useState } from 'react'

const MONATE = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez']

function eur(value) {
  const n = Number(value || 0)
  if (!Number.isFinite(n)) return '0,00 EUR'
  return `${n.toFixed(2).replace('.', ',')} EUR`
}

function PraxisDashboard({ praxis, onSelectClient }) {
  const [billing, setBilling] = useState(null)
  const [billingLoading, setBillingLoading] = useState(false)
  const [billingError, setBillingError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [hledgerOpen, setHledgerOpen] = useState(false)
  const [hledgerYear, setHledgerYear] = useState(() => String(new Date().getFullYear()))
  const [hledgerMode, setHledgerMode] = useState('issued')
  const [hledgerLoading, setHledgerLoading] = useState(false)
  const [hledgerError, setHledgerError] = useState(null)
  const [hledgerPreview, setHledgerPreview] = useState('')

  const clients = praxis?.clients || null

  async function loadBilling() {
    setBillingLoading(true)
    setBillingError(null)
    try {
      const r = await fetch('/api/billing/recent?limit=20')
      const d = await r.json()
      if (!r.ok || !d.ok) throw new Error(d.error || `HTTP ${r.status}`)
      setBilling(d)
    } catch (err) {
      setBillingError(String(err?.message || err))
    } finally {
      setBillingLoading(false)
    }
  }

  useEffect(() => { if (praxis?.ok) loadBilling() }, [praxis?.ok])

  async function togglePaid(invoiceId, paid) {
    setBusy(true)
    try {
      const r = await fetch(`/api/billing/invoice/${invoiceId}/paid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paid: !paid }),
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      await loadBilling()
    } catch (err) {
      alert(`Fehler: ${err.message}`)
    } finally {
      setBusy(false)
    }
  }

  async function deleteInvoice(invoiceId) {
    if (!confirm(`Rechnung #${invoiceId} wirklich löschen?`)) return
    setBusy(true)
    try {
      const r = await fetch(`/api/billing/invoice/${invoiceId}`, { method: 'DELETE' })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      await loadBilling()
    } catch (err) {
      alert(`Löschen fehlgeschlagen: ${err.message}`)
    } finally {
      setBusy(false)
    }
  }

  async function loadHledger() {
    setHledgerLoading(true)
    setHledgerError(null)
    setHledgerPreview('')
    try {
      const url = `/api/hledger/journal?year=${encodeURIComponent(hledgerYear)}&mode=${encodeURIComponent(hledgerMode)}`
      const res = await fetch(url)
      const txt = await res.text()
      if (!res.ok) throw new Error(txt || `HTTP ${res.status}`)
      setHledgerPreview(txt)
    } catch (err) {
      setHledgerError(String(err?.message || err))
    } finally {
      setHledgerLoading(false)
    }
  }

  const monthly = billing?.monthly || {}
  const maxMonthTotal = Math.max(...Object.values(monthly).map(m => m.total), 1)
  const yearTotal = Object.values(monthly).reduce((s, m) => s + m.total, 0)
  const yearPaid  = Object.values(monthly).reduce((s, m) => s + m.paid,  0)

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-800 font-semibold text-indigo-300 flex items-center justify-between">
        <span>Praxis / Rechnungen</span>
        <div className="flex items-center gap-3">
          {billing?.year && (
            <span className="text-xs font-mono text-gray-500">{billing.year}</span>
          )}
          <button
            onClick={loadBilling}
            disabled={billingLoading}
            className="text-xs text-gray-400 hover:text-gray-200 bg-gray-800 hover:bg-gray-700 px-2.5 py-1 rounded-lg transition disabled:opacity-50"
          >
            {billingLoading ? '…' : '↺ Reload'}
          </button>
        </div>
      </div>

      <div className="p-5 space-y-6">
        {/* KPI-Zeile */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-gray-950 border border-gray-800 rounded-lg p-3">
            <div className="text-xs text-gray-500 uppercase tracking-wider">DB</div>
            <div className="mt-1 text-sm text-gray-200">{praxis?.ok ? 'OK' : '—'}</div>
          </div>
          <div className="bg-gray-950 border border-gray-800 rounded-lg p-3">
            <div className="text-xs text-gray-500 uppercase tracking-wider">Clients</div>
            <div className="mt-1 text-xl font-bold text-gray-100">{clients ? clients.total : '—'}</div>
            <div className="text-xs text-gray-500">aktiv: {clients ? clients.aktiv : '—'}</div>
          </div>
          <div className="bg-gray-950 border border-gray-800 rounded-lg p-3">
            <div className="text-xs text-gray-500 uppercase tracking-wider">Umsatz {billing?.year || ''}</div>
            <div className="mt-1 text-xl font-bold text-indigo-300">{eur(yearTotal)}</div>
            <div className="text-xs text-gray-500">bezahlt: {eur(yearPaid)}</div>
          </div>
          <div className="bg-gray-950 border border-gray-800 rounded-lg p-3">
            <div className="text-xs text-gray-500 uppercase tracking-wider">Offen</div>
            <div className={`mt-1 text-xl font-bold ${praxis?.invoices?.open_count > 0 ? 'text-amber-300' : 'text-gray-400'}`}>
              {praxis?.invoices?.open_count ?? '—'}
            </div>
            <div className="text-xs text-gray-500">{praxis?.invoices ? eur(praxis.invoices.open_sum) : '—'}</div>
          </div>
        </div>

        {!praxis?.ok && praxis?.error && (
          <div className="text-sm text-rose-300">Praxis Fehler: {praxis.error}</div>
        )}

        {/* Monatsumsatz */}
        {Object.keys(monthly).length > 0 && (
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-3">Monatsumsatz {billing.year}</div>
            <div className="grid grid-cols-6 lg:grid-cols-12 gap-1.5">
              {MONATE.map((label, i) => {
                const m = monthly[String(i + 1)]
                const barH = m ? Math.round((m.total / maxMonthTotal) * 48) : 0
                const paidH = m ? Math.round((m.paid  / maxMonthTotal) * 48) : 0
                return (
                  <div key={i} className="flex flex-col items-center gap-1">
                    <div className="relative w-full flex items-end justify-center" style={{ height: 52 }}>
                      {barH > 0 && (
                        <div className="absolute bottom-0 w-full rounded-t-sm bg-indigo-900/60" style={{ height: barH }} />
                      )}
                      {paidH > 0 && (
                        <div className="absolute bottom-0 w-full rounded-t-sm bg-indigo-500/80" style={{ height: paidH }} />
                      )}
                      {!m && <div className="absolute bottom-0 w-full h-px bg-gray-800" />}
                    </div>
                    <div className="text-xs text-gray-500 font-mono">{label}</div>
                    {m && <div className="text-xs text-gray-400 font-mono leading-none">{Math.round(m.total)}€</div>}
                  </div>
                )
              })}
            </div>
            <div className="flex gap-4 mt-2">
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                <div className="w-3 h-3 rounded-sm bg-indigo-900/60" /> Gestellt
              </div>
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                <div className="w-3 h-3 rounded-sm bg-indigo-500/80" /> Bezahlt
              </div>
            </div>
          </div>
        )}

        {/* Letzte Rechnungen */}
        {billingError && (
          <div className="text-sm text-rose-300">Billing: {billingError}</div>
        )}

        {billing?.invoices && (
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Letzte Rechnungen</div>
            <div className="rounded-lg border border-gray-800 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-800/60">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-xs text-gray-400 uppercase tracking-wider font-medium">Datum</th>
                    <th className="px-4 py-2.5 text-left text-xs text-gray-400 uppercase tracking-wider font-medium">Klient</th>
                    <th className="px-4 py-2.5 text-left text-xs text-gray-400 uppercase tracking-wider font-medium hidden md:table-cell">Beschreibung</th>
                    <th className="px-4 py-2.5 text-right text-xs text-gray-400 uppercase tracking-wider font-medium">Betrag</th>
                    <th className="px-4 py-2.5 text-center text-xs text-gray-400 uppercase tracking-wider font-medium">Status</th>
                    <th className="px-3 py-2.5 w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/60">
                  {billing.invoices.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-6 text-center text-gray-500 text-sm">Keine Rechnungen</td>
                    </tr>
                  ) : billing.invoices.map(inv => (
                    <tr key={inv.id} className="group hover:bg-gray-800/30 transition-colors">
                      <td className="px-4 py-3 text-gray-300 font-mono text-xs whitespace-nowrap">{inv.date || '—'}</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => onSelectClient && inv.clientName !== 'unknown' && onSelectClient(inv.clientName)}
                          className="text-gray-200 hover:text-indigo-300 transition-colors text-left font-medium truncate max-w-[120px] block"
                          title={inv.clientName}
                        >
                          {inv.clientName || '—'}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs hidden md:table-cell truncate max-w-[140px]">
                        {inv.description || '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-gray-200 whitespace-nowrap">{eur(inv.amount)}</td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => togglePaid(inv.id, inv.paid)}
                          disabled={busy}
                          className={`text-xs px-2 py-0.5 rounded-full transition-opacity ${
                            inv.paid ? 'bg-emerald-950 text-emerald-300' : 'bg-rose-950 text-rose-300'
                          } ${busy ? 'opacity-50' : 'hover:opacity-80'}`}
                        >
                          {inv.paid ? 'bezahlt' : 'offen'}
                        </button>
                      </td>
                      <td className="px-3 py-3">
                        <button
                          onClick={() => deleteInvoice(inv.id)}
                          disabled={busy}
                          title="Löschen"
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-600 hover:text-rose-400 disabled:opacity-30"
                        >
                          <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                            <path d="M6.5 1h3a.5.5 0 0 1 .5.5v1H6v-1a.5.5 0 0 1 .5-.5zM11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3A1.5 1.5 0 0 0 5 1.5v1H2.506a.58.58 0 0 0-.01 0H1.5a.5.5 0 0 0 0 1h.538l.853 10.66A2 2 0 0 0 4.885 16h6.23a2 2 0 0 0 1.994-1.84l.853-10.66h.538a.5.5 0 0 0 0-1h-.995a.59.59 0 0 0-.01 0H11zm1.958 1l-.846 10.58a1 1 0 0 1-.997.92h-6.23a1 1 0 0 1-.997-.92L3.042 3.5h9.916z"/>
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* hledger Export — einklappbar */}
        <div className="border border-gray-800 rounded-lg overflow-hidden">
          <button
            onClick={() => setHledgerOpen(o => !o)}
            className="w-full flex items-center justify-between px-4 py-3 bg-gray-800/40 hover:bg-gray-800/70 transition text-sm text-gray-400 hover:text-gray-200"
          >
            <span className="font-medium">hledger Journal Export</span>
            <span className="text-xs font-mono">{hledgerOpen ? '▲' : '▼'}</span>
          </button>
          {hledgerOpen && (
            <div className="p-4 space-y-3">
              <div className="flex flex-wrap gap-2">
                <input
                  value={hledgerYear}
                  onChange={e => setHledgerYear(e.target.value)}
                  className="w-20 bg-gray-950 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-indigo-500"
                  placeholder="YYYY"
                />
                <select
                  value={hledgerMode}
                  onChange={e => setHledgerMode(e.target.value)}
                  className="bg-gray-950 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-indigo-500"
                >
                  <option value="issued">issued</option>
                  <option value="cash">cash</option>
                </select>
                <button
                  onClick={loadHledger}
                  disabled={hledgerLoading}
                  className="bg-indigo-700 hover:bg-indigo-600 disabled:bg-gray-800 disabled:text-gray-500 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition"
                >
                  {hledgerLoading ? 'Lade…' : 'Generieren'}
                </button>
              </div>
              {hledgerError && <div className="text-sm text-rose-300">{hledgerError}</div>}
              {hledgerPreview && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="text-xs text-gray-500 uppercase tracking-wider">Preview</div>
                    <button
                      onClick={() => navigator.clipboard.writeText(hledgerPreview)}
                      className="text-xs text-gray-300 hover:text-white bg-gray-800 hover:bg-gray-700 px-2.5 py-1 rounded-lg transition"
                    >
                      Copy
                    </button>
                  </div>
                  <textarea
                    value={hledgerPreview}
                    readOnly
                    rows={8}
                    className="w-full bg-gray-950 border border-gray-800 rounded-lg p-3 text-xs font-mono text-gray-200 focus:outline-none"
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function KonsolenUebersicht({ data, onSelectClient }) {
  const {
    kpis = {},
    todaySessions = [],
    redFlags = [],
    paymentAlerts = [],
    allClients = [],
    praxis = null,
  } = data || {}

  const kpiTiles = [
    { label: 'Heute aktiv', value: kpis.todaySessions ?? todaySessions.length, color: 'text-emerald-400' },
    { label: 'Nicht gesehen', value: redFlags.length, color: redFlags.length > 0 ? 'text-rose-400' : 'text-gray-400' },
    { label: 'Offene Zahlungen', value: paymentAlerts.length, color: paymentAlerts.length > 0 ? 'text-amber-400' : 'text-gray-400' },
  ]

  return (
    <div className="flex-1 bg-gray-950 p-6 overflow-auto">
      <div className="grid grid-cols-3 gap-4 mb-8">
        {kpiTiles.map((item, i) => (
          <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl p-5 text-center">
            <div className={`text-3xl font-bold ${item.color}`}>{item.value}</div>
            <div className="text-xs text-gray-500 mt-2 uppercase tracking-wider">{item.label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-800 font-semibold text-emerald-400">Heute</div>
          <div className="divide-y divide-gray-800">
            {todaySessions.length === 0 ? (
              <div className="px-5 py-10 text-center text-gray-500 text-sm">Keine Termine</div>
            ) : (
              todaySessions.map(s => (
                <button
                  key={s.clientId}
                  onClick={() => onSelectClient(s.clientId)}
                  className="w-full px-5 py-3.5 text-left hover:bg-gray-800/60 transition flex justify-between items-center"
                >
                  <div>
                    <div className="font-medium text-gray-100">{s.clientName}</div>
                    <div className="text-sm text-gray-400">{s.time} • {s.block}</div>
                  </div>
                  <span className="text-xs text-emerald-500/80">geplant</span>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-800 font-semibold text-rose-400">Nicht gesehen</div>
          <div className="divide-y divide-gray-800">
            {redFlags.length === 0 ? (
              <div className="px-5 py-10 text-center text-gray-500 text-sm">Alles gut</div>
            ) : (
              redFlags.map(f => (
                <button
                  key={f.clientId}
                  onClick={() => onSelectClient(f.clientId)}
                  className="w-full px-5 py-3.5 text-left hover:bg-gray-800/60 transition flex justify-between"
                >
                  <span className="font-medium text-gray-100">{f.name}</span>
                  <span className="text-rose-400 text-sm">{f.daysInactive}d</span>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-800 font-semibold text-amber-400">Zahlungen</div>
          <div className="divide-y divide-gray-800">
            {paymentAlerts.length === 0 ? (
              <div className="px-5 py-10 text-center text-gray-500 text-sm">Keine offenen Posten</div>
            ) : (
              paymentAlerts.map(p => (
                <button
                  key={p.clientId}
                  onClick={() => onSelectClient(p.clientId)}
                  className="w-full px-5 py-3.5 text-left hover:bg-gray-800/60 transition flex justify-between"
                >
                  <span className="font-medium text-gray-100">
                    {p.name}
                    <span className="ml-2 text-xs text-gray-500">({p.open_count} offen)</span>
                  </span>
                  <span className={`text-xs px-2.5 py-1 rounded-full ${
                    p.status === 'overdue' ? 'bg-rose-950 text-rose-300' : 'bg-amber-950 text-amber-300'
                  }`}>
                    {eur(p.open_sum)}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        <PraxisDashboard praxis={praxis} onSelectClient={onSelectClient} />
        <IntegrationHealth clients={allClients} onSelectClient={onSelectClient} />
      </div>
    </div>
  )
}

function IntegrationHealth({ clients = [], onSelectClient }) {
  const issues = clients.map(c => {
    const flags = []
    if (!c.has_plan)            flags.push('kein Plan')
    if (!c.has_habitsync_token) flags.push('kein HabitSync-Token')
    if (!c.has_wger_token)      flags.push('kein wger-Token')
    if (!c.has_crm_id)          flags.push('kein CRM-Link')
    return flags.length ? { ...c, flags } : null
  }).filter(Boolean)

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-800 font-semibold text-orange-400 flex items-center justify-between">
        <span>Integration Health</span>
        <span className="text-xs font-mono text-gray-500">{issues.length} / {clients.length} mit Lücken</span>
      </div>
      <div className="divide-y divide-gray-800">
        {issues.length === 0 ? (
          <div className="px-5 py-10 text-center text-gray-500 text-sm">Alle Integrationen vollständig</div>
        ) : (
          issues.map(c => (
            <button
              key={c.id}
              onClick={() => onSelectClient(c.id)}
              className="w-full px-5 py-3 text-left hover:bg-gray-800/60 transition"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium text-gray-100">{c.name || c.id}</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {c.flags.map(f => (
                  <span key={f} className="text-xs px-2 py-0.5 rounded-full bg-orange-950/60 text-orange-300 border border-orange-900/40">
                    {f}
                  </span>
                ))}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  )
}
