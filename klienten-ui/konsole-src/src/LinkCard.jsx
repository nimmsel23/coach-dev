import { ClipboardDocumentIcon, ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline'

export default function LinkCard({ clientId }) {
  const clientLink = `${window.location.origin}/k/${clientId}`

  const copyLink = () => {
    navigator.clipboard.writeText(clientLink)
    alert('Link in Zwischenablage kopiert!')
  }

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-6">
      <h3 className="text-lg font-semibold text-indigo-300 mb-4">Klienten-Zugang (PWA)</h3>

      <div className="font-mono text-sm bg-gray-950 border border-gray-800 rounded-lg p-4 mb-4 break-all text-gray-200">
        {clientLink}
      </div>

      <div className="flex gap-3 mb-5">
        <button
          onClick={copyLink}
          className="flex-1 flex items-center justify-center gap-2 bg-gray-800 hover:bg-gray-700 text-gray-200 py-3 rounded-lg transition-colors"
        >
          <ClipboardDocumentIcon className="w-5 h-5" />
          Kopieren
        </button>
        <a
          href={clientLink}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white py-3 rounded-lg transition-colors"
        >
          <ArrowTopRightOnSquareIcon className="w-5 h-5" />
          Öffnen
        </a>
      </div>

      <p className="text-sm text-gray-500">
        Diesen Link per WhatsApp / E-Mail senden.<br />
        Der Klient öffnet ihn im Handy-Browser und kann die App direkt installieren.
      </p>
    </div>
  )
}
