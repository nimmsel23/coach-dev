// Muscle ID → visualization slug (react-body-highlighter)
const RBH_SLUGS = {
  // chest
  'chest': 'chest', 'pecs': 'chest', 'pectoralis': 'chest', 'pectoralis major': 'chest', 'pectoralis_major': 'chest', 'pectoralis minor': 'chest', 'pectoralis_minor': 'chest', 'serratus': 'serratus-anterior', 'serratus_anterior': 'serratus-anterior',
  // back
  'back': 'upper-back', 'lats': 'latissimus', 'latissimus': 'latissimus', 'latissimus dorsi': 'latissimus', 'latissimus_dorsi': 'latissimus',
  'traps': 'traps', 'trapezius': 'traps', 'rhomboids': 'rhomboids',
  'lower-back': 'lower-back', 'erector spinae': 'lower-back', 'erector_spinae': 'lower-back',
  // shoulders
  'shoulders': 'front-deltoids', 'delts': 'front-deltoids', 'deltoid': 'front-deltoids', 'front-deltoids': 'front-deltoids', 'anterior_deltoid': 'front-deltoids', 'lateral_deltoid': 'front-deltoids',
  'rear-deltoids': 'back-deltoids', 'posterior_deltoid': 'back-deltoids', 'back-deltoids': 'back-deltoids',
  // arms
  'biceps': 'biceps', 'biceps brachii': 'biceps', 'biceps_brachii': 'biceps', 'brachialis': 'biceps',
  'triceps': 'triceps', 'triceps brachii': 'triceps', 'triceps_brachii': 'triceps',
  'forearm': 'forearm', 'forearms': 'forearm', 'brachioradialis': 'forearm',
  // core
  'abs': 'abs', 'core': 'abs', 'rectus abdominis': 'abs', 'rectus_abdominis': 'abs',
  'obliques': 'obliques', 'obliquus': 'obliques', 'obliquus_externus': 'obliques',
  // legs
  'glutes': 'gluteal', 'gluteus': 'gluteal', 'gluteus maximus': 'gluteal', 'gluteus_maximus': 'gluteal', 'gluteus_medius': 'gluteal',
  'quads': 'quadriceps', 'quadriceps': 'quadriceps', 'rectus femoris': 'quadriceps', 'rectus_femoris': 'quadriceps', 'vastus_lateralis': 'quadriceps', 'vastus_medialis': 'quadriceps',
  'hamstrings': 'hamstring', 'hamstring': 'hamstring', 'biceps femoris': 'hamstring', 'biceps_femoris': 'hamstring', 'semitendinosus': 'hamstring',
  'calves': 'calves', 'gastrocnemius': 'calves', 'soleus': 'calves',
};

export function getRbhSlug(muscleName) {
  if (!muscleName) return null;
  const clean = muscleName.toLowerCase().replace(/[\s_-]+/g, ' ').trim();

  if (RBH_SLUGS[clean]) return RBH_SLUGS[clean];

  const standardSlugs = ['chest', 'upper-back', 'lower-back', 'biceps', 'triceps', 'forearm', 'abs', 'obliques', 'gluteal', 'hamstring', 'quadriceps', 'calves', 'front-deltoids', 'back-deltoids', 'traps', 'rhomboids', 'adductors', 'latissimus'];
  for (const s of standardSlugs) {
    if (clean.includes(s)) return s;
  }

  if (clean.includes('pectoralis') || clean.includes('brust')) return 'chest';
  if (clean.includes('deltoid') || clean.includes('shoulder') || clean.includes('schulter')) {
    if (clean.includes('post') || clean.includes('rear') || clean.includes('hinter')) return 'back-deltoids';
    return 'front-deltoids';
  }
  if (clean.includes('lat') || clean.includes('rücken') || clean.includes('back')) return 'upper-back';
  if (clean.includes('glute')) return 'gluteal';
  if (clean.includes('quad') || clean.includes('oberschenkel')) return 'quadriceps';
  if (clean.includes('hamstring') || clean.includes('beinbeuger')) return 'hamstring';
  if (clean.includes('calf') || clean.includes('calves') || clean.includes('wade')) return 'calves';
  if (clean.includes('bicep')) return 'biceps';
  if (clean.includes('tricep')) return 'triceps';
  if (clean.includes('core') || clean.includes('abdominis')) return 'abs';

  return null;
}
