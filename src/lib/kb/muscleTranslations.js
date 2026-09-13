/**
 * Muscle translation + display helpers.
 * Logic moved under lib/kb/* so src/lib/kb/muscles.js can act as the
 * frontend SSOT barrel for all muscle-related helpers.
 */

const GROUP_TRANSLATIONS = {
  de: {
    chest: 'Brust',
    back: 'Rücken',
    shoulders: 'Schultern',
    arms: 'Arme',
    core: 'Bauch',
    glutes: 'Gesäß',
    quadriceps: 'Beinstrecker',
    hamstrings: 'Beinbeuger',
    calves: 'Waden',
    legs: 'Beine',
    adductors: 'Adduktoren',
    abductors: 'Abduktoren',
    trapezius: 'Nacken',
    upper_back: 'Oberer Rücken',
    middle_back: 'Mittlerer Rücken',
    lower_back: 'Unterer Rücken',
    rhomboids: 'Rautenmuskeln',
    serratus_anterior: 'Vorderer Sägemuskel',
    biceps: 'Bizeps',
    triceps: 'Trizeps',
    forearms: 'Unterarme',
    abs: 'Bauch',
  },
  en: {
    chest: 'Chest',
    back: 'Back',
    shoulders: 'Shoulders',
    arms: 'Arms',
    core: 'Core',
    glutes: 'Glutes',
    quadriceps: 'Quadriceps',
    hamstrings: 'Hamstrings',
    calves: 'Calves',
    legs: 'Legs',
    adductors: 'Adductors',
    abductors: 'Hip Abductors',
    trapezius: 'Traps',
    upper_back: 'Upper Back',
    middle_back: 'Middle Back',
    lower_back: 'Lower Back',
    rhomboids: 'Rhomboids',
    serratus_anterior: 'Serratus Anterior',
    biceps: 'Biceps',
    triceps: 'Triceps',
    forearms: 'Forearms',
    abs: 'Abs',
  },
  lat: {
    chest: 'Thorax',
    back: 'Dorsum',
    shoulders: 'Deltoideus',
    arms: 'Membrum sup.',
    core: 'Core',
    glutes: 'Gluteus',
    quadriceps: 'Quadriceps',
    hamstrings: 'Ischiocrurale',
    calves: 'Sura',
    legs: 'Membrum inf.',
    adductors: 'Mm. adductores',
    abductors: 'Mm. abductores',
    trapezius: 'Trapezius',
    upper_back: 'Cingulum membri sup.',
    middle_back: 'Regio infrascapularis',
    lower_back: 'Regio lumbalis',
    rhomboids: 'Mm. rhomboidei',
    serratus_anterior: 'M. serratus anterior',
    biceps: 'Regio brachii anterior',
    triceps: 'Regio brachii posterior',
    forearms: 'Antebrachium',
    abs: 'Abdomen',
  },
};

export function translateMuscleGroup(groupId, lang = 'de') {
  const resolvedLang = lang === 'lat' ? 'lat' : (lang === 'en' ? 'en' : 'de');
  return GROUP_TRANSLATIONS[resolvedLang]?.[groupId] || groupId;
}

function numericSlugToGroup(id) {
  const match = String(id).match(/^(\d+)/);
  if (!match) return null;
  const numeric = parseInt(match[1], 10);
  if (numeric >= 100 && numeric < 200) return 'chest';
  if (numeric >= 200 && numeric < 300) return 'back';
  if (numeric >= 300 && numeric < 400) return 'shoulders';
  if (numeric >= 400 && numeric < 500) return 'arms';
  if (numeric >= 500 && numeric < 600) return 'core';
  if (numeric >= 600 && numeric < 700) {
    if (numeric === 601) return 'quadriceps';
    if (numeric === 602) return 'adductors';
    if (numeric === 603 || numeric === 608 || numeric === 609) return 'glutes';
    if (numeric >= 604 && numeric <= 606) return 'hamstrings';
    return 'legs';
  }
  if (numeric >= 700 && numeric < 800) return 'calves';
  return null;
}

