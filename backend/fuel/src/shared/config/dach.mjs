// DACH Reference Values for adults
// Source: DGE (Deutsche Gesellschaft für Ernährung), ÖGE (Österreichische Gesellschaft für Ernährung)
// Standard für Deutschland, Österreich, Schweiz
//
// Einzige Quelle für die Mikronährstoff-Keys — Server (nutrition-micros.mjs,
// nutrition-db.mjs), Cloud-Client (db/firestore/utils.js) und UI
// (views/Micros/utils.js) leiten MICRO_KEYS/NUTRIENTS hieraus ab, statt die
// Liste redundant zu pflegen (frühere Divergenzgefahr bei neuen Nährstoffen).

export const DACH = {
  // Fettlösliche Vitamine
  vitamin_a_ug:   { value: 900,  unit: "µg", label: "Vit. A" },
  vitamin_d_ug:   { value: 20,   unit: "µg", label: "Vit. D" },
  vitamin_e_mg:   { value: 14,   unit: "mg", label: "Vit. E" },
  vitamin_k_ug:   { value: 70,   unit: "µg", label: "Vit. K" },
  // Wasserlösliche Vitamine — Personalisiert: Nikotin erhöht C (+40mg) + B6 (+0.5mg)
  vitamin_c_mg:   { value: 155,  unit: "mg", label: "Vit. C" },
  vitamin_b1_mg:  { value: 1.2,  unit: "mg", label: "B1" },
  vitamin_b2_mg:  { value: 1.4,  unit: "mg", label: "B2" },
  vitamin_b3_mg:  { value: 16,   unit: "mg", label: "B3" },
  vitamin_b5_mg:  { value: 6,    unit: "mg", label: "B5" },
  vitamin_b6_mg:  { value: 2.0,  unit: "mg", label: "B6" },
  vitamin_b7_ug:  { value: 40,   unit: "µg", label: "B7" },
  folate_ug:      { value: 400,  unit: "µg", label: "Folat" },
  vitamin_b12_ug: { value: 4,    unit: "µg", label: "B12" },
  // Mineralstoffe
  calcium_mg:     { value: 1000, unit: "mg", label: "Calcium" },
  phosphorus_mg:  { value: 700,  unit: "mg", label: "Phosphor" },
  magnesium_mg:   { value: 375,  unit: "mg", label: "Magnesium" },
  iron_mg:        { value: 10,   unit: "mg", label: "Eisen" },
  zinc_mg:        { value: 10,   unit: "mg", label: "Zink" },
  selenium_ug:    { value: 70,   unit: "µg", label: "Selen" },
  iodine_ug:      { value: 200,  unit: "µg", label: "Jod" },
  potassium_mg:   { value: 4000, unit: "mg", label: "Kalium" },
  sodium_mg:      { value: 550,  unit: "mg", label: "Natrium" },
  // Bor hat keinen offiziellen DACH-Referenzwert (kein essenzielles Element
  // nach DGE/ÖGE-Konsens). Wert = EFSA Adequate-Intake-Bereich für Erwachsene
  // (untere Orientierung, ~1mg/Tag) — bewusst konservativ, nicht DACH-Quelle.
  boron_mg:       { value: 1,    unit: "mg", label: "Bor" },
  // Fettsäuren
  // 250 mg applies to EPA+DHA (EFSA), never to total Omega-3/ALA.
  omega3_mg:      { value: null, unit: "mg", label: "Omega-3 gesamt" },
  omega3_ala_mg:  { value: null, unit: "mg", label: "Omega-3 ALA" },
  omega3_epa_mg:  { value: null, unit: "mg", label: "Omega-3 EPA" },
  omega3_dha_mg:  { value: null, unit: "mg", label: "Omega-3 DHA" },
  omega3_dpa_mg:  { value: null, unit: "mg", label: "Omega-3 DPA" },
  omega3_epa_dha_mg: { value: 250, unit: "mg", label: "EPA + DHA", source: "EFSA" },
};

export const MICRO_KEYS = Object.keys(DACH);

export function getStatus(value, reference) {
  if (!(reference > 0)) return "unknown";
  if (value >= reference * 0.9) return "ok"; // 90%+
  if (value >= reference * 0.5) return "warning"; // 50-90%
  return "critical"; // <50%
}
