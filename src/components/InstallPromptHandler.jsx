import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Download } from 'lucide-react';

export function InstallPromptHandler() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const isDismissed = localStorage.getItem('fitness-install-prompt-dismissed');
    if (isDismissed) setDismissed(true);

    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowPrompt(true);
      window.dispatchEvent(new CustomEvent('fitness-auth-gate-trigger', {
        detail: { source: 'beforeinstallprompt', at: Date.now() },
      }));
    };

    const handleAppInstalled = () => {
      window.dispatchEvent(new CustomEvent('fitness-auth-gate-trigger', {
        detail: { source: 'appinstalled', at: Date.now() },
      }));
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === 'accepted') {
      setShowPrompt(false);
      setDeferredPrompt(null);
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem('fitness-install-prompt-dismissed', 'true');
    setDismissed(true);
  };

  // Nur zeigen wenn:
  // - beforeinstallprompt Event vorhanden ist (Android)
  // - Nicht bereits dismissed
  if (!showPrompt || dismissed || !deferredPrompt) {
    return null;
  }

  return createPortal(
    <div className="fixed top-20 left-4 right-4 z-50 animate-in fade-in slide-in-from-top-4 duration-300">
      <div className="bg-fit-accent/10 border border-fit-accent/20 rounded-2xl p-4 flex items-center gap-4 shadow-lg backdrop-blur-xs">
        <Download size={20} className="text-fit-accent flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-fit-ink">App installieren?</p>
          <p className="text-xs text-fit-dim mt-1">Direkter Zugriff vom Home-Bildschirm</p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <button
            onClick={handleInstall}
            className="px-4 py-2 bg-fit-accent text-white rounded-lg font-bold text-xs uppercase active:scale-95 transition-transform"
          >
            Ja
          </button>
          <button
            onClick={handleDismiss}
            className="px-4 py-2 bg-fit-bg2 text-fit-dim rounded-lg font-bold text-xs uppercase active:scale-95 transition-transform border border-fit-line"
          >
            Nein
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
