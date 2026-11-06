import { memo } from 'react'
import { categoryDe, levelDe, muscleDe, LEVEL_ORDER, norm } from './labels.js'

function Pips({ level }) {
  const rank = LEVEL_ORDER.indexOf(norm(level)) + 1
  if (!rank) return null
  return (
    <span className="xa-pips" title={levelDe(level)} aria-label={levelDe(level)}>
      {LEVEL_ORDER.map((l, i) => <i key={l} data-on={i < rank} />)}
    </span>
  )
}

function Plate({ ex, index, onOpen }) {
  const title = ex.catalog?.display_name || ex.name
  return (
    <button type="button" className="xa-plate" style={{ '--i': index }} onClick={() => onOpen(ex)}>
      <div className="xa-plate-img">
        <span className="xa-plate-no">№ {String(index + 1).padStart(3, '0')}</span>
        {ex.images.map((src) => (
          <img key={src} src={src} alt="" loading="lazy" decoding="async"
            onError={(e) => { e.currentTarget.style.display = 'none' }} />
        ))}
      </div>
      <div className="flex flex-col gap-2 px-3.5 pt-3 pb-3.5 flex-1">
        <div className="xa-serif text-[17px] leading-[1.15] text-fit-ink">{title}</div>
        {ex.catalog && title !== ex.name && (
          <div className="xa-mono text-[10px] text-fit-dim -mt-1">{ex.name}</div>
        )}
        <div className="mt-auto flex items-end justify-between gap-2 pt-1">
          <div className="xa-mono text-[10.5px] leading-snug text-fit-muted">
            <span className="text-fit-accent">{ex.primary.map(muscleDe).join(' · ') || '—'}</span>
            <br />
            {categoryDe(ex.category)}
          </div>
          <Pips level={ex.level} />
        </div>
      </div>
    </button>
  )
}

export default memo(Plate)
