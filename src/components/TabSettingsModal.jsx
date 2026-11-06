import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

export default function TabSettingsModal({ title, onClose, children }) {
  return createPortal(
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="absolute inset-0 bg-fit-scrim backdrop-blur-md" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-fit-card border border-fit-line rounded-[32px] shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-fit-line/50">
          <h3 className="text-[10px] font-black uppercase tracking-[0.25em] text-fit-accent">{title}</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-fit-bg2 flex items-center justify-center text-fit-dim hover:text-ink transition-colors"
          >
            <X size={16} />
          </button>
        </div>
        <div className="p-6">
          {children}
        </div>
      </div>
    </div>,
    document.body
  )
}
