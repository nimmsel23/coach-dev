import { useEffect, useRef } from 'react'
import {
  Archive,
  ExternalLink,
  GitMerge,
  Inbox,
  Pencil,
  RefreshCw,
  RotateCcw,
  Trash2,
} from 'lucide-react'
import { isArchivedExercise } from '../../lib/catalogExerciseActions.js'

export default function ExerciseContextMenu({
  menu,
  onClose,
  onRename,
  onArchive,
  onUnarchive,
  onDelete,
  onMerge,
  onInbox,
  onRequeue,
  onInspect,
}) {
  const menuRef = useRef(null)
  const exercise = menu?.exercise

  useEffect(() => {
    if (!menu) return undefined
    const close = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) onClose?.()
    }
    const onKey = (event) => {
      if (event.key === 'Escape') onClose?.()
    }
    const onScroll = () => onClose?.()
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [menu, onClose])

  if (!menu || !exercise) return null

  const archived = isArchivedExercise(exercise)
  const item = 'flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-fit-ink hover:bg-fit-bg2 disabled:opacity-40'

  return (
    <div
      ref={menuRef}
      className="fixed z-[80] min-w-[240px] overflow-hidden rounded-2xl border border-fit-line bg-fit-card py-1 shadow-2xl"
      style={{ left: menu.x, top: menu.y }}
      role="menu"
    >
      <button type="button" role="menuitem" className={item} onClick={() => onRename?.(exercise)}>
        <Pencil size={14} className="text-fit-accent" /> Umbenennen…
      </button>
      <button type="button" role="menuitem" className={item} onClick={() => onMerge?.(exercise)}>
        <GitMerge size={14} className="text-fit-accent" /> Mergen mit Doppelung…
      </button>
      <button type="button" role="menuitem" className={item} onClick={() => onInbox?.(exercise)}>
        <Inbox size={14} className="text-fit-accent" /> In Inbox legen
      </button>
      <button type="button" role="menuitem" className={item} onClick={() => onRequeue?.(exercise)}>
        <RefreshCw size={14} className="text-fit-accent" /> Erneut durch Pipeline
      </button>
      {onInspect && (
        <button type="button" role="menuitem" className={item} onClick={() => onInspect?.(exercise)}>
          <ExternalLink size={14} className="text-fit-accent" /> Coach Sheet
        </button>
      )}
      <div className="my-1 border-t border-fit-line/40" />
      {archived ? (
        <button type="button" role="menuitem" className={item} onClick={() => onUnarchive?.(exercise)}>
          <RotateCcw size={14} className="text-fit-accent" /> Aus Archiv holen
        </button>
      ) : (
        <button type="button" role="menuitem" className={item} onClick={() => onArchive?.(exercise)}>
          <Archive size={14} className="text-fit-accent" /> Archivieren
        </button>
      )}
      <button
        type="button"
        role="menuitem"
        className={`${item} text-fit-red`}
        onClick={() => onDelete?.(exercise)}
      >
        <Trash2 size={14} /> Löschen…
      </button>
    </div>
  )
}
