import { Bike, Mountain, Gauge, Route } from 'lucide-react';

function Stat({ label, value, unit, Icon }) {
  return (
    <div className="p-3 sm:p-6 rounded-2xl border bg-fit-card border-fit-line flex flex-col justify-center min-w-0">
      <div className="flex items-center gap-1.5 text-[10px] sm:text-xs font-medium mb-1 sm:mb-1.5" style={{ color: 'var(--dim)', opacity: 0.6 }}>
        <Icon size={12} className="text-fit-accent" />
        {label}
      </div>
      <div className="text-xl sm:text-4xl font-bold text-fit-ink truncate">
        {value}
        {unit && <span className="text-xs sm:text-lg font-medium opacity-50 ml-1">{unit}</span>}
      </div>
    </div>
  );
}

export default function TourStats({ stats }) {
  const s = stats || {};
  return (
    <section>
      <div className="flex items-center gap-2 mb-3 text-[11px] font-semibold" style={{ color: 'var(--dim)', opacity: 0.7 }}>
        <Bike size={14} className="text-fit-accent" />
        Radtouren — Gesamtbilanz
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-4">
        <Stat label="Touren" value={s.count || 0} Icon={Bike} />
        <Stat label="Gesamt-km" value={s.totalKm != null ? s.totalKm.toFixed(1) : '–'} unit="km" Icon={Route} />
        <Stat label="Ø Speed" value={s.avgSpeedKmh != null ? s.avgSpeedKmh.toFixed(1) : '–'} unit="km/h" Icon={Gauge} />
        <Stat label="Höhenmeter" value={s.totalElevationM != null ? Math.round(s.totalElevationM) : '–'} unit="hm" Icon={Mountain} />
      </div>
    </section>
  );
}
