import React, { useState, useEffect } from 'react'
import KlientenSidebar from './KlientenSidebar.jsx'
import KonsolenUebersicht from './KonsolenUebersicht.jsx'
import KlientenDetail from './KlientenDetail.jsx'
import KlientAnlegen from './KlientAnlegen.jsx'

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, info: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    this.setState({ info });
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 text-red-500 bg-gray-950 h-screen overflow-auto">
          <h1 className="text-xl font-bold mb-4">React App Crashed (Whitescreen)</h1>
          <pre className="text-sm bg-gray-900 p-4 rounded mb-4">{String(this.state.error?.stack || this.state.error)}</pre>
          <pre className="text-xs bg-gray-900 p-4 rounded">{this.state.info?.componentStack}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

function AppContent() {
  const [data, setData] = useState(null)
  const [selectedClientId, setSelectedClientId] = useState(() => {
    const path = window.location.pathname;
    if (path !== '/' && !path.startsWith('/konsole') && !path.startsWith('/clientforge')) {
      return path.substring(1).replace(/\/$/, ''); // extract slug
    }
    return null;
  })
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const loadOverview = () => {
    fetch('/api/overview')
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then(obj => {
        if (!obj.ok) throw new Error('API response not ok')
        setData(obj)
        setLoading(false)
      })
      .catch(err => {
        setError(err.message)
        setLoading(false)
      })
  }

  useEffect(() => { loadOverview() }, [])

  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname;
      if (path !== '/' && !path.startsWith('/konsole') && !path.startsWith('/clientforge')) {
        setSelectedClientId(path.substring(1).replace(/\/$/, ''));
      } else {
        setSelectedClientId(null);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleSelectClient = (id) => {
    setSelectedClientId(id);
    if (id) {
      window.history.pushState({}, '', '/' + id);
    } else {
      window.history.pushState({}, '', '/');
    }
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-950">
        <div className="text-gray-500">Lade Übersicht…</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-950">
        <div className="text-red-400">Fehler: {error}</div>
      </div>
    )
  }

  const { allClients = [] } = data

  return (
    <div className="flex h-screen overflow-hidden bg-gray-950">
      <KlientenSidebar
        clients={allClients}
        selectedId={selectedClientId}
        onSelectClient={handleSelectClient}
        onCreateClient={() => setShowCreateModal(true)}
      />

      <div className="flex-1 overflow-y-auto">
        {selectedClientId ? (
          <KlientenDetail
            clientId={selectedClientId}
            onClose={() => handleSelectClient(null)}
          />
        ) : (
          <KonsolenUebersicht data={data} onSelectClient={handleSelectClient} />
        )}
      </div>

      {showCreateModal && (
        <KlientAnlegen
          onCreated={() => {
            setShowCreateModal(false)
            loadOverview()
          }}
          onCancel={() => setShowCreateModal(false)}
        />
      )}
    </div>
  )
}

export default function KonsolenApp() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  )
}
