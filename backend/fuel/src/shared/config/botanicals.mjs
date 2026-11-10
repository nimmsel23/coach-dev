// Pflanzliche Supplements (Adaptogene, Kräuter) — keine Mikronährstoffe nach
// DACH, daher kein `micros`, sondern ein `substance`-Verweis auf den
// Substanz-Katalog in relax-dev (knowledge/substance.catalog.yaml). Die IDs
// hier müssen dort existieren; Fuel loggt Dosis/Zeitpunkt, Relax wertet aus.
export const BOTANICALS = {
  ashwagandha: { label: "Ashwagandha" },
  mulungu: { label: "Mulungu" },
  tongkat_ali: { label: "Tongkat Ali" },
  brahmi: { label: "Brahmi" },
  rhodiola: { label: "Rhodiola" },
  passionflower: { label: "Passionsblume" },
  lavender: { label: "Lavendel" },
};

export const SUPPLEMENT_KINDS = ["micronutrient", "botanical"];
