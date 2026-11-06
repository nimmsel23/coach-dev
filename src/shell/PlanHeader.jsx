// Sticky Kopfleiste — Fork von CompactHeader aus ~/vitalos/src/shell/ShellHeader.jsx
// (vos-bar, Hairline, Safe-Area-Inset). Auf Desktop sitzt sie neben der Sidebar.
export default function PlanHeader({ title, subtitle, actions = null }) {
  return (
    <header className="vos-bar vos-hairline-b sticky top-0 z-40" style={{ paddingTop: 'var(--safe-top)' }}>
      <div className="mx-auto flex h-[52px] max-w-[1600px] items-center gap-3 px-4 md:px-6">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[20px] font-semibold leading-tight tracking-tight text-fit-ink">{title}</div>
          {subtitle ? <div className="truncate text-[12px] leading-tight text-fit-dim">{subtitle}</div> : null}
        </div>
        {actions}
      </div>
    </header>
  )
}
