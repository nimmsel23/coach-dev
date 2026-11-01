/**
 * logbookStats — reine Aggregation für das Logbuch (Makro-Ebene).
 *
 * Eingabe: die Session-Docs aus getSessionHistory() (mehrere Docs pro Tag
 * möglich, Übungen mit `setsArray` oder Alt-Format `sets`/`reps`/`weight`).
 * Ausgabe: pro Übung ein Verlauf mit zuletzt / Gipfel / Rekorden, dazu
 * Tages-Zeilen und Kennzahlen. Keine React-/Alias-Imports, damit das Modul
 * direkt mit `node --test` prüfbar bleibt (logbookStats.test.mjs).
 *
 * Begriffe (bewusst eigene Sprache des Logbuchs):
 * - Score   = geschätztes 1RM (Epley) eines Satzes mit Gewicht; bei Übungen
 *             ohne Zusatzlast die höchste Wiederholungszahl eines Satzes.
 * - Gipfel  = Eintrag mit dem höchsten Score aller Zeiten.
 * - Abstand = wie weit der letzte Eintrag unter dem Gipfel liegt (0–1).
 */

import { num, normalizeBlock, slugify } from '../Session/utils.js';
import { sessionHasLoggedWorkout } from '../../lib/sessionGate.js';

export const DORMANT_DAYS = 42;      // so lange keine Einheit = "schläft"
export const NEAR_PEAK_GAP = 0.10;   // bis 10 % unter dem Gipfel = "nah"
const PEAK_EPS = 0.01;               // ≤ 1 % unter dem Gipfel gilt als am Gipfel
const RECORD_MIN_GAIN = 0.005;       // Rekord erst ab +0,5 % (sonst Rauschen)
const REP_CAP_FOR_E1RM = 20;         // Epley taugt nur für kleine Wdh.-Zahlen

