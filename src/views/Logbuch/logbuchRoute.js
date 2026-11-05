/**
 * Deep-Links ins Logbuch: `#session/logbuch/<linse>` (+ optional `?ex=<Übungs-Key>` für den Kodex).
 * Die URL ist die einzige Quelle — App.jsx lässt Linse/Übung beim Neuschreiben des Hashes
 * stehen, das Logbuch schreibt sie bei jedem Wechsel zurück (replaceState, kein Verlaufseintrag).
 */

export const LOGBUCH_LENSES = ['kodex', 'rekorde', 'rhythmus', 'muskeln', 'chronik'];

/** Liest Linse und Übung aus einem Hash; null-Felder, wenn der Hash nicht aufs Logbuch zeigt. */
export function parseLogbuchHash(hash) {
  const raw = String(hash || '').replace(/^#\/?/, '');
  const [path = '', query = ''] = raw.split('?');
  const [tab, sub, third] = path.split('/').filter(Boolean);
  if (tab !== 'session' || sub !== 'logbuch') return { lens: null, ex: null };
  const lens = LOGBUCH_LENSES.includes(third) ? third : null;
  const ex = new URLSearchParams(query).get('ex') || null;
  return { lens, ex: lens === 'kodex' || (!lens && ex) ? ex : null };
}

/** Baut den Hash-Teil nach `#session/logbuch` (ohne führendes `/`, leer wenn keine Linse). */
export function logbuchHash(lens, ex) {
  if (!LOGBUCH_LENSES.includes(lens)) return '#session/logbuch';
  const q = lens === 'kodex' && ex ? `?ex=${encodeURIComponent(ex)}` : '';
  return `#session/logbuch/${lens}${q}`;
}
