import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import ClientWorkoutsFeed from '../../src/views/Coach/ClientWorkoutsFeed.jsx'
import ClientConsoleView from '../../src/views/Coach/ClientConsoleView.jsx'
import { buildClientConsole } from '../../src/views/Coach/clientConsoleStats.js'
import '../../src/styles.css'

const consoleModel = buildClientConsole([
  {
    id: 'push-10',
    type: 'workout',
    date: '2026-11-10',
    block: 'Push',
    exercises: [{ name: 'Bankdrücken', setsArray: [{ reps: 8, weight: 60 }] }],
  },
  {
    id: 'pull-08',
    type: 'workout',
    date: '2026-11-08',
    block: 'Pull',
    exercises: [{ name: 'Klimmzug', setsArray: [{ reps: 6 }] }],
  },
])

function Fixture() {
  const [highlightDate, setHighlightDate] = useState('2026-11-10')
  const [surface, setSurface] = useState('feed')
  const dismiss = highlightDate ? () => setHighlightDate('') : undefined
  return (
    <main className="mx-auto max-w-3xl bg-fit-bg p-3 text-fit-ink">
      <nav className="mb-4 flex flex-wrap gap-2">
        <button type="button" className="min-h-11 rounded-full border border-fit-line px-3 text-sm" onClick={() => setSurface('feed')}>
          Feed
        </button>
        <button type="button" className="min-h-11 rounded-full border border-fit-line px-3 text-sm" onClick={() => setSurface('console')}>
          Konsole
        </button>
        <button type="button" className="min-h-11 rounded-full border border-fit-line px-3 text-sm" onClick={() => setHighlightDate('2026-11-10')}>
          Tag mit Eintrag
        </button>
        <button type="button" className="min-h-11 rounded-full border border-fit-line px-3 text-sm" onClick={() => setHighlightDate('2026-01-01')}>
          Tag ohne Eintrag
        </button>
      </nav>
      {surface === 'console' ? (
        <ClientConsoleView model={consoleModel} highlightDate={highlightDate} onDismissHighlight={dismiss} />
      ) : (
        <ClientWorkoutsFeed clientUid="client-a" highlightDate={highlightDate} onDismissHighlight={dismiss} />
      )}
    </main>
  )
}

createRoot(document.getElementById('root')).render(<Fixture />)
