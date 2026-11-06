/**
 * gateTone — gemeinsame Farben des Session-Gates für Bar (Header) und Card
 * (Sheet). Beide pflegten dieselben Werte vorher getrennt; so sehen Streifen
 * und Sheet in jedem Zustand (idle/active/completed) gleich aus.
 */

export const GATE_STOP_STYLE = { background: '#fb923c', color: '#120c00' };

export function gateTone(gate) {
  if (gate.status === 'active') {
    return {
      color: 'var(--accent)',
      bg: 'rgba(200,255,0,0.06)',
      border: '1px solid rgba(200,255,0,0.3)',
    };
  }
  if (gate.status === 'completed') {
    return {
      color: '#34d399',
      bg: 'rgba(52,211,153,0.06)',
      border: '1px solid rgba(52,211,153,0.25)',
    };
  }
  return { color: 'var(--dim)', bg: 'var(--card)', border: '1px solid var(--line)' };
}
