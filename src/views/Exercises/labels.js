// Deutsche Anzeigenamen für das yuhonas-Vokabular (Rohwerte bleiben englisch
// im Mirror). Unbekannte Werte werden unverändert angezeigt.

const MUSCLE = {
  abdominals: 'Bauch',
  abductors: 'Abduktoren',
  adductors: 'Adduktoren',
  biceps: 'Bizeps',
  calves: 'Waden',
  chest: 'Brust',
  forearms: 'Unterarme',
  glutes: 'Gesäß',
  hamstrings: 'Beinbeuger',
  lats: 'Latissimus',
  'lower back': 'Unterer Rücken',
  'middle back': 'Mittlerer Rücken',
  neck: 'Nacken',
  quadriceps: 'Quadrizeps',
  shoulders: 'Schultern',
  traps: 'Trapez',
  triceps: 'Trizeps',
}

const CATEGORY = {
  strength: 'Kraft',
  stretching: 'Dehnen',
  plyometrics: 'Plyometrie',
  powerlifting: 'Powerlifting',
  'olympic weightlifting': 'Gewichtheben',
  strongman: 'Strongman',
  cardio: 'Cardio',
}

const EQUIPMENT = {
  barbell: 'Langhantel',
  dumbbell: 'Kurzhantel',
  other: 'Sonstiges',
  'body only': 'Körpergewicht',
  cable: 'Kabelzug',
  machine: 'Maschine',
  kettlebells: 'Kettlebell',
  bands: 'Bänder',
  'medicine ball': 'Medizinball',
  'exercise ball': 'Gymnastikball',
  'foam roll': 'Faszienrolle',
  'e-z curl bar': 'SZ-Stange',
}

const LEVEL = { beginner: 'Einsteiger', intermediate: 'Fortgeschritten', expert: 'Experte' }
const FORCE = { push: 'Drücken', pull: 'Ziehen', static: 'Halten' }
const MECHANIC = { compound: 'Mehrgelenkig', isolation: 'Isolation' }

export const LEVEL_ORDER = ['beginner', 'intermediate', 'expert']

// yuhonas schreibt Muskeln teils mit Leerzeichen, das YAML-Derivat mit
// Unterstrich — beides auf eine Schreibweise bringen.
export function norm(value) {
  return String(value ?? '').toLowerCase().replace(/_/g, ' ').trim()
}

function pick(map, value) {
  const key = norm(value)
  return map[key] || (value ? String(value) : '')
}

export const muscleDe = (v) => pick(MUSCLE, v)
export const categoryDe = (v) => pick(CATEGORY, v)
export const equipmentDe = (v) => pick(EQUIPMENT, v)
export const levelDe = (v) => pick(LEVEL, v)
export const forceDe = (v) => pick(FORCE, v)
export const mechanicDe = (v) => pick(MECHANIC, v)
