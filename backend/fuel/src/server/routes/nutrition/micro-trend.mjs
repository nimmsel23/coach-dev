import { assembleWeek } from "../../services/nutrition-weekly.mjs";
import { DACH } from "../../../shared/config/dach.mjs";

// Slug-Normalisierung: Punkt/Whitespace → "-", Mehrfach-"-" kollabiert, Rand-"-" weg.
function slug(s) {
  return String(s)
    .toLowerCase()
    .replace(/[.\s]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

// Alias-Map beim Modul-Load aus DACH generieren: pro Key die kanonische Form,
// Bindestrich-Form, einheitslose Form (_mg/_ug gestrippt), "vit-"-Kurzform und
// den Label-Slug ("Vit. C" → vit-c, "B1" → b1, "Folat" → folat).
const KEY_ALIASES = (() => {
  const m = {};
  const add = (a, key) => { if (a && !(a in m)) m[a] = key; };
  for (const key of Object.keys(DACH)) {
    const stem = key.replace(/_(mg|ug)$/, ""); // vitamin_c
    add(key, key);
    add(slug(key), key);                                  // vitamin-c-mg
    add(stem, key);                                       // vitamin_c
    add(slug(stem), key);                                 // vitamin-c
    add(slug(stem).replace(/^vitamin-/, "vit-"), key);    // vit-c
    add(slug(DACH[key].label), key);                      // vit-c / b1 / folat / omega-3
  }
  // gängige deutsche / kompakte Extra-Aliase
  Object.assign(m, {
    zink: "zinc_mg",
    eisen: "iron_mg",
    kalium: "potassium_mg",
    natrium: "sodium_mg",
    jod: "iodine_ug",
    selen: "selenium_ug",
    kalzium: "calcium_mg",
    kalcium: "calcium_mg",
    phosphor: "phosphorus_mg",
    bor: "boron_mg",
    folsaeure: "folate_ug",
    "folsäure": "folate_ug",
    folsauere: "folate_ug",
    omega3: "omega3_mg",
    "omega-3": "omega3_mg",
    "vitamin-c": "vitamin_c_mg",
  });
  return m;
})();

function resolveMicroKey(raw) {
  if (!raw) return null;
  if (DACH[raw]) return raw;
  const lower = String(raw).toLowerCase();
  return KEY_ALIASES[lower] || KEY_ALIASES[slug(raw)] || null;
}

const r1 = (v) => Math.round((Number(v) || 0) * 10) / 10;

export default async function microTrendRoute(app) {
  // Wochenverlauf EINES Mikronährstoffs + Beitrags-Aufschlüsselung.
  // Projektions-Layer über assembleWeek() — siehe SPEC-micro-trend-endpoint.md.
  app.get("/nutrition/weekly/:year/:week/micro/:key", async (req, reply) => {
    try {
      const y = parseInt(req.params.year);
      const w = parseInt(req.params.week);
      if (isNaN(y) || isNaN(w) || w < 1 || w > 53) {
        return reply.status(400).send({ ok: false, error: "Invalid year or week" });
      }

      const key = resolveMicroKey(req.params.key);
      if (!key) {
        return reply.status(400).send({
          ok: false,
          error: `Unknown micro key '${req.params.key}'`,
          known: Object.keys(DACH),
        });
      }

      const limit = Math.max(1, Math.min(200, parseInt(req.query.limit) || 20));

      const { dates, rda_comparison, day_breakdown, meal_breakdown } =
        await assembleWeek(y, w, { paths: req.paths, uid: req.uid });

      const cmp = rda_comparison[key];

      const timeline = dates.map((d) => ({ date: d, value: r1(day_breakdown[d]?.[key]) }));

      const day_contributions = dates.map((d) => {
        const entries = (meal_breakdown[d] || [])
          .map((c) => ({ name: c.name, kind: c.kind, value: r1(c.micros?.[key]) }))
          .filter((c) => c.value > 0)
          .sort((a, b) => b.value - a.value);
        const total = r1(entries.reduce((s, c) => s + c.value, 0));
        return {
          date: d,
          total,
          items: entries.map((c) => ({
            ...c,
            percent: total > 0 ? Math.round((c.value / total) * 100) : 0,
          })),
        };
      });

      const top_contributors = dates
        .flatMap((d) =>
          (meal_breakdown[d] || []).map((c) => ({
            name: c.name,
            kind: c.kind,
            date: d,
            value: r1(c.micros?.[key]),
          }))
        )
        .filter((c) => c.value > 0)
        .sort((a, b) => b.value - a.value || (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
        .slice(0, limit);

      return reply.send({
        ok: true,
        year: y,
        week: w,
        micro: { key, label: DACH[key].label, unit: DACH[key].unit },
        dach_ref: cmp.dach,
        total_week: cmp.total_week,
        avg_daily: cmp.avg_daily,
        percent_of_dach: cmp.percent_of_dach,
        status: cmp.status,
        timeline,
        top_contributors,
        day_contributions,
        contributions_available: true,
      });
    } catch (error) {
      console.error(error);
      return reply.status(500).send({ ok: false, error: "Internal server error" });
    }
  });
}
