export default function UnreadBadge({ value = { count: 0, error: false } }) {
  if (!value.count && !value.error) return null;
  return <span className="rounded-full bg-fit-accent px-1.5 text-[10px] font-bold text-fit-bg" aria-label={value.error ? 'Ungelesen-Status nicht verfügbar' : `${value.count >= 100 ? '99+' : value.count} ungelesene Nachrichten`}>{value.error ? '!' : value.count >= 100 ? '99+' : value.count}</span>;
}
