import { useEffect, useMemo, useState } from "react";
import { api } from "./api.js";

const IMG_CDN = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises";
// Static copy next to SPA (also under /_klienten/ when hosted by coach).
const PUBLIC_DBS = ["./yuhonas-exercises.json", "/_klienten/yuhonas-exercises.json"];

function imageUrls(ex) {
  const images = ex?.images || [];
  return images.map((rel) => {
    if (String(rel).startsWith("http")) return rel;
    return `${IMG_CDN}/${rel}`;
  });
}

function summarize(ex) {
  return {
    id: ex.id,
    name: ex.name,
    level: ex.level,
    force: ex.force,
    mechanic: ex.mechanic,
    equipment: ex.equipment,
    category: ex.category,
    primaryMuscles: ex.primaryMuscles || [],
    secondaryMuscles: ex.secondaryMuscles || [],
    instructions: ex.instructions || [],
    images: imageUrls(ex),
    source: "yuhonas",
    yuhonas_id: ex.id,
    exercise_id: `yuhonas_${String(ex.id || "").toLowerCase()}`,
  };
}

async function loadLocalDb() {
  for (const url of PUBLIC_DBS) {
    try {
      const res = await fetch(url, { cache: "force-cache" });
      if (!res.ok) continue;
      const data = await res.json();
      if (Array.isArray(data)) return data.map(summarize);
    } catch {
      /* try next */
    }
  }
  throw new Error("Yuhonas-DB nicht ladbar");
}

function filterLocal(all, { q, muscle, equipment, level, category }) {
  const query = q.trim().toLowerCase();
  const muscleQ = muscle.trim().toLowerCase();
  const equipQ = equipment.trim().toLowerCase();
  const levelQ = level.trim().toLowerCase();
  const catQ = category.trim().toLowerCase();
  return all.filter((ex) => {
    if (query && !String(ex.name || "").toLowerCase().includes(query) && !String(ex.id || "").toLowerCase().includes(query)) {
      return false;
    }
    const prim = (ex.primaryMuscles || []).map((m) => String(m).toLowerCase());
    const sec = (ex.secondaryMuscles || []).map((m) => String(m).toLowerCase());
    if (muscleQ && !prim.includes(muscleQ) && !sec.includes(muscleQ)) return false;
    if (equipQ && !String(ex.equipment || "").toLowerCase().includes(equipQ)) return false;
    if (levelQ && String(ex.level || "").toLowerCase() !== levelQ) return false;
    if (catQ && String(ex.category || "").toLowerCase() !== catQ) return false;
    return true;
  });
}

