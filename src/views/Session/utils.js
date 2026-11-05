export const BLOCK_COLORS = {
  push: "#f472b6", pull: "#34d399", legs: "#fb923c",
  upper: "#38bdf8", lower: "#a78bfa", full: "#fbbf24",
  shoulders: "#2dd4bf", arms: "#e879f9",
  hiking: "#48c87a", running: "#e05060", cycling: "#38bdf8", swimming: "#5294e2"
};

// Kanonische Form eines Split-Tags für Vergleiche (Coach-Habit-Tracking,
// SplitPicker-Werte) — Kleinschreibung + Trim, "full body" -> "full", damit
// die zwei im Code parallel existierenden Vokabulare (SplitPicker: "Full",
// Wochenplan-Defaults: "Full Body") zusammenfallen.
export function normalizeBlock(block) {
  const b = String(block || "").trim().toLowerCase();
  if (!b) return "";
  if (b === "full body") return "full";
  return b;
}

export function blockColor(block, activity) {
  if (activity?.type && BLOCK_COLORS[activity.type]) return BLOCK_COLORS[activity.type];
  if (!block) return "var(--accent)";
  for (const [key, color] of Object.entries(BLOCK_COLORS)) {
    if (block.toLowerCase().includes(key)) return color;
  }
  return "var(--accent)";
}

// Grobe Klassifikation für die Split-Autoerkennung — bewusst simple
// Keyword-Zuordnung statt KB-Region-Lookup (der lädt async und ist für eine
// reine UX-Vorschlagsfunktion überdimensioniert).
const PUSH_MUSCLES = ['chest', 'pec', 'shoulder', 'delt', 'tricep'];
const PULL_MUSCLES = ['back', 'lat', 'trap', 'rhomboid', 'bicep'];
const LEG_MUSCLES = ['leg', 'quad', 'hamstring', 'glute', 'calv'];

function classifyMuscle(name) {
  const n = String(name || '').toLowerCase();
  if (PUSH_MUSCLES.some(k => n.includes(k))) return 'push';
  if (PULL_MUSCLES.some(k => n.includes(k))) return 'pull';
  if (LEG_MUSCLES.some(k => n.includes(k))) return 'legs';
  return null;
}

/**
 * Leitet einen Split-Vorschlag (Push/Pull/Legs/Upper/Full) aus den bereits
 * eingetragenen Übungen einer Session ab — greift nur, solange der User
 * selbst noch keinen Split gewählt hat (block === '').
 */
// Reine Schulter- bzw. Arm-Tage (Bi/Tri) erkennt die Autoerkennung nur über die
// PRIMÄR-Muskeln — als Sekundärmuskeln tauchen Schulter/Trizeps in fast jeder
// Druckübung auf und würden sonst jeden Push-Tag zu "Shoulders"/"Arms" machen.
const SHOULDER_MUSCLES = ['shoulder', 'delt'];
const ARM_MUSCLES = ['bicep', 'tricep', 'forearm'];

function inferIsolationBlock(list) {
  const primaries = list.flatMap((ex) => ex.primaryMuscles || []).map((m) => String(m || '').toLowerCase());
  if (!primaries.length) return null;
  if (primaries.every((m) => SHOULDER_MUSCLES.some((k) => m.includes(k)))) return 'Shoulders';
  if (primaries.every((m) => ARM_MUSCLES.some((k) => m.includes(k)))) return 'Arms';
  return null;
}

export function inferBlockFromExercises(exercises) {
  const list = Array.isArray(exercises) ? exercises : [];
  const isolation = inferIsolationBlock(list);
  if (isolation) return isolation;
  let hasPush = false, hasPull = false, hasLegs = false;
  for (const ex of list) {
    const muscles = [...(ex.primaryMuscles || []), ...(ex.secondaryMuscles || [])];
    for (const m of muscles) {
      const c = classifyMuscle(m);
      if (c === 'push') hasPush = true;
      else if (c === 'pull') hasPull = true;
      else if (c === 'legs') hasLegs = true;
    }
  }
  if (!hasPush && !hasPull && !hasLegs) return null;
  if (hasLegs && (hasPush || hasPull)) return 'Full';
  if (hasLegs) return 'Legs';
  if (hasPush && hasPull) return 'Upper';
  if (hasPush) return 'Push';
  if (hasPull) return 'Pull';
  return null;
}

