import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import ClientWorkoutsFeed from '../../src/views/Coach/ClientWorkoutsFeed.jsx'
import '../../src/styles.css'

function Fixture() {
  const [highlightDate, setHighlightDate] = useState('2026-11-10')
  return (
    <main className="mx-auto max-w-3xl bg-fit-bg p-3 text-fit-ink">
      <nav className="mb-4 flex flex-wrap gap-2">
        <button type="button" className="min-h-11 rounded-full border border-fit-line px-3 text-sm" onClick={() => setHighlightDate('2026-11-10')}>
          Tag mit Eintrag
        </button>
        <button type="button" className="min-h-11 rounded-full border border-fit-line px-3 text-sm" onClick={() => setHighlightDate('2026-01-01')}>
          Tag ohne Eintrag
        </button>
      </nav>
      <ClientWorkoutsFeed
        clientUid="client-a"
        highlightDate={highlightDate}
        onDismissHighlight={highlightDate ? () => setHighlightDate('') : undefined}
      />
    </main>
  )
}

createRoot(document.getElementById('root')).render(<Fixture />)
