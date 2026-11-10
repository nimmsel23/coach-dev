import { useEffect, useState } from "react";
import { api, post, ENTSPANNUNGS_TYPEN } from "./api.js";

export function EntspannungsEditor({ klientId }) {
  const [sessions, setSessions] = useState(null);
  const [typ, setTyp]           = useState("Meditation");
  const [dauer, setDauer]       = useState("");
  const [qualität, setQualität] = useState("");
  const [notizen, setNotizen]   = useState("");
  const [status, setStatus]     = useState("");
  const [speichert, setSpeichert] = useState(false);

  const lade = () =>
    api(`/k/${klientId}/relaxation/session/list?limit=20`)
      .then((d) => setSessions(d?.sessions || d?.entries || []))
      .catch(() => setSessions([]));

  useEffect(() => { if (klientId) lade(); }, [klientId]);

  async function hinzufügen() {
    const today = new Date().toISOString().slice(0, 10);
    setSpeichert(true); setStatus("");
    try {
      await post(`/k/${klientId}/relaxation/session`, {
        date: today, type: typ,
        duration_min: dauer ? Number(dauer) : null,
        quality:      qualität ? Number(qualität) : null,
        notes:        notizen,
      });
      setDauer(""); setQualität(""); setNotizen("");
      setStatus("✓ Gespeichert");
      await lade();
    } catch (e) { setStatus(`Fehler: ${e.message}`); }
    finally { setSpeichert(false); }
  }

  return (
    <div className="plan-editor entspannung-editor">
      <div className="plan-kopf">
        <h3>Entspannung</h3>
        {status && <span className="plan-status">{status}</span>}
      </div>
      <div className="entspannung-form">
        <select className="entspannung-typ" value={typ} onChange={(e) => setTyp(e.target.value)}>
          {ENTSPANNUNGS_TYPEN.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <input className="entspannung-dauer" type="number" value={dauer} onChange={(e) => setDauer(e.target.value)} placeholder="Dauer (min)" min="1" />
        <input className="entspannung-qual" type="number" value={qualität} onChange={(e) => setQualität(e.target.value)} placeholder="Qualität 1–10" min="1" max="10" />
        <input className="entspannung-notiz" value={notizen} onChange={(e) => setNotizen(e.target.value)} placeholder="Notizen…" />
        <button type="button" className="btn-primary" onClick={hinzufügen} disabled={speichert}>{speichert ? "…" : "Hinzufügen"}</button>
      </div>
      {sessions === null ? (
        <div className="leer-karte"><p>Lädt…</p></div>
      ) : sessions.length === 0 ? (
        <div className="leer-karte"><p>Noch keine Entspannungs-Sessions für diesen Klienten.</p></div>
      ) : (
        <div className="entspannung-liste">
          {sessions.map((s, i) => (
            <div key={i} className="entspannung-eintrag">
              <span className="entspannung-datum">{s.date}</span>
              <span className="entspannung-typ-badge">{s.type}</span>
              {s.duration_min != null && <span className="entspannung-pill">{s.duration_min} min</span>}
              {s.quality != null && <span className="entspannung-pill">Q {s.quality}/10</span>}
              {s.notes && <span className="entspannung-notiz-text">{s.notes}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
