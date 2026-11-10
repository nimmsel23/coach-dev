import { useState } from 'react'
import { UserPlusIcon } from '@heroicons/react/24/outline'

export default function KlientenSidebar({ clients, selectedId, onSelectClient, onCreateClient }) {
  const [search, setSearch] = useState('')

  const filtered = clients.filter(c =>
    c.name?.toLowerCase().includes(search.toLowerCase())
  )

  const getStatusColor = (client) => {
    if (!client.sessions_last) return 'bg-gray-600'
    const days = Math.floor((Date.now() - new Date(client.sessions_last).getTime()) / 86400000)
    if (days <= 7) return 'bg-emerald-500'
    if (days >= 14) return 'bg-rose-600'
    return 'bg-amber-500'
  }

  return (
    <div className="w-72 bg-gray-950 border-r border-gray-800 flex flex-col h-screen">
      <div className="p-4 border-b border-gray-800">
        <div className="relative">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Klienten suchen..."
            className="w-full bg-gray-900 text-gray-100 border border-gray-700 rounded-lg pl-4 pr-10 py-2.5 text-sm focus:outline-none focus:border-indigo-500/60 placeholder-gray-500"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">
            {filtered.length}/{clients.length}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {filtered.map(client => {
          const isActive = selectedId === client.id
          return (
            <button
              key={client.id}
              onClick={() => onSelectClient(client.id)}
              className={`w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-gray-900/70 transition-colors ${
                isActive ? 'bg-indigo-950/40 border-l-4 border-indigo-500' : ''
              }`}
            >
              <div className={`w-3 h-3 rounded-full flex-shrink-0 ${getStatusColor(client)}`} />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-100 truncate">{client.name || client.id}</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {client.sessions_last ? `Letztes Training: ${client.sessions_last}` : 'Noch kein Training'}
                </div>
              </div>
              {client.sessions_total > 0 && (
                <span className="text-xs bg-gray-800 text-gray-300 px-2 py-0.5 rounded-full" title={`${client.sessions_total} Einheiten gesamt`}>
                  {client.sessions_total}
                </span>
              )}
            </button>
          )
        })}
        {filtered.length === 0 && search && (
          <div className="p-6 text-center text-gray-500 text-sm">Keine Treffer</div>
        )}
      </div>

      <div className="p-4 border-t border-gray-800">
        <button
          onClick={onCreateClient}
          className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white py-2.5 rounded-lg font-medium transition-colors"
        >
          <UserPlusIcon className="w-5 h-5" />
          Neuer Klient
        </button>
      </div>
    </div>
  )
}