const STRING_ALIASES = {
  abdominals: 'abs',
  abductors: 'abductors',
  adductors: '602_adductors',
  biceps: '402_biceps_brachii',
  calves: 'calves',
  chest: 'chest',
  forearms: '405_forearm_flexors',
  glutes: 'glutes',
  hamstrings: 'hamstrings',
  lats: '201_latissimus_dorsi',
  'lower back': '206_erector_spinae',
  'middle back': 'middle_back',
  neck: '202a_trapezius_upper',
  quadriceps: '601_quadriceps_femoris',
  shoulders: 'shoulders',
  traps: '202_trapezius',
  triceps: '401_triceps_brachii',
  'biceps brachii': '402_biceps_brachii',
  'biceps femoris': '604a_biceps_femoris',
  brachialis: '403_brachialis',
  brachioradialis: '404_brachioradialis',
  'erector spinae': '206_erector_spinae',
  'forearm flexors': '405_forearm_flexors',
  gastrocnemius: '701_gastrocnemius',
  'gluteus maximus': '603_gluteus_maximus',
  'gluteus medius': '608_gluteus_medius',
  iliopsoas: '607_iliopsoas',
  'latissimus dorsi': '201_latissimus_dorsi',
  obliques: '502_obliquus_externus',
  'obliquus externus': '502_obliquus_externus',
  'pectoralis major': '101_pectoralis_major',
  'quadriceps femoris': '601_quadriceps_femoris',
  'quadratus lumborum': '208_quadratus_lumborum',
  'rectus abdominis': '501_rectus_abdominis',
  'rectus femoris': '601a_rectus_femoris',
  rhomboids: '205_rhomboids',
  'rotator cuff': '304_rotator_cuff',
  semitendinosus: '604b_semitendinosus',
  semimembranosus: '604c_semimembranosus',
  'serratus anterior': '105_serratus_anterior',
  soleus: '702_soleus',
  'teres major': '207_teres_major',
  'transverse abdominis': '504_transverse_abdominis',
  'triceps brachii': '401_triceps_brachii',
  'vastus lateralis': '601b_vastus_lateralis',
  'vastus medialis': '601c_vastus_medialis',
  'vastus intermedius': '601d_vastus_intermedius',
  'anterior deltoid': '301_anterior_deltoid',
  'lateral deltoid': '302_lateral_deltoid',
  'posterior deltoid': '303_posterior_deltoid',
  trapezius: '202_trapezius',
  'upper traps': '202a_trapezius_upper',
  deltoid: 'shoulders',
  deltoids: 'shoulders',
  pectoralis: '101_pectoralis_major',
  'pectoralis minor': '101_pectoralis_major',
  core: 'abs',
  abs: 'abs',
  shoulder: 'shoulders',
  forearm: '405_forearm_flexors',
  arms: 'arms',
  back: 'back',
  legs: 'legs',
  'trapezius upper': '202a_trapezius_upper',
  'trapezius middle': '202b_trapezius_middle',
  'trapezius lower': '202c_trapezius_lower',
};

const NAME_TO_GROUP = {
  chest: 'chest', pectoralis: 'chest', 'pectoralis major': 'chest', 'pectoralis minor': 'chest',
  'pectoralis major clavicular': 'chest', 'pectoralis major sternal': 'chest',
  'serratus anterior': 'chest',
  back: 'back', latissimus: 'back', 'latissimus dorsi': 'back', lats: 'back',
  rhomboids: 'back', rhomboideus: 'back', 'erector spinae': 'back', erectors: 'back',
  'lower back': 'back', 'middle back': 'back', 'upper back': 'back',
  'teres major': 'back', 'teres minor': 'back', 'quadratus lumborum': 'back',
  shoulders: 'shoulders', shoulder: 'shoulders', deltoid: 'shoulders', deltoids: 'shoulders',
  'anterior deltoid': 'shoulders', 'posterior deltoid': 'shoulders', 'lateral deltoid': 'shoulders',
  'anterior deltoids': 'shoulders', 'posterior deltoids': 'shoulders', 'lateral deltoids': 'shoulders',
  'rotator cuff': 'shoulders', supraspinatus: 'shoulders', infraspinatus: 'shoulders',
  trapezius: 'trapezius', traps: 'trapezius', 'upper traps': 'trapezius',
  'trapezius upper': 'trapezius', 'trapezius middle': 'trapezius', 'trapezius lower': 'trapezius',
  neck: 'trapezius', 'neck stabilizers': 'trapezius',
  arms: 'arms', biceps: 'arms', 'biceps brachii': 'arms',
  triceps: 'arms', 'triceps brachii': 'arms', brachialis: 'arms',
  forearms: 'arms', forearm: 'arms', brachioradialis: 'arms',
  'forearm flexors': 'arms', anconeus: 'arms',
  core: 'core', abs: 'core', abdominals: 'core', 'rectus abdominis': 'core',
  obliques: 'core', 'obliquus externus': 'core', 'obliquus internus': 'core',
  'transverse abdominis': 'core',
  glutes: 'glutes', 'gluteus maximus': 'glutes', 'gluteus medius': 'glutes', 'gluteus minimus': 'glutes',
  abductors: 'glutes', adductors: 'glutes', iliopsoas: 'glutes',
  quadriceps: 'quadriceps', 'quadriceps femoris': 'quadriceps',
  'rectus femoris': 'quadriceps', 'vastus lateralis': 'quadriceps', 'vastus medialis': 'quadriceps', 'vastus intermedius': 'quadriceps',
  hamstrings: 'hamstrings', 'biceps femoris': 'hamstrings',
  semitendinosus: 'hamstrings', semimembranosus: 'hamstrings',
  calves: 'calves', gastrocnemius: 'calves', soleus: 'calves',
  legs: 'legs',
};

