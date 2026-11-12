import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import './coach-console-preview.css'
import { buildClientConsole } from '../../src/views/Coach/clientConsoleStats.js'
import ClientConsoleView from '../../src/views/Coach/ClientConsoleView.jsx'

const push = (id, date, name, reps) => ({
  id,
  type: 'workout',
  date,
  block: 'Push',
  exercises: [{ name, setsArray: [{ reps, weight: 60 }, { reps: reps - 1, weight: 60 }] }],
})

const clients = {
  anna: {
    label: 'Anna · Logs und Ruhephase',
    nutritionAccess: 'ok',
    model: buildClientConsole([
      push('a1', '2026-11-01', 'Bankdrücken', 8),
      push('a2', '2026-11-04', 'Schrägbank', 10),
      push('a3', '2026-11-08', 'Dips', 12),
    ]),
  },
  ben: {
    label: 'Ben · Makros vorhanden',
    nutritionAccess: 'ok',
    model: buildClientConsole(
      [push('b1', '2026-11-02', 'Kniebeuge', 5), { id: 'b2', type: 'workout', date: '2026-11-06', block: 'Legs', exercises: [{ name: 'Kreuzheben', sets: 3, reps: 5, weight: 100 }] }],
      [
        { date: '2026-11-02', meals: [{ kcal: 800, protein: 45, carbs: 70, fat: 22 }, { kcal: 600, protein: 35, carbs: 50, fat: 18 }] },
        { date: '2026-11-06', macros: { kcal: 2100, protein: 160, carbs: 190, fat: 70 } },
      ],
    ),
  },
  clara: {
    label: 'Clara · Leer',
    nutritionAccess: 'ok',
    model: buildClientConsole([]),
  },
  dana: {
    label: 'Dana · Makros nicht freigegeben',
    nutritionAccess: 'denied',
    model: buildClientConsole([
      { id: 'd1', type: 'workout', date: '2026-11-03', block: 'Pull', exercises: [{ name: 'Rudern', setsArray: [{ reps: 8, weight: 40 }] }] },
    ]),
  },
}

function Fixture() {
  const [clientId, setClientId] = useState('anna')
  const [comments, setComments] = useState({})
  const [notice, setNotice] = useState('')
  const client = clients[clientId]
  return (
    <main style={{ maxWidth: 860, margin: '0 auto', padding: 16, display: 'grid', gap: 16 }}>
      <nav style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }} aria-label="Beispielklienten">
        {Object.entries(clients).map(([id, item]) => (
          <button
            key={id}
            type="button"
            style={{ minHeight: 44, borderRadius: 999, padding: '0 12px' }}
            aria-pressed={clientId === id}
            onClick={() => { setClientId(id); setNotice('') }}
          >
            {item.label}
          </button>
        ))}
      </nav>
      {notice && <p role="status">{notice}</p>}
      <ClientConsoleView
        model={client.model}
        nutritionAccess={client.nutritionAccess}
        comments={comments}
        onCommentChange={(id, text) => setComments((prev) => ({ ...prev, [id]: text }))}
        onCommentSubmit={(log) => setNotice(`Kommentar für ${log.date} gespeichert.`)}
      />
    </main>
  )
}

createRoot(document.getElementById('root')).render(<Fixture />)
