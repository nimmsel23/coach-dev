import { useMemo, useState } from 'react'
import { HardDriveDownload, RefreshCw, Trash2, Loader2, ExternalLink, Images, Square } from 'lucide-react'
import { EXERCISE_DB_SOURCES } from '../../lib/exerciseDbs/sources.js'
import { useImageMirror } from '../../lib/exerciseDbs/useImageMirror.js'

function fmtBytes(n) {
  if (!n) return '—'
  return n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`
}

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function ImageSection({ source, items }) {
  const urls = useMemo(() => items.flatMap((ex) => ex.images), [items])
  const mirror = useImageMirror(source.id, urls)
  const [confirming, setConfirming] = useState(false)
  if (!mirror.supported || urls.length === 0) return null

  const { status, progress, result } = mirror
  const complete = status.cached >= status.total
  const running = !!progress
  const pct = running ? Math.round((progress.done / Math.max(progress.total, 1)) * 100) : 0

  return (
    <div className="mt-3 pt-3 border-t border-dashed border-fit-line space-y-2">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="xa-label">Bilder offline</div>
          <div className="xa-mono text-[10.5px] text-fit-dim mt-0.5">
            {running
              ? `${progress.done} / ${progress.total} · ${pct} %${progress.failed ? ` · ${progress.failed} fehlgeschlagen` : ''}`
              : complete
                ? `alle ${status.total} Bilder auf diesem Gerät${status.bytes ? ` · ≈ ${(status.bytes / 1024 / 1024).toFixed(0)} MB` : ''}`
                : `${status.cached} / ${status.total} auf diesem Gerät${status.bytes ? ` · ≈ ${(status.bytes / 1024 / 1024).toFixed(0)} MB` : ''}`}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {running && (
            <button type="button" onClick={mirror.stop} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border border-fit-line text-fit-muted text-[11px] font-black uppercase tracking-widest">
              <Square size={12} /> Stopp
            </button>
          )}
          {!running && !complete && !confirming && (
            <button type="button" onClick={() => setConfirming(true)} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-fit-accent text-fit-bg text-[11px] font-black uppercase tracking-widest">
              <Images size={13} /> {status.cached ? 'Fortsetzen' : 'Bilder laden'}
            </button>
          )}
          {!running && !complete && confirming && (
            <>
              <span className="xa-mono text-[10.5px] text-fit-muted">{source.imageHint} laden?</span>
              <button type="button" onClick={() => { setConfirming(false); mirror.start() }} className="px-3 py-1.5 rounded-xl bg-fit-accent text-fit-bg text-[11px] font-black uppercase tracking-widest">Ja, laden</button>
              <button type="button" onClick={() => setConfirming(false)} className="px-3 py-1.5 rounded-xl border border-fit-line text-fit-muted text-[11px] font-black uppercase tracking-widest">Abbrechen</button>
            </>
          )}
          {!running && status.cached > 0 && (
            <button type="button" onClick={mirror.clear} aria-label="Offline-Bilder entfernen" className="p-2 rounded-xl border border-fit-line text-fit-dim hover:text-fit-red">
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>
      {running && (
        <div className="h-1 rounded-full bg-fit-line overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full bg-fit-accent transition-[width] duration-200" style={{ width: `${pct}%` }} />
        </div>
      )}
      {!running && result?.error && <div className="xa-mono text-[10.5px] text-fit-red">{result.error}</div>}
      {!running && result && !result.error && result.failed > 0 && (
        <div className="xa-mono text-[10.5px] text-fit-orange">{result.failed} Bilder nicht erreichbar — „Fortsetzen“ versucht sie erneut.</div>
      )}
    </div>
  )
}

function SourceRow({ source, status, items, busy, error, update, onDownload, onRemove }) {
  const updateAvailable = update?.available === true
  return (
    <div className="grid gap-3 sm:grid-cols-[1fr_auto] items-center py-4 border-t border-fit-line first:border-t-0">
      <div className="min-w-0 space-y-1">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="xa-serif text-xl text-fit-ink">{source.label}</span>
          <span className="xa-label">{source.author}</span>
          <a href={source.repoUrl} target="_blank" rel="noopener noreferrer" className="xa-label inline-flex items-center gap-1 hover:text-fit-accent">
            git <ExternalLink size={10} />
          </a>
        </div>
        <p className="text-[12.5px] text-fit-muted m-0">{source.description}</p>
        <div className="xa-mono text-[10.5px] text-fit-dim">
          {status
            ? <>auf diesem Gerät · {status.count} Übungen · {fmtBytes(status.bytes)} · geladen {fmtDate(status.fetchedAt)}{status.version ? ` · ${status.version.slice(0, 7)}` : ''} · {source.license}</>
            : <>nicht geladen · {source.license}</>}
        </div>
        {updateAvailable && (
          <div className="xa-mono text-[10.5px] text-fit-accent">neuer Stand upstream{update?.latest?.versionDate ? ` (${fmtDate(update.latest.versionDate)})` : ''}</div>
        )}
        {error && <div className="xa-mono text-[10.5px] text-fit-red">{error}</div>}
        {status && items?.length > 0 && <ImageSection source={source} items={items} />}
      </div>
      <div className="flex gap-2">
        <button
          type="button" disabled={busy} onClick={() => onDownload(source.id)}
          className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all disabled:opacity-60 ${status && !updateAvailable ? 'border border-fit-line text-fit-muted hover:text-fit-ink' : 'bg-fit-accent text-fit-bg'}`}
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : status ? <RefreshCw size={14} /> : <HardDriveDownload size={14} />}
          {status ? (updateAvailable ? 'Aktualisieren' : 'Neu laden') : 'Auf Gerät laden'}
        </button>
        {status && (
          <button
            type="button" disabled={busy} onClick={() => onRemove(source.id)}
            aria-label={`${source.label} vom Gerät entfernen`}
            className="p-2 rounded-xl border border-fit-line text-fit-dim hover:text-fit-red disabled:opacity-60"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
    </div>
  )
}

export default function SourcePanel({ mirrors }) {
  return (
    <section className="rounded-3xl border border-fit-line bg-fit-card px-5">
      {EXERCISE_DB_SOURCES.map((source) => (
        <SourceRow
          key={source.id}
          source={source}
          status={mirrors.statuses[source.id]}
          items={mirrors.items[source.id]}
          busy={!!mirrors.busy[source.id]}
          error={mirrors.errors[source.id]}
          update={mirrors.updates[source.id]}
          onDownload={mirrors.download}
          onRemove={mirrors.remove}
        />
      ))}
    </section>
  )
}
