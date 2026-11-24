// Coach planning inputs; Fuel goal field names remain compatible with GoalsSection.
// Mifflin (1990), EFSA DRV (2017), ISSN protein position stand (2017).
export const NUTRITION_SOURCES = [
  { label: 'Mifflin–St Jeor · Energiebedarf (1990)', url: 'https://pubmed.ncbi.nlm.nih.gov/2305711/' },
  { label: 'ISSN · Protein und Sport (2017)', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC5477153/' },
  { label: 'EFSA · Nährstoffreferenzwerte (2017)', url: 'https://www.efsa.europa.eu/sites/default/files/2017_09_DRVs_summary_report.pdf' },
];
export const EMPTY_NUTRITION_INPUT = {
  age: '', weight: '', height: '', sex: '', method: 'estimate', maintenance: '', activity: '1.4',
  goal: 'maintain', adjustment: '10', proteinPerKg: '1.6', referenceWeight: '', fatPercent: '30', meals: '3',
  scope: '', style: 'mixed', foods: '', exclusions: '', logistics: '',
};
const number = (value, min, max, label) => {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value.replace(',', '.')) : NaN;
  if (!Number.isFinite(n) || n < min || n > max) throw new Error(`${label}: bitte einen Wert von ${min} bis ${max} eingeben.`);
  return n;
};
export function normalizeNutritionInput(input = {}) {
  const value = Object.fromEntries(Object.keys(EMPTY_NUTRITION_INPUT).map((key) => [key, typeof input[key] === 'string' || typeof input[key] === 'number' ? String(input[key]).slice(0, 1500) : EMPTY_NUTRITION_INPUT[key]]));
  return value;
}
export function calculateNutritionTargets(raw) {
  const input = normalizeNutritionInput(raw);
  const age = number(input.age, 18, 100, 'Alter');
  if (input.scope !== 'general') throw new Error('Automatische Planung nur für gesunde Erwachsene. Bei Schwangerschaft, Stillzeit, Essstörung oder ernährungsrelevanter Erkrankung ist eine individuelle Fachplanung erforderlich.');
  const weight = number(input.weight, 35, 250, 'Gewicht (kg)');
  const referenceWeight = input.referenceWeight.trim() ? number(input.referenceWeight, 35, 250, 'Bezugsgewicht (kg)') : weight;
  let restingKcal = null;
  let maintenanceKcal;
  if (input.method === 'manual') maintenanceKcal = number(input.maintenance, 1200, 6500, 'Erhaltungsbedarf (kcal)');
  else if (input.method === 'estimate') {
    const height = number(input.height, 130, 220, 'Größe (cm)');
    if (!['m', 'f'].includes(input.sex)) throw new Error('Bitte den Formelparameter wählen oder einen bekannten Erhaltungsbedarf verwenden.');
    const activity = number(input.activity, 1.2, 2, 'Aktivitätsfaktor');
    restingKcal = 10 * weight + 6.25 * height - 5 * age + (input.sex === 'f' ? -161 : 5);
    maintenanceKcal = Math.round(restingKcal * activity / 10) * 10;
    if (weight / (height / 100) ** 2 < 18.5 && input.goal === 'lose') throw new Error('Bei Untergewicht kein automatisches Abnahmeziel. Ziel und Versorgung individuell abklären.');
  } else throw new Error('Unbekannte Berechnungsmethode.');
  if (!['maintain', 'lose', 'gain'].includes(input.goal)) throw new Error('Bitte ein gültiges Ziel wählen.');
  const adjustment = input.goal === 'maintain' ? 0 : number(input.adjustment, 0, 20, 'Zielanpassung (%)');
  const deltaPct = input.goal === 'lose' ? -adjustment : adjustment;
  const targetKcal = Math.round(maintenanceKcal * (1 + deltaPct / 100) / 10) * 10;
  // Prototype bounds, not a declaration that every value inside them is suitable.
  const floor = input.sex === 'f' ? 1200 : 1500;
  if (targetKcal < floor || (restingKcal && targetKcal < restingKcal)) throw new Error('Das berechnete Energieziel liegt unter der Planungsgrenze. Defizit reduzieren oder Bedarf individuell abklären.');
  const proteinPerKg = number(input.proteinPerKg, 0.8, 2.4, 'Protein (g/kg)');
  const fatPercent = number(input.fatPercent, 20, 35, 'Fettanteil (%)');
  const proteinG = Math.round(referenceWeight * proteinPerKg);
  const fatG = Math.max(Math.round(targetKcal * fatPercent / 100 / 9), Math.ceil(referenceWeight * 0.6));
  const remainder = targetKcal - proteinG * 4 - fatG * 9;
  if (remainder < 0 || fatG * 9 / targetKcal > 0.36) throw new Error('Protein- und Fettvorgaben passen nicht zum Energieziel. Bezugsgewicht, Faktoren oder Energieziel prüfen.');
  const carbsG = Math.round(remainder / 4);
  const meals = number(input.meals, 2, 6, 'Mahlzeiten');
  if (!Number.isInteger(meals)) throw new Error('Mahlzeiten bitte als ganze Zahl eingeben.');
  const totals = { kcal: targetKcal, protein: proteinG, fat: fatG, carbs: carbsG };
  const mealTargets = Array.from({ length: meals }, (_, i) => Object.fromEntries(Object.entries(totals).map(([key, total]) => [key, Math.floor(total / meals) + (i < total % meals ? 1 : 0)])));
  const warnings = ['Bedarf und Ziel sind Startwerte. Nach 2–4 Wochen anhand von Verlauf, Hunger, Erholung und Trainingsleistung prüfen; kein zugesichertes Zielgewicht oder Zieldatum.'];
  if (proteinPerKg > 2) warnings.push('Erhöhter Proteinfaktor: für diesen Klienten begründen und überprüfen.');
  if (input.goal === 'lose' && input.method === 'manual') warnings.push('Bei bekanntem Erhaltungsbedarf werden Körpergröße und Untergewicht hier nicht automatisch geprüft.');
  return { maintenanceKcal: Math.round(maintenanceKcal), restingKcal: restingKcal ? Math.round(restingKcal) : null,
    targetKcal, deltaPct, proteinG, fatG, carbsG, macroKcal: proteinG * 4 + fatG * 9 + carbsG * 4, referenceWeight,
    mealTargets, warnings,
    fuelGoals: { kcal_goal: targetKcal, protein_goal: proteinG, fat_goal: fatG, carbs_goal: carbsG,
      carb_ratio: remainder / (targetKcal - proteinG * 4) * 100 } };
}
export function nutritionDraftKey(coachUid, clientUid) {
  if (!coachUid || !clientUid) throw new Error('Coach und Klient müssen ausgewählt sein.');
  return `coach:nutrition-draft:v1:${encodeURIComponent(coachUid)}:${encodeURIComponent(clientUid)}`;
}
export function nutritionAiContext(input, targets) {
  // Explicit allowlist: no UID, client name, e-mail, profile or medical file.
  const clean = normalizeNutritionInput(input);
  return { goal: clean.goal, style: clean.style, approvedFoods: clean.foods, exclusions: clean.exclusions,
    logistics: clean.logistics, dailyTargets: { kcal: targets.targetKcal, protein: targets.proteinG, fat: targets.fatG, carbs: targets.carbsG },
    mealTargets: targets.mealTargets };
}
export function normalizeNutritionIdeas(value, count) {
  const text = (value, max = 1500) => {
    if (typeof value !== 'string' || !value.trim()) throw new Error('Die KI-Antwort ist unvollständig. Bitte erneut versuchen.');
    return value.trim().slice(0, max);
  };
  if (!Array.isArray(value?.recipes) || value.recipes.length !== count || !Array.isArray(value.review) || !value.review.length) throw new Error('Die KI-Antwort enthält nicht die angeforderte Mahlzeitenstruktur.');
  return { rationale: text(value.rationale), review: value.review.slice(0, 5).map((item) => text(item)),
    recipes: value.recipes.map((recipe) => {
      if (!recipe || typeof recipe !== 'object') throw new Error('Ungültiges Rezept erhalten.');
      if (!Array.isArray(recipe.ingredients) || !recipe.ingredients.length || !Array.isArray(recipe.steps) || !recipe.steps.length) throw new Error('Rezept ohne Zutaten oder Zubereitung erhalten.');
      return { name: text(recipe.name, 120), ingredients: recipe.ingredients.slice(0, 20).map((item) => text(item, 300)), steps: recipe.steps.slice(0, 10).map((item) => text(item, 600)) };
    }) };
}
