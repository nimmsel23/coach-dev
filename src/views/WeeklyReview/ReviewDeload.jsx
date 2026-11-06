import { BatteryLow } from 'lucide-react';
import { DELOAD_AFTER_WEEKS, DELOAD_RPE, evaluateDeload } from '../../lib/deload';

// Zeigt, ob nach mehreren Vollgas-Wochen (Ø-RPE >= 9) ein Deload ansteht.
// Erst ab der zweiten Vollgas-Woche sichtbar, damit der Hinweis nicht dauernd stört.
export default function ReviewDeload({ weeks }) {
  const { streak, due, weeksLeft } = evaluateDeload(weeks);
  if (streak < 2) return null;
  return (
    <section className={`p-4 rounded-2xl border ${due ? 'bg-fit-accent/10 border-fit-accent/40' : 'bg-fit-card border-fit-line'}`}>
      <div className="flex items-center gap-2 mb-1.5 text-[11px] font-semibold" style={{ color: 'var(--dim)' }}>
        <BatteryLow size={14} className="text-fit-accent" />
        Deload
      </div>
      <p className="text-sm font-semibold text-fit-ink">
        {due
          ? `Deload fällig: ${streak} Wochen Vollgas in Folge (Ø RPE ab ${DELOAD_RPE}).`
          : `${streak} Wochen Vollgas — noch ${weeksLeft} Woche${weeksLeft > 1 ? 'n' : ''} bis zum Deload (nach ${DELOAD_AFTER_WEEKS}).`}
      </p>
    </section>
  );
}
