/**
 * useGateElapsed — gemeinsame, sekündlich tickende Laufzeit des Session-Gates.
 * Bar (Header) und Card (Sheet) hatten je ihren eigenen setInterval-Block;
 * beide lesen jetzt dieselbe Quelle, damit sie nie auseinanderlaufen.
 */

import { useEffect, useState } from 'react';
import {
  normalizeSessionGate,
  getSessionGateElapsedMs,
  formatSessionGateElapsed,
} from '../../lib/sessionGate.js';

export function useGateElapsed(sessionGate) {
  const gate = normalizeSessionGate(sessionGate);
  const active = gate.status === 'active';
  const [nowMs, setNowMs] = useState(Date.now());

  useEffect(() => {
    setNowMs(Date.now());
    if (!active) return undefined;
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active, gate.startedAt, gate.endedAt, gate.status]);

  const elapsedMs = getSessionGateElapsedMs(gate, nowMs);
  return { nowMs, elapsedMs, elapsedLabel: formatSessionGateElapsed(elapsedMs) };
}
