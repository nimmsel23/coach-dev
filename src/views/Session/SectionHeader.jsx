export default function SectionHeader({ children }) {
  return (
    <div className="flex items-center gap-2.5 my-5 text-[10px] font-bold uppercase tracking-[0.15em] text-fit-dim">
      {children}
      <div className="flex-1 h-px bg-fit-line" />
    </div>
  );
}
