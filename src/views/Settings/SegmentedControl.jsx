export default function SegmentedControl({ label, options, value, onChange }) {
  return (
    <div>
      {label && (
        <div className="text-xs font-medium mb-2.5 ml-1" style={{ color: 'var(--dim)', opacity: 0.7 }}>{label}</div>
      )}
      <div className="flex gap-1 p-1 bg-fit-bg2 rounded-xl border border-fit-line">
        {options.map(({ id, label }) => (
          <button
            key={String(id)}
            onClick={() => onChange(id)}
            className={`flex-1 py-2.5 text-xs font-semibold rounded-lg transition-all ${
              value === id ? 'bg-fit-card shadow-xs text-fit-accent' : 'text-fit-dim hover:text-fit-ink'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
