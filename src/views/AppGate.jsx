import { localToday } from "@utils";

export default function AppGate({ navigate, navItems }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-gradient-to-br from-fit-bg to-fit-bg2 text-fit-ink">
      
      {/* Navigation Grid */}
      <nav className="grid grid-cols-2 md:grid-cols-3 gap-4 w-full max-w-2xl animate-in fade-in zoom-in-95 duration-700">
        {navItems.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => navigate(id)}
            className="relative group p-6 rounded-[32px] bg-fit-card border border-fit-line/50 active:scale-95 transition-all overflow-hidden flex flex-col items-center gap-4 shadow-xs hover:shadow-2xl hover:shadow-fit-accent/10 hover:border-fit-accent/40"
          >
            {/* Glow */}
            <div className="absolute inset-0 bg-gradient-to-br from-fit-accent/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            
            <div className="w-14 h-14 rounded-[20px] bg-fit-bg border border-fit-line flex items-center justify-center group-hover:bg-fit-accent group-hover:border-fit-accent transition-all duration-300 shadow-inner z-10">
              <Icon size={24} className="text-fit-dim group-hover:text-black transition-colors" />
            </div>
            
            <div className="flex flex-col items-center gap-1 z-10">
              <span className="text-[11px] font-black uppercase tracking-[0.2em] text-fit-muted group-hover:text-fit-ink transition-colors">
                {label}
              </span>
              <div className="h-0.5 w-0 group-hover:w-8 bg-fit-accent transition-all duration-500 rounded-full" />
            </div>
          </button>
        ))}
      </nav>

      {/* Date / Subtitle footer */}
      <div className="mt-16 text-[9px] font-black uppercase tracking-widest text-fit-dim opacity-50 animate-in fade-in duration-1000 delay-150">
        {new Date().toLocaleDateString('de-DE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
      </div>
    </div>
  );
}