const ANATOMICAL_LABEL = {
  biceps_femoris: 'Biceps Femoris',
  quadriceps_femoris: 'Quadriceps Femoris',
  erector_spinae: 'Erector Spinae',
  rectus_abdominis: 'Rectus Abdominis',
  obliquus_externus: 'Obliquus Externus',
  gluteus_maximus: 'Gluteus Maximus',
  gluteus_medius: 'Gluteus Medius',
  rotator_cuff: 'Rotator Cuff',
  rectus_femoris: 'Rectus Femoris',
  vastus_lateralis: 'Vastus Lateralis',
  vastus_medialis: 'Vastus Medialis',
  vastus_intermedius: 'Vastus Intermedius',
  transverse_abdominis: 'Transverse Abdominis',
  serratus_anterior: 'Serratus Anterior',
  teres_major: 'Teres Major',
  teres_minor: 'Teres Minor',
  quadratus_lumborum: 'Quadratus Lumborum',
};

function muscleKey(raw) {
  let value = String(raw || '').toLowerCase().trim();
  value = value.replace(/^\d+[_\s-]*/, '');
  value = value.replace(/[_-]+/g, ' ');
  value = value.replace(/\s+/g, ' ').trim();
  const swaps = [
    [/^deltoid (anterior|posterior|lateral)s?$/, '$1 deltoid'],
    [/^trapezius (upper|middle|lower)$/, '$1 traps'],
  ];
  for (const [pattern, replacement] of swaps) value = value.replace(pattern, replacement);
  return value;
}

function nameToGroup(raw) {
  return NAME_TO_GROUP[muscleKey(raw)] || null;
}

export function canonicalMuscleId(raw) {
  if (!raw) return '';
  const value = String(raw);
  if (/^\d+_[a-z_]+$/.test(value)) return value;
  return STRING_ALIASES[muscleKey(value)] || value;
}