// ── Datum ──────────────────────────────────────────────────────────────────
export function parseDay(iso) {
  return new Date(`${iso}T12:00:00`);
}
export function fmtIso(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export function addDays(iso, n) {
  const d = parseDay(iso);
  d.setDate(d.getDate() + n);
  return fmtIso(d);
}
export function daysBetween(fromIso, toIso) {
  return Math.round((parseDay(toIso) - parseDay(fromIso)) / 86400000);
}
/** Montag der Woche, in der `iso` liegt (ISO-Woche, Montag = Wochenanfang). */
export function mondayOf(iso) {
  const d = parseDay(iso);
  const dow = d.getDay();
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
  return fmtIso(d);
}
export function isoWeekNumber(mondayIso) {
  const d = parseDay(mondayIso);
  d.setDate(d.getDate() + 3); // Donnerstag der Woche bestimmt die ISO-Woche
  const jan4 = new Date(d.getFullYear(), 0, 4, 12);
  return 1 + Math.round(((d - jan4) / 86400000 - 3 + ((jan4.getDay() + 6) % 7)) / 7);
}

// ── Sätze ──────────────────────────────────────────────────────────────────
function rawSets(ex) {
  if (Array.isArray(ex?.setsArray) && ex.setsArray.length) {
    return ex.setsArray
      .filter((s) => s && s.setType !== 'warmup')
      .map((s) => ({ reps: num(s.reps), weight: num(s.weight) }));
  }
  const reps = num(ex?.reps);
  const weight = num(ex?.weight);
  if (reps == null && weight == null) return [];
  const n = Math.min(Math.max(parseInt(ex?.sets, 10) || 1, 1), 20);
  return Array.from({ length: n }, () => ({ reps, weight }));
}

export function setE1rm(s) {
  if (!(s.weight > 0)) return null;
  if (!(s.reps > 0)) return s.weight; // Wdh. unbekannt → nur das Gewicht zählt
  return s.weight * (1 + Math.min(s.reps, REP_CAP_FOR_E1RM) / 30);
}

const validSet = (s) => s.reps > 0 || s.weight > 0;

function exerciseKey(ex) {
  const id = ex?.exercise_id || ex?.id;
  if (id) return `id:${id}`;
  return `n:${slugify(ex?.name || ex?.displayName)}`;
}

// ── Aggregation ────────────────────────────────────────────────────────────
function mergeDocsByDate(sessions) {
  const byDate = new Map();
  for (const s of sessions || []) {
    if (!s?.date) continue;
    const day = byDate.get(s.date) || { date: s.date, docs: [], exercises: [], block: '', activity: null, sessionMode: null, location: null };
    day.docs.push(s);
    day.exercises.push(...(Array.isArray(s.exercises) ? s.exercises : []));
    if (!day.block && s.block) day.block = s.block;
    if (!day.activity && s.activity) day.activity = s.activity;
    if (!day.sessionMode && s.sessionMode) day.sessionMode = s.sessionMode;
    if (!day.location && s.location) day.location = s.location;
    byDate.set(s.date, day);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function makeEntry(date, block, sets) {
  const valid = sets.filter(validSet);
  if (!valid.length) return null;
  const weighted = valid.filter((s) => s.weight > 0);
  let top = null;
  for (const s of weighted) {
    const e = setE1rm(s);
    if (!top || e > top.e1rm + 1e-9 || (Math.abs(e - top.e1rm) < 1e-9 && s.weight > top.weight)) {
      top = { weight: s.weight, reps: s.reps > 0 ? s.reps : null, e1rm: e };
    }
  }
  const heaviest = weighted.reduce((m, s) => (s.weight > (m?.weight ?? -1) ? s : m), null);
  const maxReps = valid.reduce((m, s) => Math.max(m, s.reps > 0 ? s.reps : 0), 0);
  const volume = valid.reduce((a, s) => a + (s.weight > 0 && s.reps > 0 ? s.weight * s.reps : 0), 0);
  const totalReps = valid.reduce((a, s) => a + (s.reps > 0 ? s.reps : 0), 0);
  return {
    date, block, sets: valid, setCount: valid.length,
    top, // bester gewichteter Satz (null bei reinem Körpergewicht)
    heaviest: heaviest ? { weight: heaviest.weight, reps: heaviest.reps > 0 ? heaviest.reps : null } : null,
    maxReps, volume, totalReps,
    score: null, // erst nach Modus-Bestimmung gesetzt
  };
}

function finishExercise(acc, today) {
  const entries = acc.entries; // chronologisch
  const weightedShare = entries.filter((e) => e.top).length / entries.length;
  const mode = weightedShare >= 0.5 ? 'load' : 'reps';
  for (const e of entries) {
    e.score = mode === 'load' ? (e.top ? e.top.e1rm : null) : (e.maxReps > 0 ? e.maxReps : null);
  }
  const scored = entries.filter((e) => e.score != null);

  // Rekord-Chronik: erster Eintrag = Erstbesteigung, danach jeder Score
  // ≥ 0,5 % über dem bisherigen Gipfel.
  const records = [];
  let best = -Infinity;
  for (const e of scored) {
    if (best === -Infinity) {
      records.push({ date: e.date, score: e.score, prev: null, gain: null, kind: 'erst', entry: e });
      best = e.score;
    } else if (e.score >= best * (1 + RECORD_MIN_GAIN)) {
      records.push({ date: e.date, score: e.score, prev: best, gain: e.score / best - 1, kind: 'rekord', entry: e });
      best = e.score;
    } else if (e.score > best) {
      best = e.score; // Mini-Plus: Gipfel anheben, aber kein Rekord-Eintrag
    }
  }

  const last = entries[entries.length - 1];
  const lastScored = scored[scored.length - 1] || null;
  const peak = scored.reduce((m, e) => (!m || e.score > m.score + 1e-9 ? e : m), null);
  const heaviest = entries.reduce((m, e) => (e.heaviest && (!m || e.heaviest.weight > m.heaviest.weight) ? e : m), null);
  const gap = peak && lastScored ? Math.max(0, 1 - lastScored.score / peak.score) : null;
  const prevScored = scored.length > 1 ? scored[scored.length - 2] : null;
  const daysSince = daysBetween(last.date, today);

  let status = 'neu';
  if (scored.length > 1 && gap != null) {
    status = gap <= PEAK_EPS ? 'gipfel' : gap <= NEAR_PEAK_GAP ? 'nah' : 'tal';
  }

  const blockCount = {};
  for (const e of entries) {
    const b = normalizeBlock(e.block);
    if (b) blockCount[b] = (blockCount[b] || 0) + 1;
  }
  const mainBlock = Object.entries(blockCount).sort((a, b) => b[1] - a[1])[0]?.[0] || '';

  return {
    key: acc.key, id: acc.id, name: acc.name, muscles: acc.muscles,
    mode, entries, scored, records, mainBlock,
    count: entries.length,
    first: entries[0], last, lastScored, peak, heaviest, gap, status,
    dormant: daysSince >= DORMANT_DAYS, daysSince,
    trend: lastScored && prevScored ? lastScored.score / prevScored.score - 1 : null,
    totalVolume: entries.reduce((a, e) => a + e.volume, 0),
  };
}

/**
 * @param {Array} sessions getSessionHistory()-Ergebnis (beliebige Reihenfolge)
 * @param {string} today   "YYYY-MM-DD"
 */
export function buildLogbook(sessions, today) {
  const days = mergeDocsByDate(sessions);
  const acc = new Map();
  const dayRows = [];

  for (const day of days) {
    // Mehrfach vorkommende Übung am selben Tag → Sätze zusammenlegen.
    const perKey = new Map();
    for (const ex of day.exercises) {
      const name = String(ex?.name || ex?.displayName || '').trim();
      if (!name && !ex?.exercise_id && !ex?.id) continue;
      const key = exerciseKey(ex);
      const cur = perKey.get(key) || { ex, sets: [] };
      cur.sets.push(...rawSets(ex));
      perKey.set(key, cur);
    }
    const lifts = [];
    for (const [key, { ex, sets }] of perKey) {
      const entry = makeEntry(day.date, day.block, sets);
      if (!entry) continue;
      let a = acc.get(key);
      if (!a) {
        a = { key, id: ex.exercise_id || ex.id || null, name: '', muscles: [], entries: [] };
        acc.set(key, a);
      }
      a.name = String(ex.name || ex.displayName || a.name).trim(); // jüngster Name gewinnt
      if (Array.isArray(ex.primaryMuscles) && ex.primaryMuscles.length) a.muscles = ex.primaryMuscles;
      a.entries.push(entry);
      lifts.push({ key, name: a.name, entry });
    }
    dayRows.push({
      date: day.date, block: day.block, activity: day.activity, sessionMode: day.sessionMode,
      location: day.location, exercises: day.exercises,
      hasWorkout: sessionHasLoggedWorkout({
        exercises: day.exercises, block: day.block, activity: day.activity,
        sessionGate: day.docs.find((d) => d.sessionGate)?.sessionGate,
      }),
      exerciseCount: day.exercises.length, volume: 0, lifts, records: 0, topLifts: [],
    });
  }

  const exercises = [...acc.values()].map((a) => finishExercise(a, today));
  const byKey = new Map(exercises.map((e) => [e.key, e]));

  // Rekorde pro Tag + Volumen + Top-Lifts der Tageszeilen nachtragen.
  const recordsByDate = new Map();
  const records = [];
  for (const ex of exercises) {
    for (const r of ex.records) {
      records.push({ ...r, key: ex.key, name: ex.name, mode: ex.mode });
      if (r.kind === 'rekord') recordsByDate.set(r.date, (recordsByDate.get(r.date) || 0) + 1);
    }
  }
  records.sort((a, b) => b.date.localeCompare(a.date) || b.score - a.score);
  for (const row of dayRows) {
    row.volume = row.lifts.reduce((a, l) => a + l.entry.volume, 0);
    row.records = recordsByDate.get(row.date) || 0;
    row.topLifts = row.lifts
      .map((l) => ({ ...l, mode: byKey.get(l.key)?.mode, score: l.entry.score }))
      .filter((l) => l.score != null)
      .sort((a, b) => b.score / (byKey.get(b.key)?.peak?.score || 1) - a.score / (byKey.get(a.key)?.peak?.score || 1))
      .slice(0, 3);
  }

  const cutoff30 = addDays(today, -30);
  const trainingDays = dayRows.filter((d) => d.hasWorkout).length;
  return {
    exercises, byKey, records, dayRows: dayRows.sort((a, b) => b.date.localeCompare(a.date)),
    firstDate: days[0]?.date || null,
    kpis: {
      trainingDays,
      exerciseCount: exercises.length,
      totalVolume: exercises.reduce((a, e) => a + e.totalVolume, 0),
      records30: records.filter((r) => r.kind === 'rekord' && r.date >= cutoff30).length,
      recordsTotal: records.filter((r) => r.kind === 'rekord').length,
    },
  };
}

// ── Rhythmus-Raster ────────────────────────────────────────────────────────
/** Montage der letzten `count` Wochen, älteste zuerst (inkl. aktueller Woche). */
export function weekWindow(today, count) {
  const thisMonday = mondayOf(today);
  return Array.from({ length: count }, (_, i) => addDays(thisMonday, -7 * (count - 1 - i)));
}

/** Pro Woche der beste Score relativ zum Gipfel der Übung (0–1) oder null. */
export function weeklyIntensity(exercise, weeks) {
  const peak = exercise.peak?.score || 0;
  const byWeek = new Map();
  for (const e of exercise.scored) {
    const w = mondayOf(e.date);
    byWeek.set(w, Math.max(byWeek.get(w) || 0, e.score));
  }
  const peakWeek = exercise.peak ? mondayOf(exercise.peak.date) : null;
  return weeks.map((w) => {
    const v = byWeek.get(w);
    return { week: w, ratio: v && peak ? v / peak : null, isPeak: w === peakWeek };
  });
}

// ── Formatierung ───────────────────────────────────────────────────────────
export function fmtNum(v, digits = 1) {
  if (v == null || !Number.isFinite(v)) return '–';
  const r = Math.round(v * 10 ** digits) / 10 ** digits;
  return String(r).replace('.', ',');
}
export function fmtTop(entry, mode) {
  if (!entry) return '–';
  if (mode === 'reps') return `${entry.maxReps} Wdh.`;
  if (!entry.top) return '–';
  return entry.top.reps ? `${fmtNum(entry.top.weight)} kg × ${entry.top.reps}` : `${fmtNum(entry.top.weight)} kg`;
}
export function fmtScore(score, mode) {
  return mode === 'reps' ? `${fmtNum(score, 0)} Wdh.` : `${fmtNum(score)} kg`;
}
export function fmtAgo(days) {
  if (days <= 0) return 'heute';
  if (days === 1) return 'gestern';
  if (days < 14) return `vor ${days} T`;
  if (days < 70) return `vor ${Math.round(days / 7)} Wo.`;
  if (days < 540) return `vor ${Math.round(days / 30)} Mon.`;
  return `vor ${fmtNum(days / 365, 1)} J.`;
}