function Detail({ exercise, onClose, onAdd }) {
  if (!exercise) return null;
  return (
    <div className="yuhonas-detail">
      <div className="yuhonas-detail-kopf">
        <div>
          <h3>{exercise.name}</h3>
          <p className="yuhonas-meta-zeile">
            {[exercise.level, exercise.mechanic, exercise.force, exercise.equipment, exercise.category]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <div className="yuhonas-detail-aktionen">
          {onAdd && (
            <button type="button" className="btn-primary" onClick={() => onAdd(exercise)}>
              Name kopieren
            </button>
          )}
          <button type="button" className="btn-zurück" onClick={onClose}>Schließen</button>
        </div>
      </div>
      <div className="yuhonas-bilder">
        {(exercise.images || []).map((src) => (
          <img key={src} src={src} alt={exercise.name} loading="lazy" />
        ))}
      </div>
      <div className="yuhonas-muskeln">
        <div>
          <strong>Primär</strong>
          <span>{(exercise.primaryMuscles || []).join(", ") || "—"}</span>
        </div>
        <div>
          <strong>Sekundär</strong>
          <span>{(exercise.secondaryMuscles || []).join(", ") || "—"}</span>
        </div>
      </div>
      {Array.isArray(exercise.instructions) && exercise.instructions.length > 0 && (
        <ol className="yuhonas-anleitung">
          {exercise.instructions.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>
      )}
      <p className="yuhonas-id">id: {exercise.id} · {exercise.exercise_id}</p>
    </div>
  );
}

export function YuhonasBrowser({ onPick }) {
  const [all, setAll] = useState(null);
  const [mode, setMode] = useState("local");
  const [q, setQ] = useState("");
  const [muscle, setMuscle] = useState("");
  const [equipment, setEquipment] = useState("");
  const [level, setLevel] = useState("");
  const [category, setCategory] = useState("");
  const [results, setResults] = useState([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState("Lädt Yuhonas-DB…");
  const [detail, setDetail] = useState(null);
  const [hinweis, setHinweis] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Prefer live coach API when available (after reload), else local JSON.
      try {
        const meta = await api("/yuhonas/meta");
        if (!cancelled && meta?.ok && meta.count) {
          setMode("api");
          setAll({ meta });
          setStatus(`API · ${meta.count} Übungen`);
          return;
        }
      } catch {
        /* fall through */
      }
      try {
        const items = await loadLocalDb();
        if (cancelled) return;
        setMode("local");
        setAll(items);
        setStatus(`Lokal · ${items.length} Übungen`);
      } catch (e) {
        if (!cancelled) setStatus(`Fehler: ${e.message}`);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const filterOptions = useMemo(() => {
    if (mode === "api" && all?.meta) {
      return {
        muscles: all.meta.muscles || [],
        equipment: all.meta.equipment || [],
        levels: all.meta.levels || [],
        categories: all.meta.categories || [],
      };
    }
    const items = Array.isArray(all) ? all : [];
    return {
      muscles: [...new Set(items.flatMap((ex) => ex.primaryMuscles || []))].sort(),
      equipment: [...new Set(items.map((ex) => ex.equipment).filter(Boolean))].sort(),
      levels: [...new Set(items.map((ex) => ex.level).filter(Boolean))].sort(),
      categories: [...new Set(items.map((ex) => ex.category).filter(Boolean))].sort(),
    };
  }, [all, mode]);

  useEffect(() => {
    if (!all) return;
    const t = setTimeout(async () => {
      if (mode === "api") {
        const params = new URLSearchParams({ limit: "48" });
        if (q.trim()) params.set("q", q.trim());
        if (muscle) params.set("muscle", muscle);
        if (equipment) params.set("equipment", equipment);
        if (level) params.set("level", level);
        if (category) params.set("category", category);
        try {
          const d = await api(`/yuhonas/search?${params}`);
          setResults(d?.results || []);
          setTotal(d?.total || 0);
          setStatus(`API · ${d?.total || 0} Treffer`);
        } catch (e) {
          setStatus(`API-Fehler: ${e.message}`);
        }
        return;
      }
      const hits = filterLocal(all, { q, muscle, equipment, level, category });
      setTotal(hits.length);
      setResults(hits.slice(0, 48));
      setStatus(`Lokal · ${hits.length} Treffer`);
    }, 160);
    return () => clearTimeout(t);
  }, [all, mode, q, muscle, equipment, level, category]);

  async function openDetail(id) {
    if (mode === "api") {
      try {
        const d = await api(`/yuhonas/exercise/${encodeURIComponent(id)}`);
        setDetail(d?.exercise || null);
        return;
      } catch {
        /* fall back */
      }
    }
    const hit = (Array.isArray(all) ? all : []).find((ex) => ex.id === id);
    setDetail(hit || null);
  }

  function addHinweis(ex) {
    const line = `${ex.name} [${ex.id}]`;
    setHinweis(line);
    onPick?.(ex);
    navigator.clipboard?.writeText(line).catch(() => {});
  }

  return (
    <div className="yuhonas-browser">
      <div className="plan-kopf">
        <h3>Yuhonas Übungs-DB</h3>
        <span className="plan-status">{status}</span>
      </div>
      <div className="yuhonas-filter">
        <input
          className="sidebar-suche"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Übung suchen (Name / id)…"
        />
        <select value={muscle} onChange={(e) => setMuscle(e.target.value)}>
          <option value="">Muskel</option>
          {filterOptions.muscles.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <select value={equipment} onChange={(e) => setEquipment(e.target.value)}>
          <option value="">Gerät</option>
          {filterOptions.equipment.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <select value={level} onChange={(e) => setLevel(e.target.value)}>
          <option value="">Level</option>
          {filterOptions.levels.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">Kategorie</option>
          {filterOptions.categories.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>
      {hinweis && <p className="yuhonas-hinweis">Kopiert: {hinweis}</p>}
      {detail ? (
        <Detail exercise={detail} onClose={() => setDetail(null)} onAdd={addHinweis} />
      ) : (
        <div className="yuhonas-grid">
          {results.map((ex) => (
            <button
              key={ex.id}
              type="button"
              className="yuhonas-karte"
              onClick={() => openDetail(ex.id)}
            >
              {ex.images?.[0] ? (
                <img src={ex.images[0]} alt="" loading="lazy" />
              ) : (
                <div className="yuhonas-karte-leer" />
              )}
              <strong>{ex.name}</strong>
              <span>{(ex.primaryMuscles || []).slice(0, 2).join(", ") || ex.equipment || "—"}</span>
            </button>
          ))}
          {results.length === 0 && <div className="leer-karte"><p>Keine Übungen für diesen Filter.</p></div>}
        </div>
      )}
      {!detail && total > results.length && (
        <p className="yuhonas-mehr">Zeige {results.length} von {total} — Filter verfeinern für den Rest.</p>
      )}
    </div>
  );
}
