import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, X, BookMarked, Copy, Check, Sparkles, Dumbbell } from 'lucide-react'
import { useEscapeKey } from '../../hooks/useEscapeKey.js'
import {
  categoryDe, equipmentDe, forceDe, levelDe, mechanicDe, muscleDe,
} from './labels.js'

function Fact({ label, value }) {
  if (!value) return null
  return (
    <div className="border-t border-fit-line pt-2">
      <div className="xa-label">{label}</div>
      <div className="xa-serif text-[18px] leading-tight text-fit-ink mt-0.5">{value}</div>
    </div>
  )
}

export default function DetailSheet({ ex, position, total, onClose, onStep, onOpenCatalog }) {
  const [copied, setCopied] = useState(false)
  useEscapeKey(onClose, !!ex)

  useEffect(() => {
    if (!ex) return undefined
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function onKey(e) {
      if (e.key === 'ArrowRight') onStep(1)
      else if (e.key === 'ArrowLeft') onStep(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [ex, onStep])

  if (!ex) return null
  const title = ex.catalog?.display_name || ex.name

  // Steps / Ausführungs-Fallbacks: falls ex.steps leer ist, auf ex.coaching_notes / catalog zurückgreifen
  const steps = (Array.isArray(ex.steps) && ex.steps.length > 0)
    ? ex.steps
    : (Array.isArray(ex.catalog?.coaching_notes) && ex.catalog.coaching_notes.length > 0)
      ? ex.catalog.coaching_notes
      : (Array.isArray(ex.coaching_notes) && ex.coaching_notes.length > 0)
        ? ex.coaching_notes
        : []

  const copyText = async () => {
    const lines = [
      `# ${title}`,
      ex.name && title !== ex.name ? `Original: ${ex.name}` : '',
      `Kategorie: ${categoryDe(ex.category)} | Equipment: ${equipmentDe(ex.equipment)} | Level: ${levelDe(ex.level)}`,
      ex.primary?.length ? `Primärmuskeln: ${ex.primary.map(muscleDe).join(', ')}` : '',
      ex.secondary?.length ? `Sekundärmuskeln: ${ex.secondary.map(muscleDe).join(', ')}` : '',
      '',
      steps.length ? `Ausführung:\n${steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}` : '',
    ].filter(Boolean).join('\n')

    try {
      await navigator.clipboard.writeText(lines)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {}
  }

  return createPortal(
    <>
      <div className="xa-scrim" onClick={onClose} />
      <aside className="xa xa-sheet text-fit-ink" role="dialog" aria-modal="true" aria-label={title}>
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-5 py-3.5 bg-fit-bg/95 backdrop-blur-md border-b border-fit-line shadow-xs">
          <div className="flex items-center gap-2">
            <span className="xa-label font-bold text-fit-accent">Tafel {position} / {total}</span>
            {ex.catalog && (
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-fit-accent/15 text-fit-accent border border-fit-accent/30 inline-flex items-center gap-1">
                <Sparkles size={11} /> Katalog
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={copyText}
              title="Übungsdetails kopieren"
              className="p-2 rounded-full border border-fit-line text-fit-muted hover:text-fit-ink hover:bg-white/5 transition-all"
            >
              {copied ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
            </button>
            <button
              type="button"
              onClick={() => onStep(-1)}
              aria-label="Vorherige Übung"
              className="p-2 rounded-full border border-fit-line text-fit-muted hover:text-fit-ink hover:bg-white/5 transition-all"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              onClick={() => onStep(1)}
              aria-label="Nächste Übung"
              className="p-2 rounded-full border border-fit-line text-fit-muted hover:text-fit-ink hover:bg-white/5 transition-all"
            >
              <ChevronRight size={16} />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Schließen"
              className="p-2 rounded-full bg-fit-accent text-fit-bg hover:opacity-90 transition-opacity"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="p-5 sm:p-7 space-y-6">
          <div>
            <h2 className="xa-serif text-[32px] sm:text-[42px] leading-[1.05] tracking-tight">{title}</h2>
            {ex.catalog && title !== ex.name && <div className="xa-mono text-xs text-fit-dim mt-1.5">{ex.name}</div>}
          </div>

          {ex.images.length > 0 && (
            <div className="space-y-2">
              <div className="xa-flip shadow-inner">
                {ex.images.map((src) => <img key={src} src={src} alt="" decoding="async" />)}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {ex.images.map((src, i) => (
                  <figure key={src} className="m-0">
                    <img src={src} alt="" loading="lazy" className="w-full aspect-[4/3] object-cover rounded-xl bg-fit-bg2 border border-fit-line/40" />
                    <figcaption className="xa-label mt-1 text-center font-medium opacity-80">{i === 0 ? '▶ Startposition' : '◼ Endposition'}</figcaption>
                  </figure>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-5 gap-y-4 bg-fit-bg2/40 p-4 rounded-2xl border border-fit-line/60">
            <Fact label="Kategorie" value={categoryDe(ex.category)} />
            <Fact label="Equipment" value={equipmentDe(ex.equipment)} />
            <Fact label="Level" value={levelDe(ex.level)} />
            <Fact label="Bewegung" value={forceDe(ex.force)} />
            <Fact label="Typ" value={mechanicDe(ex.mechanic)} />
          </div>

          <div className="space-y-4">
            <div>
              <div className="xa-label mb-2 flex items-center gap-1.5">
                <Dumbbell size={13} className="text-fit-accent" /> Primäre Muskelgruppen
              </div>
              <div className="flex flex-wrap gap-2">
                {ex.primary.length ? ex.primary.map((m) => (
                  <span key={m} className="xa-chip font-medium shadow-xs" data-on="true">{muscleDe(m)}</span>
                )) : <span className="text-fit-dim text-sm">—</span>}
              </div>
            </div>
            {ex.secondary.length > 0 && (
              <div>
                <div className="xa-label mb-2">Sekundäre Synergisten</div>
                <div className="flex flex-wrap gap-2">
                  {ex.secondary.map((m) => <span key={m} className="xa-chip opacity-85">{muscleDe(m)}</span>)}
                </div>
              </div>
            )}
          </div>

          {steps.length > 0 ? (
            <div className="border-t border-fit-line/80 pt-5">
              <div className="xa-label mb-3.5 flex items-center justify-between">
                <span>Ausführungs-Schritte</span>
                <span className="normal-case tracking-normal text-xs text-fit-dim">Schritt-für-Schritt Anleitung</span>
              </div>
              <ol className="space-y-3.5 list-none p-0 m-0">
                {steps.map((step, i) => (
                  <li key={i} className="xa-step p-3.5 rounded-2xl bg-fit-bg2/30 border border-fit-line/40 hover:border-fit-line transition-colors">
                    <span className="xa-step-n">{i + 1}</span>
                    <p className="text-[14.5px] leading-relaxed text-fit-ink/90 m-0 select-text">{step}</p>
                  </li>
                ))}
              </ol>
            </div>
          ) : (
            <div className="border-t border-fit-line/80 pt-5">
              <div className="p-4 rounded-2xl bg-fit-bg2/20 border border-dashed border-fit-line text-sm text-fit-dim text-center">
                Keine Schritt-für-Schritt-Anleitung hinterlegt.
              </div>
            </div>
          )}

          {ex.catalog && onOpenCatalog && (
            <button
              type="button"
              onClick={() => onOpenCatalog(ex.catalog)}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-fit-accent text-fit-bg font-bold text-xs uppercase tracking-widest shadow-md hover:brightness-110 active:scale-[0.99] transition-all"
            >
              <BookMarked size={15} /> Katalog-Eintrag / Coach Sheet öffnen
            </button>
          )}
        </div>
      </aside>
    </>,
    document.body,
  )
}
