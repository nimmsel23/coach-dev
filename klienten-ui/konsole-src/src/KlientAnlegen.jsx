import { useState } from 'react'
import { XMarkIcon } from '@heroicons/react/24/outline'

export default function KlientAnlegen({ onCreated, onCancel }) {
  const [name, setName] = useState('')
  const [customId, setCustomId] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  const handleSubmit = async e => {
    e.preventDefault()
    if (!name.trim()) return

    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/klienten/anlegen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          id: customId.trim() || undefined
        })
      })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error || 'Fehler beim Anlegen')
      setResult(json)
      onCreated?.(json)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const clientLink = result?.id ? `${window.location.origin}/k/${result.id}` : ''

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-gray-800">
          <h2 className="text-lg font-semibold text-gray-100">Neuen Klienten anlegen</h2>
          <button onClick={onCancel}>
            <XMarkIcon className="w-6 h-6 text-gray-400 hover:text-gray-200" />
          </button>
        </div>

        {!result ? (
          <form onSubmit={handleSubmit} className="p-5 space-y-5">
            <div>
              <label className="block text-sm text-gray-300 mb-1.5">Name *</label>
              <input
                required
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-gray-100 focus:outline-none focus:border-indigo-500"
                placeholder="z. B. Max Mustermann"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-300 mb-1.5">Optionale feste ID</label>
              <input
                value={customId}
                onChange={e => setCustomId(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-gray-100 focus:outline-none focus:border-indigo-500"
                placeholder="z. B. max123 (wird sonst auto-generiert)"
              />
            </div>

            {error && <div className="text-rose-400 text-sm">{error}</div>}

            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:text-gray-400 text-white py-3 rounded-lg font-medium transition-colors"
            >
              {loading ? 'Wird angelegt…' : 'Klient erstellen'}
            </button>
          </form>
        ) : (
          <div className="p-5 space-y-6">
            <div className="text-center">
              <div className="text-emerald-400 text-xl font-semibold mb-2">Erfolgreich angelegt!</div>
              <div className="text-gray-400 text-sm">ID: <strong className="text-gray-200">{result.id}</strong></div>
            </div>

            <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
              <div className="text-sm text-gray-300 mb-2">Klienten-Link (PWA):</div>
              <div className="font-mono text-sm text-gray-200 break-all mb-3">{clientLink}</div>
              <div className="flex gap-3">
                <button
                  onClick={() => navigator.clipboard.writeText(clientLink)}
                  className="flex-1 bg-gray-700 hover:bg-gray-600 text-gray-200 py-2 rounded-lg text-sm"
                >
                  Link kopieren
                </button>
                <a
                  href={clientLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 bg-indigo-600/80 hover:bg-indigo-600 text-white py-2 rounded-lg text-center text-sm"
                >
                  Link öffnen
                </a>
              </div>
            </div>

            <p className="text-xs text-gray-500 text-center">
              Sende diesen Link per WhatsApp oder E-Mail – der Klient kann die PWA direkt installieren.
            </p>

            <button
              onClick={onCancel}
              className="w-full bg-gray-800 hover:bg-gray-700 text-gray-300 py-3 rounded-lg"
            >
              Schließen
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
