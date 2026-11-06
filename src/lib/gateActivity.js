/**
 * gateActivity — wann zuletzt etwas in der laufenden Session eingegeben wurde.
 * Bewusst nur lokal (localStorage), NICHT im Session-JSON: damit schlägt das
 * Gate ein rückdatiertes Ende vor, ohne das Session-Format zu verändern.
 */

import { normalizeSessionGate } from './sessionGate.js';

const KEY = 'fitness-gate-last-activity';
export const GATE_IDLE_MS = 20 * 60 * 1000;

export function markGateActivity() {
  try { window.localStorage.setItem(KEY, String(Date.now())); } catch {}
}

// Letzte Eingabe seit Gate-Start; ohne (oder mit älterem) Eintrag zählt der Start.
export function getGateLastActivityMs(sessionGate) {
  const gate = normalizeSessionGate(sessionGate);
  const startMs = Date.parse(gate.startedAt);
  if (!Number.isFinite(startMs)) return null;
  let stored = NaN;
  try { stored = Number(window.localStorage.getItem(KEY)); } catch {}
  return Number.isFinite(stored) && stored >= startMs ? stored : startMs;
}
