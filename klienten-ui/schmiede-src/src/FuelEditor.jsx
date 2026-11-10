import { useEffect, useRef, useState } from "react";
import { api, post } from "./api.js";

function ZutateSuche({ klientId, onHinzufügen }) {
  const [q, setQ] = useState("");
  const [ergebnisse, setErgebnisse] = useState([]);
  const ref = useRef(null);

  useEffect(() => {
    if (q.length < 2) { setErgebnisse([]); return; }
    const t = setTimeout(() =>
      api(`/k/${klientId}/nutrition/search?q=${encodeURIComponent(q)}&limit=8`)
        .then((d) => setErgebnisse(d?.results || []))
        .catch(() => setErgebnisse([])), 220);
    return () => clearTimeout(t);
  }, [q, klientId]);

  useEffect(() => {
    function onOut(e) { if (ref.current && !ref.current.contains(e.target)) setErgebnisse([]); }
    document.addEventListener("mousedown", onOut);
    return () => document.removeEventListener("mousedown", onOut);
  }, []);

  function wähle(item) {
    const kcal = item.kcal ?? item.energy ?? "?";
    const ew = item.ew ?? item.protein ?? "?";
    const fett = item.fett ?? item.fat ?? "?";
    const kh = item.kh ?? item.carbohydrates ?? "?";
    onHinzufügen(`${item.name}${item.brand ? ` (${item.brand})` : ""} · ${kcal} kcal · ${ew}g P · ${fett}g F · ${kh}g KH`);
    setQ(""); setErgebnisse([]);
  }

  return (
    <div className="zutat-suche" ref={ref}>
      <input className="zutat-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Zutat suchen (wger / Open Food Facts)…" />
      {ergebnisse.length > 0 && (
        <div className="zutat-liste">
          {ergebnisse.map((r, i) => (
            <button key={i} type="button" className="zutat-item" onClick={() => wähle(r)}>
              <span className="zutat-name">{r.name}{r.brand ? ` — ${r.brand}` : ""}</span>
              <span className="zutat-makros">{r.kcal ?? r.energy ?? "?"} kcal · {r.ew ?? r.protein ?? "?"}g P · {r._src === "off" ? "OFF" : "wger"}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function FuelTageslog({ klientId, ziele }) {
  const [log, setLog] = useState(null);

  useEffect(() => {
    if (!klientId) return;
    api(`/k/${klientId}/nutrition/today`).then(setLog).catch(() => setLog(null));
  }, [klientId]);

  if (!log) return <div className="leer-karte"><p>Keine Tageslog-Daten verfügbar.</p></div>;

  const { meals = [], totals = {}, water_ml = 0, date } = log;

  function MakroBalken({ ist, soll, label, farbe }) {
    const pct = soll > 0 ? Math.min(100, Math.round((ist / soll) * 100)) : 0;
    return (
      <div className="makro-balken">
        <div className="makro-balken-label"><span>{label}</span><span>{Math.round(ist)}{soll > 0 ? ` / ${soll}` : ""}</span></div>
        <div className="makro-balken-track"><div className="makro-balken-fill" style={{ width: `${pct}%`, background: farbe }} /></div>
      </div>
    );
  }

  return (
    <div className="fuel-tageslog">
      <div className="tageslog-kopf">
        <span className="tageslog-datum">{date}</span>
        {water_ml > 0 && <span className="tageslog-wasser">💧 {water_ml} ml</span>}
        {meals.length > 0 && <span className="tageslog-gesamt">{Math.round(totals.kcal || 0)} kcal</span>}
      </div>
      <div className="tageslog-makros">
        <MakroBalken ist={totals.kcal || 0} soll={ziele?.kalorien || 0} label="kcal" farbe="#f59e0b" />
        <MakroBalken ist={totals.protein_g || 0} soll={ziele?.protein || 0} label="Protein g" farbe="#4f8cff" />
        <MakroBalken ist={totals.fat_g || 0} soll={ziele?.fett || 0} label="Fett g" farbe="#e05d44" />
        <MakroBalken ist={totals.carbs_g || 0} soll={ziele?.carbs || 0} label="Carbs g" farbe="#84cc16" />
      </div>
      {meals.length === 0 ? <p className="leer-karte" style={{ marginTop: 12 }}>Noch keine Mahlzeiten heute.</p> : (
        <div className="tageslog-mahlzeiten">
          {meals.map((m, i) => (
            <div key={i} className="tageslog-mahlzeit">
              <div className="tageslog-mahlzeit-kopf">
                <span className="tageslog-mahlzeit-typ">{m.type || "Mahlzeit"}</span>
                {m.kcal != null && <span className="tageslog-kcal">{m.kcal} kcal</span>}
                {m.protein_g != null && <span className="tageslog-makro">P {m.protein_g}g</span>}
                <span className="tageslog-zeit">{m.time ? new Date(m.time).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) : ""}</span>
              </div>
              {m.description && <p className="tageslog-desc">{m.description}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FuelCompliance({ klientId }) {
  const [days, setDays] = useState([]);
  useEffect(() => {
    if (!klientId) return;
    api(`/k/${klientId}/nutrition/compliance?weeks=2`).then(d => setDays(d?.days || [])).catch(() => {});
  }, [klientId]);
  if (!days.length) return null;
  const logged = days.filter(d => d.logged).length;
  return (
    <div className="fuel-compliance">
      <span className="fuel-compliance-label">{logged}/{days.length} Tage</span>
      <div className="fuel-compliance-dots">
        {days.map(d => <div key={d.date} title={d.date} className={`fuel-dot${d.logged ? " logged" : ""}`} />)}
      </div>
    </div>
  );
}

const MAKRO_FELDER = [
  { key: "kalorien", label: "kcal",    einheit: "kcal" },
  { key: "protein",  label: "Protein", einheit: "g" },
  { key: "carbs",    label: "Carbs",   einheit: "g" },
  { key: "fett",     label: "Fett",    einheit: "g" },
];

function neueMahlzeit() { return { name: "", zeit: "", items: [""] }; }

export function FuelPlanEditor({ klientId, fuelPlan: initial, onGespeichert }) {
  const [makros, setMakros] = useState({});
  const [mahlzeiten, setMahlzeiten] = useState([]);
  const [status, setStatus] = useState("");
  const [speichert, setSpeichert] = useState(false);
  const [ansicht, setAnsicht] = useState("plan");

  useEffect(() => {
    setMakros(initial?.makros || {});
    setMahlzeiten(initial?.mahlzeiten?.length ? initial.mahlzeiten : [neueMahlzeit()]);
  }, [initial, klientId]);

  function makroPatch(key, val) { setMakros((m) => ({ ...m, [key]: val === "" ? "" : Number(val) })); }
  function mahlzeitHinzu() { setMahlzeiten((m) => [...m, neueMahlzeit()]); }
  function mahlzeitWeg(i)  { setMahlzeiten((m) => m.filter((_, j) => j !== i)); }
  function mahlzeitPatch(i, key, val) { setMahlzeiten((m) => m.map((x, j) => j !== i ? x : { ...x, [key]: val })); }
  function itemPatch(i, k, val) { setMahlzeiten((m) => m.map((x, j) => j !== i ? x : { ...x, items: x.items.map((it, l) => l !== k ? it : val) })); }
  function itemHinzu(i) { setMahlzeiten((m) => m.map((x, j) => j !== i ? x : { ...x, items: [...x.items, ""] })); }
  function itemWeg(i, k) { setMahlzeiten((m) => m.map((x, j) => j !== i ? x : { ...x, items: x.items.filter((_, l) => l !== k) })); }
  function zutatHinzufügen(i, text) { setMahlzeiten((m) => m.map((x, j) => j !== i ? x : { ...x, items: [...x.items.slice(0, -1), text, ""] })); }

  async function speichern() {
    setSpeichert(true); setStatus("");
    try { await post(`/k/${klientId}/plan/fuel`, { makros, mahlzeiten }); onGespeichert({ makros, mahlzeiten }); setStatus("✓ Gespeichert"); }
    catch (e) { setStatus(`Fehler: ${e.message}`); }
    finally { setSpeichert(false); }
  }

  return (
    <div className="plan-editor fuel-plan-editor">
      <FuelCompliance klientId={klientId} />
      <div className="plan-kopf">
        <h3>Ernährungsplan</h3>
        <div className="plan-aktionen">
          <div className="fuel-ansicht-toggle">
            <button type="button" className={ansicht === "plan" ? "aktiv" : ""} onClick={() => setAnsicht("plan")}>Plan</button>
            <button type="button" className={ansicht === "heute" ? "aktiv" : ""} onClick={() => setAnsicht("heute")}>Heute</button>
          </div>
          {ansicht === "plan" && (
            <>{status && <span className="plan-status">{status}</span>}
            <button type="button" className="btn-primary" onClick={speichern} disabled={speichert}>{speichert ? "Speichere…" : "Speichern"}</button></>
          )}
        </div>
      </div>
      {ansicht === "heute" ? <FuelTageslog klientId={klientId} ziele={makros} /> : (
        <>
          <div className="fuel-makros">
            <span className="fuel-makros-label">Tagesziel</span>
            {MAKRO_FELDER.map(({ key, label, einheit }) => (
              <label key={key} className="fuel-makro-feld">
                <span>{label}</span>
                <div className="fuel-makro-input-wrap">
                  <input className="fuel-makro-input" type="number" min="0" value={makros[key] ?? ""} onChange={(e) => makroPatch(key, e.target.value)} placeholder="—" />
                  <span className="fuel-makro-einheit">{einheit}</span>
                </div>
              </label>
            ))}
          </div>
          <div className="fuel-mahlzeiten-liste">
            {mahlzeiten.map((m, i) => (
              <div key={i} className="fuel-mahlzeit">
                <div className="fuel-mahlzeit-kopf">
                  <input className="fuel-mahlzeit-name" value={m.name} onChange={(e) => mahlzeitPatch(i, "name", e.target.value)} placeholder="Mahlzeit (z.B. Frühstück, Pre-Workout)" />
                  <input className="fuel-mahlzeit-zeit" value={m.zeit} onChange={(e) => mahlzeitPatch(i, "zeit", e.target.value)} placeholder="Zeit" title="Uhrzeit (z.B. 07:30)" />
                  {mahlzeiten.length > 1 && <button type="button" className="btn-entfernen-klein" onClick={() => mahlzeitWeg(i)}>×</button>}
                </div>
                <div className="fuel-items-liste">
                  {m.items.map((item, k) => (
                    <div key={k} className="fuel-item-zeile">
                      <input className="fuel-item-input" value={item} onChange={(e) => itemPatch(i, k, e.target.value)} placeholder="z.B. 200g Haferflocken + Milch · 31g P" />
                      {m.items.length > 1 && <button type="button" className="btn-entfernen-klein" onClick={() => itemWeg(i, k)}>×</button>}
                    </div>
                  ))}
                  <button type="button" className="fuel-item-hinzu" onClick={() => itemHinzu(i)}>+ Freitext</button>
                </div>
                <ZutateSuche klientId={klientId} onHinzufügen={(text) => zutatHinzufügen(i, text)} />
              </div>
            ))}
            <button type="button" className="fuel-mahlzeit-hinzu" onClick={mahlzeitHinzu}>+ Mahlzeit</button>
          </div>
        </>
      )}
    </div>
  );
}
