/**
 * SessionHeaderMenu — the "Mehr" overflow button + its portal dropdown
 * (Session-Details / Übungsquellen), extracted 1:1 out of SessionHeader.jsx.
 * Pure extraction, no behavior change — prep for the Phase 4 modal
 * centralization, not that centralization itself.
 */

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal } from 'lucide-react';
import { useEscapeKey } from '../../hooks/useEscapeKey.js';
import { IS_SOLO } from '../../constants/NavigationItems.js';

// Solo-Build (vos-training.web.app) hat weder Bottom-Nav noch Sidebar —
// Plan und History sind dort nur über dieses Menü erreichbar.
const SOLO_LINKS = [
  { id: 'plan', label: 'Plan ↗', href: 'https://vos-plan.web.app/' },
  { id: 'history', label: 'History' },
  { id: 'logbuch', label: 'Logbuch' },
  { id: 'atlas', label: 'Atlas ↗', href: 'https://vos-atlas.web.app/' },
];

export default function SessionHeaderMenu({ onOpenSidebar, onOpenSettings, subTab, onSubNav }) {
  const [moreOpen, setMoreOpen] = useState(false);

  // ESC schließt das "Mehr"-Dropdown.
  useEscapeKey(() => setMoreOpen(false), moreOpen);

  return (
    <div className="relative">
      <button
        onClick={() => setMoreOpen(v => !v)}
        className="w-8 h-8 rounded-full flex items-center justify-center transition-colors"
        style={{ color: 'var(--dim)' }}
        title="Mehr"
      >
        <MoreHorizontal size={15} />
      </button>
      {moreOpen && createPortal(
        <>
          <div className="fixed inset-0 z-[150]" onClick={() => setMoreOpen(false)} />
          <div
            className="fixed right-3 top-14 z-[151] w-44 rounded-xl overflow-hidden shadow-xl"
            style={{ background: 'var(--card)', border: '1px solid var(--line)' }}
          >
            {IS_SOLO && onSubNav && SOLO_LINKS.map(({ id, label, href }) => href ? (
              <a
                key={id}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setMoreOpen(false)}
                className="block w-full text-left px-4 py-2.5 text-xs font-medium transition-colors"
                style={{ color: 'var(--ink)' }}
              >
                {label}
              </a>
            ) : (
              <button
                key={id}
                onClick={() => { setMoreOpen(false); onSubNav(id); }}
                className="w-full text-left px-4 py-2.5 text-xs font-medium transition-colors"
                style={{ color: subTab === id ? 'var(--accent)' : 'var(--ink)' }}
              >
                {label}
              </button>
            ))}
            <button
              onClick={() => { setMoreOpen(false); onOpenSidebar(); }}
              className="w-full text-left px-4 py-2.5 text-xs font-medium transition-colors"
              style={{ color: 'var(--ink)' }}
            >
              Session-Details
            </button>
            <button
              onClick={() => { setMoreOpen(false); onOpenSettings(); }}
              className="w-full text-left px-4 py-2.5 text-xs font-medium transition-colors"
              style={{ color: 'var(--ink)' }}
            >
              Übungsquellen
            </button>
          </div>
        </>,
        document.body
      )}
    </div>
  );
}
