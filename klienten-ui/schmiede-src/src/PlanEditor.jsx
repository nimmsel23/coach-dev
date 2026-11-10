import { useEffect, useRef, useState } from "react";
import { api, post, FREQUENZEN } from "./api.js";

function ÜbungsSuche({ onHinzufügen }) {
  const [q, setQ] = useState("");
  const [treffer, setTreffer] = useState([]);
  const ref = useRef(null);

  useEffect(() => {
    if (q.length < 2) { setTreffer([]); return; }
    const t = setTimeout(async () => {
      const merged = [];
      const seen = new Set();
      const push = (ex) => {
        const id = String(ex.id || ex.exercise_id || ex.name || "");
        if (!id || seen.has(id)) return;
        seen.add(id);
        merged.push(ex);
      };
      try {
        const d = await api(`/exercises/search?q=${encodeURIComponent(q)}&limit=8`);
        for (const r of d?.results || []) {
          push({
            id: r.exercise_id || r.id,
            name: r.display_name || r.name,
            category: r.source || r.category || "katalog",
            primaryMuscles: r.primary_muscles || r.primaryMuscles || [],
          });
        }
      } catch { /* ignore */ }
      try {
        const d = await api(`/yuhonas/search?q=${encodeURIComponent(q)}&limit=8`);
        for (const r of d?.results || []) {
          push({
            id: r.exercise_id || r.id,
            name: r.name,
            category: "yuhonas",
            primaryMuscles: r.primaryMuscles || [],
          });
        }
      } catch { /* ignore */ }
      try {
        const d = await api(`/fitness/exercises/search?q=${encodeURIComponent(q)}&limit=8`);
        for (const r of d?.results || []) {
          push({
            id: r.id || r.exercise_id,
            name: r.name || r.display_name,
            category: r.category || r.source || "fitness",
            primaryMuscles: r.primaryMuscles || r.primary_muscles || [],
          });
        }
      } catch { /* ignore */ }
      setTreffer(merged.slice(0, 12));
    }, 180);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    function onOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setTreffer([]);
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, []);

  function wähle(ex) { onHinzufügen(ex.name || ex.id, ex.id); setQ(""); setTreffer([]); }
  function freitext(e) {
    if (e.key === "Enter" && q.trim()) { onHinzufügen(q.trim(), null); setQ(""); setTreffer([]); }
  }

  return (
    <div className="üsuche" ref={ref}>
      <input className="üsuche-input" value={q} onChange={(e) => setQ(e.target.value)}
        onKeyDown={freitext} placeholder="Übung suchen (Katalog / Yuhonas) oder Freitext + Enter" />
      {treffer.length > 0 && (
        <div className="üsuche-liste">
          {treffer.map((ex) => (
            <button key={ex.id} type="button" className="üsuche-item" onClick={() => wähle(ex)}>
              <strong>{ex.name}</strong>
              {ex.category && <span>{ex.category}</span>}
              {ex.primaryMuscles?.length > 0 && <em>{ex.primaryMuscles.slice(0, 2).join(", ")}</em>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function WgerRoutineImport({ klientId, onImport }) {
  const [routinen, setRoutinen] = useState(null);
  const [offen, setOffen] = useState(false);
  const [lädt, setLädt] = useState(false);
  const [importiertId, setImportiertId] = useState(null);

  async function lade() {
    setLädt(true);
    try {
      const d = await api(`/k/${klientId}/wger/routine/`);
      setRoutinen(Array.isArray(d?.results) ? d.results : []);
      setOffen(true);
    } catch { setRoutinen([]); setOffen(true); }
    finally { setLädt(false); }
  }

  async function importiere(routine) {
    setImportiertId(routine.id);
    try {
      const d = await api(`/k/${klientId}/wger/day/?training=${routine.id}`);
      const days = Array.isArray(d?.results) ? d.results : [];
      onImport({
        name: routine.description || `wger Routine ${routine.id}`,
        abschnitte: days.length > 0
          ? days.sort((a, b) => (a.order_factor ?? 0) - (b.order_factor ?? 0))
              .map((day) => ({ name: day.description || day.name || `Tag ${day.order_factor ?? ""}`, dauer: "", hit: false, übungen: [] }))
          : [{ name: "", dauer: "", hit: false, übungen: [] }],
      });
    } catch {
      onImport({ name: routine.description || `wger Routine ${routine.id}`, abschnitte: [{ name: "", dauer: "", hit: false, übungen: [] }] });
    } finally { setImportiertId(null); setOffen(false); }
  }

  return (
    <div className="wger-import">
      <button type="button" className="btn-wger-import" onClick={lade} disabled={lädt}>
        {lädt ? "Lädt…" : "↓ wger Routine"}
      </button>
      {offen && (
        <div className="wger-modal-overlay" onClick={() => setOffen(false)}>
          <div className="wger-modal" onClick={(e) => e.stopPropagation()}>
            <div className="wger-modal-kopf">
              <span>wger Routinen</span>
              <button type="button" onClick={() => setOffen(false)}>✕</button>
            </div>
            {routinen === null ? <p className="wger-leer">Lädt…</p>
              : routinen.length === 0 ? <p className="wger-leer">Keine Routinen in wger.</p>
              : (
                <div className="wger-routinen-liste">
                  {routinen.map((r) => (
                    <button key={r.id} type="button" className="wger-routine-item"
                      disabled={importiertId === r.id} onClick={() => importiere(r)}>
                      <strong>{r.description || `Routine ${r.id}`}</strong>
                      <span>{importiertId === r.id ? "Importiere…" : "Importieren →"}</span>
                    </button>
                  ))}
                </div>
              )}
          </div>
        </div>
      )}
    </div>
  );
}

function neuerAbschnitt() { return { name: "", dauer: "", hit: false, übungen: [] }; }

function migriere(einheiten) {
  return (einheiten || []).map((e) => {
    const frequenz = e.frequenz || "weekly-1";
    if (Array.isArray(e.abschnitte)) return { ...e, frequenz };
    return { name: e.name || "", frequenz, abschnitte: [{ name: "", dauer: "", hit: !!e.hit, übungen: e.übungen || [] }] };
  });
}

export function PlanEditor({ klientId, plan, onGespeichert }) {
  const [einheiten, setEinheiten] = useState([]);
  const [status, setStatus] = useState("");
  const [speichert, setSpeichert] = useState(false);

  useEffect(() => { setEinheiten(migriere(plan?.einheiten)); }, [plan, klientId]);

  function einheitHinzu() { setEinheiten((e) => [...e, { name: "", frequenz: "weekly-1", abschnitte: [neuerAbschnitt()] }]); }
  function einheitWeg(i)  { setEinheiten((e) => e.filter((_, j) => j !== i)); }
  function einheitPatch(i, key, v) { setEinheiten((e) => e.map((ei, j) => j === i ? { ...ei, [key]: v } : ei)); }
  function routineImportieren(einheit) { setEinheiten((e) => [...e, { frequenz: "weekly-1", ...einheit }]); setStatus("✓ Routine importiert"); setTimeout(() => setStatus(""), 2000); }

  function abschnittHinzu(i) { setEinheiten((e) => e.map((ei, j) => j !== i ? ei : { ...ei, abschnitte: [...ei.abschnitte, neuerAbschnitt()] })); }
  function abschnittWeg(i, a) { setEinheiten((e) => e.map((ei, j) => j !== i ? ei : { ...ei, abschnitte: ei.abschnitte.filter((_, b) => b !== a) })); }
  function abschnittPatch(i, a, key, val) {
    setEinheiten((e) => e.map((ei, j) => j !== i ? ei : { ...ei, abschnitte: ei.abschnitte.map((ab, b) => b !== a ? ab : { ...ab, [key]: val }) }));
  }

  function übungHinzu(i, a, name, id) {
    setEinheiten((e) => e.map((ei, j) => j !== i ? ei : { ...ei, abschnitte: ei.abschnitte.map((ab, b) => b !== a ? ab : { ...ab, übungen: [...ab.übungen, { name, id, sätze: 3, wdh: "10–12", gewicht: "", pause: "60s" }] }) }));
  }
  function übungWeg(i, a, k) {
    setEinheiten((e) => e.map((ei, j) => j !== i ? ei : { ...ei, abschnitte: ei.abschnitte.map((ab, b) => b !== a ? ab : { ...ab, übungen: ab.übungen.filter((_, l) => l !== k) }) }));
  }
  function übungPatch(i, a, k, key, val) {
    setEinheiten((e) => e.map((ei, j) => j !== i ? ei : { ...ei, abschnitte: ei.abschnitte.map((ab, b) => b !== a ? ab : { ...ab, übungen: ab.übungen.map((ü, l) => l !== k ? ü : { ...ü, [key]: val }) }) }));
  }
  function hoch(i, a, k) {
    if (k === 0) return;
    setEinheiten((e) => e.map((ei, j) => j !== i ? ei : { ...ei, abschnitte: ei.abschnitte.map((ab, b) => { if (b !== a) return ab; const ü = [...ab.übungen]; [ü[k-1], ü[k]] = [ü[k], ü[k-1]]; return { ...ab, übungen: ü }; }) }));
  }
  function runter(i, a, k) {
    setEinheiten((e) => e.map((ei, j) => j !== i ? ei : { ...ei, abschnitte: ei.abschnitte.map((ab, b) => { if (b !== a || k >= ab.übungen.length - 1) return ab; const ü = [...ab.übungen]; [ü[k], ü[k+1]] = [ü[k+1], ü[k]]; return { ...ab, übungen: ü }; }) }));
  }

  async function speichern() {
    setSpeichert(true); setStatus("");
    try { await post(`/api/client/${klientId}/plan`, { einheiten }); onGespeichert({ einheiten }); setStatus("✓ Gespeichert"); }
    catch (e) { setStatus(`Fehler: ${e.message}`); }
    finally { setSpeichert(false); }
  }

  async function pushFirestore() {
    setSpeichert(true); setStatus("");
    try {
      // Lokal speichern, dann explizit nach Firestore (braucht FIREBASE_UID in client.env/.env).
      await post(`/api/client/${klientId}/plan`, { einheiten });
      onGespeichert({ einheiten });
      const res = await fetch(`/k/${klientId}/plan/push`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.ok === false) {
        const msg = body.error || `${res.status}`;
        throw new Error(msg);
      }
      const n = (body.written || []).length;
      setStatus(`✓ Firestore: ${n} Routine${n === 1 ? "" : "n"}`);
    } catch (e) {
      setStatus(`Push fehlgeschlagen: ${e.message}`);
    } finally {
      setSpeichert(false);
    }
  }

  return (
    <div className="plan-editor">
      <div className="plan-kopf">
        <h3>Trainingsplan</h3>
        <div className="plan-aktionen">
          {status && <span className="plan-status">{status}</span>}
          <WgerRoutineImport klientId={klientId} onImport={routineImportieren} />
          <button type="button" onClick={einheitHinzu}>+ Einheit</button>
          <button type="button" onClick={speichern} disabled={speichert}>
            {speichert ? "…" : "Speichern"}
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={pushFirestore}
            disabled={speichert}
            title="Speichert lokal und spiegelt nach Firestore. UID: client.env FIREBASE_UID, sonst client.json"
          >
            {speichert ? "Pushe…" : "Push Firestore"}
          </button>
        </div>
      </div>
      {einheiten.length === 0 && <div className="leer-karte"><p>Noch kein Plan. Einheit hinzufügen oder wger-Routine importieren.</p></div>}
      <div className="einheiten-liste">
        {einheiten.map((einheit, i) => (
          <div key={i} className="einheit-karte">
            <div className="einheit-kopf">
              <input className="einheit-name" value={einheit.name} onChange={(e) => einheitPatch(i, "name", e.target.value)} placeholder="Name (z.B. A · Push · Beine)" />
              <select className="einheit-frequenz" value={einheit.frequenz || "weekly-1"} onChange={(e) => einheitPatch(i, "frequenz", e.target.value)} title="Frequenz-Vorgabe (wird als Habit gespiegelt)">
                {FREQUENZEN.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
              <button type="button" className="btn-abschnitt-hinzu" onClick={() => abschnittHinzu(i)}>+ Abschnitt</button>
              <button type="button" className="btn-entfernen" onClick={() => einheitWeg(i)}>✕</button>
            </div>
            <div className="abschnitte-liste">
              {einheit.abschnitte.map((ab, a) => (
                <div key={a} className="abschnitt-block">
                  <div className="abschnitt-kopf">
                    <input className="abschnitt-name" value={ab.name} onChange={(e) => abschnittPatch(i, a, "name", e.target.value)} placeholder="Abschnitt (z.B. Krafttraining, HIIT Finisher)" />
                    <input className="abschnitt-dauer" value={ab.dauer} onChange={(e) => abschnittPatch(i, a, "dauer", e.target.value)} placeholder="Dauer" title="Dauer (z.B. 40 min)" />
                    <label className="hit-toggle">
                      <input type="checkbox" checked={!!ab.hit} onChange={(e) => abschnittPatch(i, a, "hit", e.target.checked)} /> HIT
                    </label>
                    {einheit.abschnitte.length > 1 && <button type="button" className="btn-entfernen-klein" onClick={() => abschnittWeg(i, a)}>×</button>}
                  </div>
                  <div className="übungen-liste">
                    {ab.übungen.map((ü, k) => (
                      <div key={k} className="übung-zeile">
                        <div className="übung-reihenfolge">
                          <button type="button" onClick={() => hoch(i, a, k)} disabled={k === 0}>↑</button>
                          <button type="button" onClick={() => runter(i, a, k)} disabled={k === ab.übungen.length - 1}>↓</button>
                        </div>
                        <span className="übung-name">{ü.name}</span>
                        {!ab.hit && (
                          <div className="übung-volumen">
                            <input className="vol-input vol-sätze" type="number" min="1" value={ü.sätze ?? 3} onChange={(e) => übungPatch(i, a, k, "sätze", Number(e.target.value))} title="Sätze" />
                            <span className="vol-sep">×</span>
                            <input className="vol-input vol-wdh" value={ü.wdh ?? "10–12"} onChange={(e) => übungPatch(i, a, k, "wdh", e.target.value)} placeholder="Wdh" />
                            <input className="vol-input vol-gewicht" value={ü.gewicht ?? ""} onChange={(e) => übungPatch(i, a, k, "gewicht", e.target.value)} placeholder="kg" />
                            <input className="vol-input vol-pause" value={ü.pause ?? "60s"} onChange={(e) => übungPatch(i, a, k, "pause", e.target.value)} placeholder="Pause" />
                          </div>
                        )}
                        <button type="button" className="btn-entfernen-klein" onClick={() => übungWeg(i, a, k)}>×</button>
                      </div>
                    ))}
                  </div>
                  <ÜbungsSuche onHinzufügen={(name, id) => übungHinzu(i, a, name, id)} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
