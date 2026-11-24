import { useCallback, useEffect, useMemo, useState } from 'react'
import { loadCooBrain } from '../brain.js'
import { buildTodayFocus, computeKpis, fetchClients } from '../data.js'
import {
  appendThreadMessage,
  loadThreadMessages,
  setApprovalStatus,
  watchApprovals,
} from '../firestore.js'
import { fetchEngines, runChat, runSkill } from '../skills.js'
import Header from './Header.jsx'
import TodayLane from './TodayLane.jsx'
import SkillConsole from './SkillConsole.jsx'
import ApprovalQueue from './ApprovalQueue.jsx'
import './coo.css'

const brain = loadCooBrain()

function pickDefaultEngine(list) {
  const available = new Set((list || []).filter((e) => e.available !== false).map((e) => e.id))
  for (const id of ['gemini', 'claude', 'agy', 'cursor-agent', 'codex', 'stub']) {
    if (available.has(id) || (!list?.length && id === 'gemini')) return id
  }
  return 'stub'
}

export default function CooCockpit() {
  const [engine, setEngine] = useState('gemini')
  const [engines, setEngines] = useState([])
  const [clients, setClients] = useState([])
  const [cards, setCards] = useState([])
  const [approvals, setApprovals] = useState([])
  const [messages, setMessages] = useState(() => loadThreadMessages())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [dataSource, setDataSource] = useState('')
  const [busy, setBusy] = useState(false)
  const [showPrompt, setShowPrompt] = useState(false)
  const [lastEngine, setLastEngine] = useState('')

  useEffect(() => {
    return watchApprovals(setApprovals)
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const list = await fetchEngines()
      if (cancelled) return
      setEngines(list)
      setEngine((prev) => {
        const next = pickDefaultEngine(list)
        const stillOk = list.some((e) => e.id === prev && e.available !== false)
        return stillOk ? prev : next
      })
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const list = await fetchClients()
        if (cancelled) return
        setClients(list)
        const focus = await buildTodayFocus(list)
        if (cancelled) return
        setCards(focus)
        setDataSource(list.length ? `:9150 · ${list.length} Klienten` : ':9150 · leer')
      } catch (err) {
        if (cancelled) return
        setError(err?.message || String(err))
        setDataSource('Stub / offline')
        setCards([
          {
            clientId: 'demo-max',
            name: 'Max Mustermann (Demo)',
            sessionLabel: 'Session 4 von 8 · Demo',
            briefing: [
              'Demo-Modus: Coach-API nicht erreichbar.',
              'Blockade: Perfektionismus bei Hausaufgaben.',
              'Ziel heute: eine machbare Mikro-Übung vereinbaren.',
            ],
            today: null,
          },
        ])
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const kpis = useMemo(() => computeKpis(clients, cards, approvals), [clients, cards, approvals])

  const onSkill = useCallback(
    async (skillId, ctx) => {
      setBusy(true)
      try {
        const item = await runSkill(brain, skillId, ctx, { engine })
        setLastEngine(item.engine || engine)
      } catch (err) {
        console.error(err)
        alert(err?.message || String(err))
      } finally {
        setBusy(false)
      }
    },
    [engine],
  )

  const onChat = useCallback(
    async (text) => {
      appendThreadMessage('user', text)
      setBusy(true)
      try {
        const { text: reply, engine: used } = await runChat(brain, text, { engine })
        setLastEngine(used)
        const next = appendThreadMessage('assistant', reply)
        setMessages(next)
      } finally {
        setBusy(false)
      }
    },
    [engine],
  )

  return (
    <div className="coo-root">
      <Header
        versionLabel={brain.versionLabel}
        engine={engine}
        onEngineChange={setEngine}
        engines={engines}
        kpis={kpis}
        dataSource={dataSource}
      />
      <p className="coo-status" style={{ margin: 0 }}>
        Bridge: <code>POST /api/csuite/run</code>
        {lastEngine ? ` · zuletzt ${lastEngine}` : ''}
        {' · '}
        <button type="button" className="coo-btn ghost" onClick={() => setShowPrompt((v) => !v)}>
          {showPrompt ? 'Prompt ausblenden' : 'System-Prompt'}
        </button>
      </p>
      {showPrompt && (
        <pre className="coo-preview" style={{ maxHeight: '12rem' }}>
          {brain.systemPrompt}
        </pre>
      )}
      <div className="coo-grid">
        <TodayLane cards={cards} loading={loading} error={error} busySkill={busy} onSkill={onSkill} />
        <SkillConsole messages={messages} busy={busy} onChat={onChat} onSkill={onSkill} />
        <ApprovalQueue
          items={approvals}
          busy={busy}
          onApprove={async (id) => {
            setBusy(true)
            try {
              await setApprovalStatus(id, 'approved')
            } finally {
              setBusy(false)
            }
          }}
          onReject={async (id) => {
            setBusy(true)
            try {
              await setApprovalStatus(id, 'rejected')
            } finally {
              setBusy(false)
            }
          }}
          onSaveEdit={async (id, preview) => {
            setBusy(true)
            try {
              await setApprovalStatus(id, 'pending_approval', { preview })
            } finally {
              setBusy(false)
            }
          }}
        />
      </div>
    </div>
  )
}
