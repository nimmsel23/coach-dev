/**
 * PeakProfile — das "Gipfel-Profil" einer Übung: Verlauf des Scores als
 * Bergsilhouette auf einer gemeinsamen Zeitachse (alle Zeilen des Kodex
 * teilen sich dieselbe x-Achse, dadurch sieht man auf einen Blick, welche
 * Übungen lange nicht dran waren). Gestrichelt = Höhe des Gipfels,
 * Dreieck = Gipfel, ausgefüllter Punkt = zuletzt.
 */

import { parseDay } from './logbookStats.js';

export const STATUS_COLOR = {
  gipfel: 'var(--accent)',
  nah: 'var(--green, #34d399)',
  tal: 'var(--orange, #fb923c)',
  neu: 'var(--dim)',
};

export default function PeakProfile({
  scored, peak, last, domain, status = 'neu', dormant = false,
  width = 132, height = 40, showFloor = false,
}) {
  if (!scored?.length || !peak) return <div style={{ width, height }} aria-hidden />;
  const color = STATUS_COLOR[status] || 'var(--dim)';
  const padX = 5;
  const padTop = 7;
  const padBottom = 5;
  const t0 = parseDay(domain[0]).getTime();
  const t1 = parseDay(domain[1]).getTime();
  const span = Math.max(1, t1 - t0);
  const x = (iso) => padX + ((parseDay(iso).getTime() - t0) / span) * (width - padX * 2);

  const inRange = scored.filter((e) => e.date >= domain[0] && e.date <= domain[1]);
  const scores = scored.map((e) => e.score);
  const hi = peak.score;
  const lowest = Math.min(...scores);
  const lo = hi - lowest < hi * 0.02 ? hi * 0.8 : lowest - (hi - lowest) * 0.2;
  const y = (s) => padTop + (1 - (s - lo) / (hi - lo)) * (height - padTop - padBottom);

  const pts = inRange.map((e) => [x(e.date), y(e.score)]);
  const baseY = height - padBottom;
  const line = pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)} ${py.toFixed(1)}`).join(' ');
  const area = pts.length > 1
    ? `${line} L${pts[pts.length - 1][0].toFixed(1)} ${baseY} L${pts[0][0].toFixed(1)} ${baseY} Z`
    : '';
  const peakVisible = peak.date >= domain[0] && peak.date <= domain[1];
  const px = peakVisible ? x(peak.date) : null;
  const py = y(peak.score);
  const lastVisible = last && last.date >= domain[0] && last.date <= domain[1];

  return (
    <svg
      width={width} height={height} viewBox={`0 0 ${width} ${height}`}
      style={{ opacity: dormant ? 0.45 : 1, flexShrink: 0, overflow: 'visible' }}
      role="img" aria-label="Verlauf der Leistung mit Gipfel"
    >
      {showFloor && <line x1={padX} x2={width - padX} y1={baseY} y2={baseY} stroke="var(--line)" strokeWidth="1" />}
      <line x1={padX} x2={width - padX} y1={py} y2={py} stroke={color} strokeWidth="1" strokeDasharray="2 3" opacity="0.45" />
      {area && <path d={area} fill={color} opacity="0.14" />}
      {pts.length > 1 && <path d={line} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />}
      {pts.map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r={pts.length > 40 ? 1 : 1.8} fill="var(--card)" stroke={color} strokeWidth="1.2" />
      ))}
      {peakVisible && (
        <path d={`M${px - 4.2} ${py - 3} L${px + 4.2} ${py - 3} L${px} ${py - 9.5} Z`} fill={color} />
      )}
      {lastVisible && (() => {
        const lx = x(last.date);
        const ly = y(last.score);
        return <circle cx={lx} cy={ly} r="3.4" fill={color} stroke="var(--card)" strokeWidth="1.5" />;
      })()}
    </svg>
  );
}
