import { useCallback, useEffect, useState } from "react";
import { getCoachingNote, listCoachingNotes, saveCoachingNote } from "./api.js";

function heuteIso() {
  return new Date().toISOString().slice(0, 10);
}

function formatDatum(iso) {
  try {
    return new Date(`${iso}T12:00:00`).toLocaleDateString("de-DE", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export function NotizenTab({ klientId }) {
  const [datum, setDatum] = useState(heuteIso);
  const [text, setText] = useState("");
  const [liste, setListe] = useState([]);
  const [status, setStatus] = useState("");
  const [lädt, setLädt] = useState(true);
  const [speichert, setSpeichert] = useState(false);

  const ladeListe = useCallback(() => {
    if (!klientId) return;
    listCoachingNotes(klientId, 80)
      .then((d) => setListe(Array.isArray(d?.notes) ? d.notes : []))
      .catch(() => setListe([]));
  }, [klientId]);

  useEffect(() => {
    if (!klientId) return;
    setLädt(true);
    setStatus("");
    getCoachingNote(klientId, datum)
      .then((d) => setText(d?.note || ""))
      .catch(() => setText(""))
      .finally(() => setLädt(false));
  }, [klientId, datum]);

  useEffect(() => { ladeListe(); }, [ladeListe]);

  async function speichern() {
    setSpeichert(true);
    setStatus("");
    try {
      await saveCoachingNote(klientId, datum, text);
      setStatus("✓ Gespeichert");
      ladeListe();
    } catch (e) {
      setStatus(`Fehler: ${e.message}`);
    } finally {
      setSpeichert(false);
    }
  }

  function öffne(eintrag) {
    setDatum(eintrag.date);
    setText(eintrag.note || "");
    setStatus("");
  }

  return (
    <div className="plan-editor notizen-tab">
      <div className="plan-kopf">
        <h3>Notizen</h3>
        <div className="plan-aktionen">
          {status && <span className="plan-status">{status}</span>}
          <button type="button" className="btn-primary" onClick={speichern} disabled={speichert || lädt}>
            {speichert ? "Speichere…" : "Speichern"}
          </button>
        </div>
      </div>

      <label className="notizen-datum-feld">
        <span>Datum</span>
        <input
          type="date"
          className="notizen-datum"
          value={datum}
          onChange={(e) => setDatum(e.target.value || heuteIso())}
        />
      </label>

      {lädt ? (
        <div className="leer-karte"><p>Lädt…</p></div>
      ) : (
        <textarea
          className="notizen-editor"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Coach-Notiz / Feedback / Protokoll…"
          rows={10}
        />
      )}

      <div className="notizen-liste">
        <div className="habit-block-label">Vorherige Einträge</div>
        {liste.length === 0 ? (
          <div className="leer-karte"><p>Noch keine Notizen.</p></div>
        ) : (
          liste.map((n) => (
            <button
              key={n.date}
              type="button"
              className={`notizen-eintrag${n.date === datum ? " aktiv" : ""}`}
              onClick={() => öffne(n)}
            >
              <strong>{formatDatum(n.date)}</strong>
              <span>{(n.note || "").trim() || "—"}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
