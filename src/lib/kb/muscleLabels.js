/**
 * Compact UI label helpers for exercise muscle chips.
 * Kept separate from the static KB loader, but re-exported by kb/muscles.js.
 */

const MUSCLE_MAP = {
  chest: { de: "Brust", gruppe: "druck" },
  shoulders: { de: "Schultern", gruppe: "druck" },
  triceps: { de: "Trizeps", gruppe: "druck" },
  lats: { de: "Breiter Rücken", gruppe: "zug" },
  "middle back": { de: "Mittlerer Rücken", gruppe: "zug" },
  "lower back": { de: "Unterer Rücken", gruppe: "zug" },
  traps: { de: "Trapez", gruppe: "zug" },
  biceps: { de: "Bizeps", gruppe: "zug" },
  forearms: { de: "Unterarme", gruppe: "zug" },
  quadriceps: { de: "Beinstrecker", gruppe: "beine" },
  hamstrings: { de: "Beinbeuger", gruppe: "beine" },
  glutes: { de: "Gesäß", gruppe: "beine" },
  calves: { de: "Waden", gruppe: "beine" },
  adductors: { de: "Adduktoren", gruppe: "beine" },
  abductors: { de: "Abduktoren", gruppe: "beine" },
  "hip flexors": { de: "Hüftbeuger", gruppe: "beine" },
  "it band": { de: "IT-Band", gruppe: "beine" },
  abdominals: { de: "Bauch", gruppe: "core" },
  obliques: { de: "Schräge Bauchmuskeln", gruppe: "core" },
  neck: { de: "Nacken", gruppe: "sonstige" },
};

const GRUPPE_COLOR = {
  druck: "#3b82f6",
  zug: "#22c55e",
  beine: "#f97316",
  core: "#a855f7",
  sonstige: "#6b7280",
};

const CANONICAL_ID_TO_KEY = {
  "101_pectoralis_major": "chest",
  "102_pectoralis_major_clavicular": "chest",
  "103_pectoralis_major_sternal": "chest",
  "104_pectoralis_minor": "chest",
  "105_serratus_anterior": "chest",
  "201_latissimus_dorsi": "lats",
  "202_trapezius": "traps",
  "202a_trapezius_upper": "traps",
  "202b_trapezius_middle": "traps",
  "202c_trapezius_lower": "traps",
  "205_rhomboids": "middle back",
  "206_erector_spinae": "lower back",
  "207_teres_major": "middle back",
  "301_anterior_deltoid": "shoulders",
  "302_lateral_deltoid": "shoulders",
  "303_posterior_deltoid": "shoulders",
  "304_rotator_cuff": "shoulders",
  "305_supraspinatus": "shoulders",
  "306_infraspinatus": "shoulders",
  "307_teres_minor": "shoulders",
  "308_subscapularis": "shoulders",
  "401_triceps_brachii": "triceps",
  "401a_triceps_long_head": "triceps",
  "401b_triceps_lateral_head": "triceps",
  "401c_triceps_medial_head": "triceps",
  "402_biceps_brachii": "biceps",
  "403_brachialis": "biceps",
  "404_brachioradialis": "forearms",
  "405_forearm_flexors": "forearms",
  "405a_flexor_digitorum_superficialis": "forearms",
  "405b_flexor_carpi_ulnaris": "forearms",
  "405c_flexor_carpi_radialis": "forearms",
  "405d_palmaris_longus": "forearms",
  "406_forearm_extensors": "forearms",
  "406a_extensor_digitorum": "forearms",
  "406b_extensor_carpi_radialis_longus": "forearms",
  "406c_extensor_carpi_radialis_brevis": "forearms",
  "406d_extensor_carpi_ulnaris": "forearms",
  "407_anconeus": "triceps",
  "501_rectus_abdominis": "abdominals",
  "502_obliquus_externus": "obliques",
  "503_obliquus_internus": "obliques",
  "504_transverse_abdominis": "abdominals",
  "505_quadratus_lumborum": "lower back",
  "506_diaphragm": "abdominals",
  "507_multifidus": "lower back",
  "508_pelvic_floor": "abdominals",
  "601_quadriceps_femoris": "quadriceps",
  "601a_rectus_femoris": "quadriceps",
  "601b_vastus_lateralis": "quadriceps",
  "601c_vastus_medialis": "quadriceps",
  "601d_vastus_intermedius": "quadriceps",
  "602_adductors": "adductors",
  "602a_adductor_magnus": "adductors",
  "602b_adductor_longus": "adductors",
  "602c_adductor_brevis": "adductors",
  "603_gluteus_maximus": "glutes",
  "604_hamstrings": "hamstrings",
  "604a_biceps_femoris": "hamstrings",
  "604b_semitendinosus": "hamstrings",
  "604c_semimembranosus": "hamstrings",
  "607_iliopsoas": "hip flexors",
  "608_gluteus_medius": "abductors",
  "609_gluteus_minimus": "abductors",
  "701_gastrocnemius": "calves",
  "701a_gastrocnemius_medial": "calves",
  "701b_gastrocnemius_lateral": "calves",
  "702_soleus": "calves",
  "703_tibialis_anterior": "calves",
};

function toGroupKey(name) {
  if (!name) return name;
  const lower = name.toLowerCase();
  return CANONICAL_ID_TO_KEY[lower] ?? lower;
}

export function muskelDe(name) {
  return MUSCLE_MAP[toGroupKey(name)]?.de ?? name;
}

export function muskelGruppe(name) {
  return MUSCLE_MAP[toGroupKey(name)]?.gruppe ?? "sonstige";
}

export function muskelColor(name) {
  return GRUPPE_COLOR[muskelGruppe(name)] ?? "#64748b";
}

export function dedupeMuskeln(names) {
  const seen = new Set();
  const output = [];
  for (const name of names ?? []) {
    const key = toGroupKey(name);
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(name);
  }
  return output;
}
