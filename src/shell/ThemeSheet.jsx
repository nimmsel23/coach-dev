import { useRef } from 'react'
import { Check, X } from 'lucide-react'
import { useSwipeToDismiss } from '../hooks/useSwipeToDismiss.js'
import { useEscapeKey } from '../hooks/useEscapeKey.js'
import { useSettingsStore } from '../store/index.js'
import { DARK_THEMES, LIGHT_THEMES, THEMES } from './themes.js'

function Swatches({ ids, value, onPick }) {
  return (
    <div className="flex flex-wrap gap-2">
      {ids.map((id) => {
        const t = THEMES[id]
        const active = value === id
        return (
          <button
            key={id}
            onClick={() => onPick(id)}
            title={id}
            aria-label={id}
            aria-pressed={active}
            className="vos-press relative flex h-11 w-11 items-center justify-center rounded-2xl"
            style={{
              background: t.bg,
              boxShadow: active
                ? `0 0 0 2px var(--bg2), 0 0 0 4px ${t.accent}`
                : 'inset 0 0 0 1px color-mix(in srgb, var(--ink) 14%, transparent)',
            }}
          >
            <span className="h-3 w-3 rounded-full" style={{ background: t.accent }} />
            {active && <Check size={10} className="absolute -right-0.5 -top-0.5 rounded-full p-px" style={{ background: t.accent, color: t.bg }} />}
          </button>
        )
      })}
    </div>
  )
}

// Theme-Auswahl als Bottom-Sheet (Mobile) bzw. zentrierte Karte (Desktop) —
// Sheet-Muster aus ~/vitalos/src/App.jsx (HomeSheet).
export default function ThemeSheet({ open, onClose }) {
  const backdropRef = useRef(null)
  const sheetRef = useSwipeToDismiss(onClose, { enabled: open, backdropRef })
  useEscapeKey(onClose, open)
  const { theme, setTheme, themeMode, setThemeMode, circDark, setCircDark, circLight, setCircLight } = useSettingsStore()
  if (!open) return null
  const circadian = themeMode !== 'manual'

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center lg:items-center">
      <button ref={backdropRef} aria-label="Schließen" className="vos-fade-in absolute inset-0 bg-black/45" onClick={onClose} />
      <div
        ref={sheetRef}
        className="vos-sheet vos-sheet-in relative flex max-h-[85dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-[28px] shadow-2xl lg:rounded-[28px]"
        style={{ border: '1px solid color-mix(in srgb, var(--ink) 8%, transparent)', paddingBottom: 'var(--safe-bottom)' }}
      >
        <div className="flex items-center justify-between px-5 pb-1 pt-3">
          <div className="text-[17px] font-semibold text-fit-ink">Erscheinungsbild</div>
          <button onClick={onClose} aria-label="Schließen" className="vos-press vos-fill flex h-8 w-8 items-center justify-center rounded-full text-fit-dim">
            <X size={16} />
          </button>
        </div>
        <div className="space-y-5 overflow-y-auto overscroll-contain px-5 pb-5 pt-2">
          <button
            onClick={() => setThemeMode(circadian ? 'manual' : 'circadian')}
            aria-pressed={circadian}
            className="vos-press vos-surface flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left"
          >
            <span>
              <span className="block text-[15px] font-medium text-fit-ink">Automatisch nach Tageszeit</span>
              <span className="block text-[12px] text-fit-dim">Hell 8–20 Uhr, sonst dunkel</span>
            </span>
            <span className="vos-tag" style={circadian ? { background: 'var(--accent)', color: 'var(--bg)' } : undefined}>{circadian ? 'Ein' : 'Aus'}</span>
          </button>

          <div>
            <div className="vos-eyebrow mb-2">{circadian ? 'Nacht' : 'Dunkel'}</div>
            <Swatches ids={DARK_THEMES} value={circadian ? circDark : theme} onPick={circadian ? setCircDark : setTheme} />
          </div>
          <div>
            <div className="vos-eyebrow mb-2">{circadian ? 'Tag' : 'Hell'}</div>
            <Swatches ids={LIGHT_THEMES} value={circadian ? circLight : theme} onPick={circadian ? setCircLight : setTheme} />
          </div>
        </div>
      </div>
    </div>
  )
}