/**
 * Welche Split-Tags eine Session für den Zyklus-Zähler abdeckt. Der gewählte
 * Block zählt immer; eine Full-Body-Session zählt zusätzlich für jeden Tag,
 * dessen Muskeln die Übungen tatsächlich beansprucht haben (Push, Pull, Legs,
 * Upper = Push+Pull, Lower = Legs). Cardio-Activities zählen bewusst nicht:
 * sie sind kein Kraft-Slot (höchstens Deload, siehe ACTIVITY-Regeln).
 */
export function coveredBlocks(session) {
  const tags = new Set();
  const own = normalizeBlock(session?.block);
  if (own) tags.add(own);
  if (own !== 'full') return tags;
  let hasPush = false, hasPull = false, hasLegs = false;
  for (const ex of (Array.isArray(session?.exercises) ? session.exercises : [])) {
    for (const m of [...(ex.primaryMuscles || []), ...(ex.secondaryMuscles || [])]) {
      const c = classifyMuscle(m);
      if (c === 'push') hasPush = true;
      else if (c === 'pull') hasPull = true;
      else if (c === 'legs') hasLegs = true;
    }
  }
  if (hasPush) tags.add('push');
  if (hasPull) tags.add('pull');
  if (hasLegs) { tags.add('legs'); tags.add('lower'); }
  if (hasPush && hasPull) tags.add('upper');
  return tags;
}

export function getRollingDays(count) {
  const dates = [];
  const today = new Date();
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

export const DAY_LABELS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

// Zentrale Stelle für "YYYY-MM-DD" -> lokales Date-Objekt (Mittag statt
// Mitternacht, damit Zeitzonen-Rundung nie auf den Vor-/Folgetag kippt).
// Vorher parsten SessionHeader.jsx und useDayStrip.js dasselbe Pattern
// (`new Date(d + 'T12:00:00')`) jeweils unabhängig.
export function parseLocalDate(dateStr) {
  return new Date(`${dateStr}T12:00:00`);
}

// Übungsname -> URL-/ID-sicherer Slug, für Inbox-IDs manuell/quick
// hinzugefügter Übungen ohne Katalog-Eintrag (siehe useExerciseList.js).
export function slugify(name) {
  return String(name || 'exercise')
    .toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '') // Umlaute/Akzente entfernen
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'exercise';
}

export const num = (v) => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim().replace(',', '.');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

// Satzliste der letzten Session einer Übung (prevMap-Eintrag aus
// useSessionHistory) als `[{ reps, weight }]` — neues `setsArray`-Format
// direkt, Alt-Format (`sets`/`reps`/`weight` als Einzel-Strings) wird auf
// N gleiche Sätze aufgefächert. `null`, wenn dort nichts Verwertbares
// eingetragen war (z.B. Übung nur geplant, Reps leer).
export function prevSetsFromHistory(prev) {
  if (!prev) return null;
  let sets;
  if (Array.isArray(prev.setsArray) && prev.setsArray.length) {
    sets = prev.setsArray.map(s => ({ reps: String(s?.reps ?? ''), weight: String(s?.weight ?? '') }));
  } else {
    const n = Math.min(parseInt(prev.sets, 10) || 0, 20);
    if (!n || !prev.reps) return null;
    sets = Array.from({ length: n }, () => ({ reps: String(prev.reps), weight: String(prev.weight ?? '') }));
  }
  sets = sets.filter(s => s.reps.trim() || s.weight.trim());
  return sets.length ? sets : null;
}

// Progressionsvorschlag (progressive Überlastung) auf Basis der letzten
// Werte: mit Zusatzlast +2,5 kg pro Satz bei gleichen Wiederholungen, ohne
// Last (Körpergewicht) +1 Wiederholung. Bewusst simpel — nur ein
// Startwert, die Stepper im Satz-Raster korrigieren nach Tagesform.
export const PROGRESSION_KG = 2.5;
export function progressSets(sets) {
  return sets.map(s => {
    const w = parseFloat(String(s.weight || '').replace(',', '.'));
    if (w > 0) {
      return { ...s, weight: String(Math.round((w + PROGRESSION_KG) * 100) / 100) };
    }
    const r = parseInt(s.reps, 10);
    return Number.isFinite(r) ? { ...s, reps: String(r + 1) } : s;
  });
}