function prettify(raw) {
  const stripped = String(raw || '').replace(/^\d+_/, '');
  if (ANATOMICAL_LABEL[stripped.toLowerCase()]) return ANATOMICAL_LABEL[stripped.toLowerCase()];
  return stripped
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

export function splitMuscleEntries(list) {
  if (!Array.isArray(list)) return [];
  const output = [];
  for (const raw of list) {
    if (!raw) continue;
    String(raw).split(/[,;/]+/).map((part) => part.trim()).filter(Boolean).forEach((part) => output.push(part));
  }
  return output;
}

export function formatMuscleDetail(muscleId, taxonomy = null, lang = 'de', detail = 'normal') {
  if (!muscleId) return '';
  const canonical = canonicalMuscleId(muscleId);
  if (detail === 'catalog') return canonical;
  if (detail === 'region') {
    if (GROUP_TRANSLATIONS.de[canonical]) return translateMuscleGroup(canonical, lang);
    const numericGroup = numericSlugToGroup(canonical);
    if (numericGroup) return translateMuscleGroup(numericGroup, lang);
    const namedGroup = nameToGroup(canonical);
    if (namedGroup) return translateMuscleGroup(namedGroup, lang);
    if (taxonomy && taxonomy[canonical]?.region) return translateMuscleGroup(taxonomy[canonical].region, lang);
    return prettify(canonical);
  }
  if (taxonomy && taxonomy[canonical]) {
    const muscle = taxonomy[canonical];
    if (lang === 'de' && muscle.label_de) return muscle.label_de;
    if (lang === 'en' && muscle.label_en) return muscle.label_en;
    if (lang === 'lat' && muscle.label_lat) return muscle.label_lat;
    return muscle.display_name || prettify(canonical);
  }
  if (GROUP_TRANSLATIONS.de[canonical]) return translateMuscleGroup(canonical, lang);
  return prettify(canonical);
}

export const MUSCLE_DETAIL_KEY = 'fitness-muscleDetail';
export const MUSCLE_DETAIL_DEFAULT = 'normal';
export const MUSCLE_DETAIL_OPTIONS = [
  { key: 'region', label: 'Region', hint: 'Rücken · Beinbeuger' },
  { key: 'normal', label: 'Normal', hint: 'Biceps Femoris' },
  { key: 'catalog', label: 'Katalog', hint: '201_latissimus_dorsi' },
];

export function loadMuscleDetail() {
  try {
    const value = localStorage.getItem(MUSCLE_DETAIL_KEY);
    return MUSCLE_DETAIL_OPTIONS.some((option) => option.key === value) ? value : MUSCLE_DETAIL_DEFAULT;
  } catch {
    return MUSCLE_DETAIL_DEFAULT;
  }
}

export function saveMuscleDetail(value) {
  localStorage.setItem(MUSCLE_DETAIL_KEY, value);
}

const RBH_SLUG_BY_NUMERIC_ID = {
  100: 'chest', 101: 'chest', 102: 'chest', 103: 'chest', 104: 'chest', 105: 'chest',
  202: 'trapezius', 203: 'trapezius', 204: 'trapezius',
  206: 'lower-back',
  301: 'front-deltoids', 303: 'back-deltoids',
  401: 'triceps',
  402: 'biceps', 403: 'biceps',
  404: 'forearm', 405: 'forearm', 406: 'forearm', 407: 'forearm',
  501: 'abs', 504: 'abs', 506: 'abs', 507: 'abs', 508: 'abs',
  502: 'obliques', 503: 'obliques',
  601: 'quadriceps',
  602: 'adductor',
  603: 'gluteal', 608: 'gluteal', 609: 'gluteal',
  604: 'hamstring', 605: 'hamstring', 606: 'hamstring',
  701: 'calves', 702: 'calves',
};

const RBH_SLUG_BY_WORD = {
  chest: 'chest',
  calves: 'calves',
  quadriceps: 'quadriceps',
  glutes: 'gluteal',
  hamstrings: 'hamstring',
  forearms: 'forearm',
  abs: 'abs',
  obliques: 'obliques',
  biceps: 'biceps',
  triceps: 'triceps',
  trapezius: 'trapezius',
  upper_back: 'upper-back',
  abductors: 'abductors',
};

export function muscleToRbhSlug(raw) {
  if (!raw) return null;
  const canonical = canonicalMuscleId(raw);
  const match = String(canonical).match(/^(\d+)/);
  if (match && RBH_SLUG_BY_NUMERIC_ID[Number(match[1])]) return RBH_SLUG_BY_NUMERIC_ID[Number(match[1])];
  return RBH_SLUG_BY_WORD[canonical] || null;
}

const RMH_SLUG_BY_NUMERIC_ID = {
  100: 'chest', 101: 'chest', 102: 'chest', 103: 'chest', 104: 'chest', 105: 'chest',
  201: 'upper-back', 205: 'upper-back', 207: 'upper-back',
  202: 'trapezius', 203: 'trapezius', 204: 'trapezius',
  206: 'lower-back',
  301: 'deltoids', 302: 'deltoids', 303: 'deltoids',
  401: 'triceps',
  402: 'biceps', 403: 'biceps',
  404: 'forearm', 405: 'forearm', 406: 'forearm', 407: 'forearm',
  501: 'abs', 504: 'abs', 506: 'abs', 507: 'abs', 508: 'abs',
  502: 'obliques', 503: 'obliques',
  601: 'quadriceps',
  602: 'adductors',
  603: 'gluteal', 608: 'gluteal', 609: 'gluteal',
  604: 'hamstring', 605: 'hamstring', 606: 'hamstring',
  701: 'calves', 702: 'calves',
  703: 'tibialis',
};

const RMH_SLUG_BY_WORD = {
  chest: 'chest',
  calves: 'calves',
  quadriceps: 'quadriceps',
  glutes: 'gluteal',
  hamstrings: 'hamstring',
  forearms: 'forearm',
  abs: 'abs',
  obliques: 'obliques',
  biceps: 'biceps',
  triceps: 'triceps',
  trapezius: 'trapezius',
  shoulders: 'deltoids',
  adductors: 'adductors',
  upper_back: 'upper-back',
};

export function muscleToRmhSlug(raw) {
  if (!raw) return null;
  const canonical = canonicalMuscleId(raw);
  const match = String(canonical).match(/^(\d+)/);
  if (match && RMH_SLUG_BY_NUMERIC_ID[Number(match[1])]) return RMH_SLUG_BY_NUMERIC_ID[Number(match[1])];
  return RMH_SLUG_BY_WORD[canonical] || null;
}

export function translateMuscle(muscleId, taxonomy = null, lang = 'de') {
  if (!muscleId) return '';
  if (taxonomy && taxonomy[muscleId]) {
    const muscle = taxonomy[muscleId];
    if (lang === 'de' && muscle.label_de) return muscle.label_de;
    if (lang === 'en' && muscle.label_en) return muscle.label_en;
    if (lang === 'lat' && muscle.label_lat) return muscle.label_lat;
    return muscle.display_name || muscleId;
  }
  if (GROUP_TRANSLATIONS.de[muscleId]) {
    return translateMuscleGroup(muscleId, lang);
  }
  const group = numericSlugToGroup(muscleId);
  if (group) return translateMuscleGroup(group, lang);
  return muscleId
    .replace(/^\d+_/, '')
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
