import Body from 'react-muscle-highlighter';
import { muscleToRmhSlug, canonicalMuscleId } from '../lib/kb/muscles.js';

// groupScores: { [muscleIdOrWord]: { score, color } } — mehrere Keys können
// auf denselben RMH-Slug rollen (z.B. einzelne Trapezius-Köpfe → "trapezius").
// Nach Ziel-Slug aggregieren, sonst überschreiben sich Duplikate zufällig
// statt sinnvoll.
//
// Bei Kollision gewinnt der HÖCHSTE Score (= am stärksten belastet), nicht
// der frischeste: MUSCLE_GROUPS ist feiner als das RMH-Slug-Vokabular (z.B.
// teilen sich "rhomboids"/"middle_back"/"serratus_anterior" einen Slug mit
// "upper_back"/"chest") — würde der frischeste gewinnen, verschwindet "in
// Erholung"/"stark belastet" einer Teilregion hinter einer frischen
// Nachbarregion, obwohl die Fokus-Analyse-Liste (superkompensation.js) das
// korrekt getrennt ausweist, weil sie nicht slug-aggregiert.
//
// "upper_back" ist laut KB-Architektur die bewusste Sammelregion für
// Trapezius (202-204) + Rhomboids + Rear Delt + Rotator Cuff (siehe
// MUSCLE_CATALOG_ARCHITECTURE.md) — RMH zeichnet "trapezius" aber als
// eigene SVG-Form getrennt von "upper-back". Ohne diesen zusätzlichen
// Eintrag bleibt die Trapezius-Form immer ungefärbt, egal wie frisch
// die Region trainiert wurde.
function groupScoresToData(groupScores) {
  const bySlug = {};
  const assign = (slug, gs) => {
    if (!slug) return;
    if (!bySlug[slug] || gs.score > bySlug[slug].score) bySlug[slug] = { score: gs.score, color: gs.color };
  };
  for (const [region, gs] of Object.entries(groupScores || {})) {
    if (!gs?.score) continue;
    assign(muscleToRmhSlug(region), gs);
    if (region === 'upper_back') assign('trapezius', gs);
  }
  return Object.entries(bySlug).map(([slug, { color }]) => ({ slug, color }));
}

const DONE_COLOR = '#22c55e';

// RMH-Slugs sind grobe Körperregionen (z.B. "chest" deckt 5 Pec-Portionen ab)
// — für den Klick-zu-Detail-Flow brauchen wir die konkreten kanonischen
// Muscle-IDs hinter dem Slug, sonst landet z.B. getMuscle("chest") im 404
// (KB kennt nur Einzelmuskel-IDs wie "101_pectoralis_major").
function exercisesToData(exercises) {
  const idsBySlug = new Map();
  for (const ex of Array.isArray(exercises) ? exercises : []) {
    const primary = ex?.primaryMuscles || ex?.primary_muscles || [];
    const secondary = ex?.secondaryMuscles || ex?.secondary_muscles || [];
    for (const m of [...primary, ...secondary]) {
      const slug = muscleToRmhSlug(m);
      if (!slug) continue;
      if (!idsBySlug.has(slug)) idsBySlug.set(slug, new Set());
      idsBySlug.get(slug).add(canonicalMuscleId(m));
    }
  }
  const data = [...idsBySlug.keys()].map(slug => ({ slug, color: DONE_COLOR }));
  return { data, idsBySlug };
}

export default function DetailedMuscleMap({ groupScores, exercises, style, gender, side, scale = 2, onGroupClick }) {
  const { data, idsBySlug } = exercises
    ? exercisesToData(exercises)
    : { data: groupScores ? groupScoresToData(groupScores) : [], idsBySlug: new Map() };

  return (
    <div style={{ ...style, display: 'flex', justifyContent: 'center' }}>
      <Body
        data={data}
        gender={gender || 'male'}
        side={side || 'front'}
        scale={scale}
        defaultFill="var(--line)"
        border="none"
        onBodyPartPress={part => {
          const ids = [...(idsBySlug.get(part.slug) || [])];
          onGroupClick?.(ids[0] || part.slug, { slug: part.slug, muscleIds: ids });
        }}
      />
    </div>
  );
}
