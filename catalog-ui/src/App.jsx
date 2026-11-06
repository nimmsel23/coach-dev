import { useState, useEffect, useCallback } from 'react';
import { Database, Inbox, Search, Activity, Calendar, TrendingUp, RefreshCw, Sparkles } from 'lucide-react';
import './index.css';
import { api } from './api';
import { NavItem } from './Shared';
import InboxTab from './Inbox';
import BrowserTab from './Browser';
import PlanTab from './Plan';
import WeeklyTab from './Review';
import CoverageTab from './Coverage';

function App() {
  const [activeTab, setActiveTab] = useState('inbox');
  const [health, setHealth] = useState(null);
  const [selectedExId, setSelectedExId] = useState(null);
  const [notification, setNotification] = useState(null);

  // Health-Check
  const checkHealth = useCallback(() => {
    api('/health')
      .then(() => setHealth(true))
      .catch(() => setHealth(false));
  }, []);

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 15000);
    return () => clearInterval(interval);
  }, [checkHealth]);

  // Zeigt eine kurze Benachrichtigung an
  const showToast = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const handleSelectExercise = (id) => {
    setSelectedExId(id);
    setActiveTab('browser');
  };

  return (
    <div className="flex h-screen bg-background text-text overflow-hidden font-sans">
      {/* Toast Notification */}
      {notification && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl border shadow-2xl transition-all duration-300 animate-slide-in ${
          notification.type === 'success'
            ? 'bg-success/20 border-success/30 text-success'
            : 'bg-danger/20 border-danger/30 text-danger'
        }`}>
          <Sparkles className="w-5 h-5 shrink-0" />
          <span className="font-mono text-sm">{notification.message}</span>
        </div>
      )}

      {/* Sidebar */}
      <div className="w-64 glass-panel m-4 flex flex-col rounded-2xl border-white/5 bg-surface/40">
        <div className="p-6 border-b border-white/5">
          <h1 className="text-xl font-mono font-bold flex items-center gap-2 text-primary">
            <Database className="w-5 h-5" />
            Catalog UI
          </h1>
          <p className="text-[10px] text-muted font-mono mt-1 opacity-70">
            AlphaOS Fitness command center
          </p>
        </div>

        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          <NavItem icon={<Inbox />} label="Inbox" active={activeTab === 'inbox'} onClick={() => setActiveTab('inbox')} />
          <NavItem icon={<Search />} label="Browser" active={activeTab === 'browser'} onClick={() => setActiveTab('browser')} />
          <NavItem icon={<Calendar />} label="Plan Builder" active={activeTab === 'plan'} onClick={() => setActiveTab('plan')} />
          <NavItem icon={<TrendingUp />} label="Weekly Review" active={activeTab === 'weekly'} onClick={() => setActiveTab('weekly')} />
          <NavItem icon={<Activity />} label="Coverage" active={activeTab === 'coverage'} onClick={() => setActiveTab('coverage')} />
        </nav>

        <div className="p-4 border-t border-white/5 text-[11px] text-muted font-mono flex flex-col gap-1 bg-surface/20 rounded-b-2xl">
          <div className="flex items-center justify-between">
            <span>Stack API:</span>
            <span className="text-primary">:9150</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Client:</span>
            <span className="text-success">:9160</span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-4 pl-0 flex flex-col overflow-hidden">
        <header className="glass-panel mb-4 p-4 px-6 flex items-center justify-between rounded-2xl border-white/5 bg-surface/40 shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold font-mono capitalize tracking-wide text-text/90">{activeTab.replace('-', ' ')}</h2>
            <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-[10px] font-mono text-muted">Dev-Server</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={checkHealth}
              className="p-1.5 rounded-lg hover:bg-white/5 border border-transparent hover:border-white/10 text-muted transition-all active:scale-95"
              title="Verbindung prüfen"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2 bg-white/5 px-3 py-1.5 rounded-xl border border-white/10">
              <span className={`w-2 h-2 rounded-full ${health === null ? 'bg-muted animate-pulse' : health ? 'bg-success shadow-lg shadow-success/40' : 'bg-danger shadow-lg shadow-danger/40'}`}></span>
              <span className="text-xs text-muted font-mono">
                {health === null ? 'Prüfe Backend…' : health ? 'Backend verbunden' : 'Backend offline'}
              </span>
            </div>
          </div>
        </header>

        <main className="flex-1 glass-panel p-6 rounded-2xl border-white/5 bg-surface/20 overflow-hidden relative">
          {activeTab === 'inbox' && <InboxTab showToast={showToast} />}
          {activeTab === 'browser' && <BrowserTab selectedExId={selectedExId} setSelectedExId={setSelectedExId} showToast={showToast} />}
          {activeTab === 'plan' && <PlanTab onSelectExercise={handleSelectExercise} showToast={showToast} />}
          {activeTab === 'weekly' && <WeeklyTab showToast={showToast} />}
          {activeTab === 'coverage' && <CoverageTab />}
        </main>
      </div>
    </div>
  );
}

export default App;
