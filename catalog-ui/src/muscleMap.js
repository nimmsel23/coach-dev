// Muscle ID → visualization slug (react-body-highlighter)
// Only return slugs that exist in the library's internal muscle map —
// unknown keys crash Model with "Cannot read properties of undefined (reading 'exercises')".
export const RBH_VALID = new Set([
  'trapezius', 'upper-back', 'lower-back', 'chest', 'biceps', 'triceps', 'forearm',
  'back-deltoids', 'front-deltoids', 'abs', 'obliques', 'adductor', 'abductors',
  'hamstring', 'quadriceps', 'calves', 'gluteal', 'head', 'neck', 'knees',
  'left-soleus', 'right-soleus',
]);

const RBH_SLUGS = {
  // chest
  chest: 'chest', pecs: 'chest', pectoralis: 'chest', 'pectoralis major': 'chest',
  pectoralis_major: 'chest', 'pectoralis minor': 'chest', pectoralis_minor: 'chest',
  serratus: 'chest', serratus_anterior: 'chest', 'serratus-anterior': 'chest',
  // back
  back: 'upper-back', lats: 'upper-back', latissimus: 'upper-back',
  'latissimus dorsi': 'upper-back', latissimus_dorsi: 'upper-back',
  'upper-back': 'upper-back',
  traps: 'trapezius', trapezius: 'trapezius',
  rhomboids: 'upper-back', teres: 'upper-back', teres_major: 'upper-back',
  'lower-back': 'lower-back', 'erector spinae': 'lower-back', erector_spinae: 'lower-back',
  // shoulders
  shoulders: 'front-deltoids', delts: 'front-deltoids', deltoid: 'front-deltoids',
  'front-deltoids': 'front-deltoids', anterior_deltoid: 'front-deltoids',
  lateral_deltoid: 'front-deltoids',
  'rear-deltoids': 'back-deltoids', posterior_deltoid: 'back-deltoids',
  'back-deltoids': 'back-deltoids',
  // arms
  biceps: 'biceps', 'biceps brachii': 'biceps', biceps_brachii: 'biceps', brachialis: 'biceps',
  triceps: 'triceps', 'triceps brachii': 'triceps', triceps_brachii: 'triceps',
  forearm: 'forearm', forearms: 'forearm', brachioradialis: 'forearm',
  // core
  abs: 'abs', core: 'abs', 'rectus abdominis': 'abs', rectus_abdominis: 'abs',
  obliques: 'obliques', obliquus: 'obliques', obliquus_externus: 'obliques',
  // legs
  glutes: 'gluteal', gluteus: 'gluteal', 'gluteus maximus': 'gluteal',
  gluteus_maximus: 'gluteal', gluteus_medius: 'gluteal',
  quads: 'quadriceps', quadriceps: 'quadriceps', 'rectus femoris': 'quadriceps',
  rectus_femoris: 'quadriceps', vastus_lateralis: 'quadriceps', vastus_medialis: 'quadriceps',
  hamstrings: 'hamstring', hamstring: 'hamstring', 'biceps femoris': 'hamstring',
  biceps_femoris: 'hamstring', semitendinosus: 'hamstring',
  calves: 'calves', gastrocnemius: 'calves', soleus: 'calves',
};

function stripCatalogPrefix(raw) {
  // "201_latissimus_dorsi" / "604a_biceps_femoris" → "latissimus_dorsi"
  return String(raw).replace(/^\d+[a-z]?_/i, '');
}

export function getRbhSlug(muscleName) {
  if (!muscleName) return null;
  const raw = String(muscleName);
  const stripped = stripCatalogPrefix(raw);
  const candidates = [
    raw.toLowerCase().replace(/[\s_-]+/g, ' ').trim(),
    stripped.toLowerCase().replace(/[\s_-]+/g, ' ').trim(),
    stripped.toLowerCase().replace(/[\s-]+/g, '_').trim(),
    stripped.toLowerCase(),
  ];

  for (const clean of candidates) {
    const mapped = RBH_SLUGS[clean];
    if (mapped && RBH_VALID.has(mapped)) return mapped;
    if (RBH_VALID.has(clean)) return clean;
  }

  const clean = candidates[0];
  if (clean.includes('pectoralis') || clean.includes('brust') || clean.includes('chest')) return 'chest';
  if (clean.includes('deltoid') || clean.includes('shoulder') || clean.includes('schulter')) {
    if (clean.includes('post') || clean.includes('rear') || clean.includes('hinter')) return 'back-deltoids';
    return 'front-deltoids';
  }
  if (clean.includes('latissimus') || clean.includes('lat ') || clean.startsWith('lat') || clean.includes('teres') || clean.includes('rhomboid')) {
    return 'upper-back';
  }
  if (clean.includes('trapezius') || clean.includes('trap')) return 'trapezius';
  if (clean.includes('erector') || clean.includes('lower-back') || clean.includes('lower back')) return 'lower-back';
  if (clean.includes('glute')) return 'gluteal';
  if (clean.includes('quad') || clean.includes('oberschenkel')) return 'quadriceps';
  if (clean.includes('hamstring') || clean.includes('beinbeuger') || clean.includes('semitendinosus') || clean.includes('semimembranosus')) {
    return 'hamstring';
  }
  if (clean.includes('calf') || clean.includes('calves') || clean.includes('wade') || clean.includes('gastroc') || clean.includes('soleus')) {
    return 'calves';
  }
  if (clean.includes('bicep')) return 'biceps';
  if (clean.includes('tricep')) return 'triceps';
  if (clean.includes('forearm') || clean.includes('brachioradialis')) return 'forearm';
  if (clean.includes('obliqu')) return 'obliques';
  if (clean.includes('core') || clean.includes('abdominis') || clean.includes('abs')) return 'abs';

  return null;
}
