export const OMEGA3_RULES = "Omega-3-Erkennung:\n- Alle Omega-3-Werte in mg für die angegebene Portion; g mit Faktor 1000 umrechnen.\n- omega3_ala_mg, omega3_epa_mg, omega3_dha_mg und omega3_dpa_mg getrennt erfassen.\n- omega3_mg ist die Gesamtsumme inklusive der Einzelwerte, kein zusätzlicher Beitrag.\n- omega3_epa_dha_mg ist ausschließlich EPA + DHA; ALA und DPA zählen hier nicht mit.\n- ALA (z.B. Leinöl/Chia/Walnüsse) niemals rechnerisch in EPA oder DHA umwandeln.\n- Fischöl-/Algenöl-Gesamtgewicht ist NICHT die Omega-3- oder EPA/DHA-Menge.\n- Bei Supplementen Etikettwerte und Bezugsportion/Kapselzahl verwenden; ohne bekannte Zusammensetzung keine EPA/DHA-Anteile erfinden. Algenöl nicht pauschal als EPA-haltig behandeln.\n- Fehlende oder nicht belegbare Omega-3-Werte weglassen, nicht als 0 ausgeben. Explizite 0 bleibt 0.\n- Unspezifisches 18:3 oder Gesamt-PUFA nicht als gesichertes ALA/Omega-3 zuordnen.\n- Bei Mahlzeiten Quellen/Zutaten und Mengen beachten; keine hohen Werte allein aus einem Gerichtsnamen ableiten.\n";
// Missing components remain absent. Never infer a split from a total.
export const OMEGA3_KEYS = ["omega3_mg", "omega3_ala_mg", "omega3_epa_mg", "omega3_dha_mg", "omega3_dpa_mg", "omega3_epa_dha_mg"];
export function normalizeOmega3(raw = {}) {
  const out = { ...raw };
  for (const key of OMEGA3_KEYS) {
    const value = raw[key];
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) delete out[key];
  }
  if (out.omega3_epa_mg != null && out.omega3_dha_mg != null)
    out.omega3_epa_dha_mg = out.omega3_epa_mg + out.omega3_dha_mg;
  const parts = OMEGA3_KEYS.slice(1, 5);
  if (parts.every(key => out[key] != null))
    out.omega3_mg = Math.max(out.omega3_mg ?? 0, parts.reduce((sum, key) => sum + out[key], 0));
  return out;
}

export function omega3Coverage(breakdown, comparison) {
  const entries = Object.values(breakdown).flat();
  return Object.fromEntries(OMEGA3_KEYS.map(key => {
    const known = entries.filter(entry => normalizeOmega3(entry.micros || {})[key] != null).length;
    const complete = known > 0 && known === entries.length;
    return [key, { ...comparison[key], known_entries: known, total_entries: entries.length,
      coverage: known === 0 ? "unknown" : complete ? "complete" : "partial",
      ...(known === 0 ? { avg_daily: null, total_week: null } : {}),
      ...(!complete ? { percent_of_dach: null, status: "unknown" } : {}),
    }];
  }));
}
