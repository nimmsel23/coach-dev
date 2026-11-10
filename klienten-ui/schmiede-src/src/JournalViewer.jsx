import { useEffect, useState } from "react";
import { api, post } from "./api.js";

export function JournalViewer({ klientId }) {
  const [eintraege, setEintraege]   = useState(null);
  const [kommentare, setKommentare] = useState({});
  const [gespeichert, setGespeichert] = useState({});

  useEffect(() => {
    if (!klientId) return;
    setEintraege(null);
    const bis = new Date().toISOString().slice(0, 10);
    const von = new Date(Date.now() - 60 * 86400 * 1000).toISOString().slice(0, 10);
    Promise.all([
      api(`/k/${klientId}/journal/entries?from=${von}&to=${bis}`).catch(() => ({ entries: [] })),
      api(`/k/${klientId}/relaxation/session/list?limit=60`).catch(() => ({ sessions: [] })),
    ]).then(([jd, rd]) => {
      const map = {};
      (jd?.entries || []).forEach((e) => { map[e.date] = e; });
      (rd?.sessions || []).forEach((s) => {
        if (!map[s.date]) map[s.date] = { date: s.date };
        if (!map[s.date].relaxation) map[s.date].relaxation = [];
        map[s.date].relaxation.push(s);
      });
      const items = Object.values(map).sort((a, b) => b.date.localeCompare(a.date));
      setEintraege(items);
      const k = {};
      items.forEach((e) => { k[e.date] = e.coachComment || ""; });
      setKommentare(k);
    });
  }, [klientId]);

  async function kommentarSpeichern(date) {
    try {
      await post(`/api/client/${klientId}/journal/entry`, { date, coachComment: kommentare[date] || "" });
      setGespeichert((s) => ({ ...s, [date]: true }));
      setTimeout(() => setGespeichert((s) => ({ ...s, [date]: false })), 2000);
    } catch {}
  }

  if (eintraege === null) return (
    <div className="plan-editor journal-viewer">
      <div className="plan-kopf"><h3>Journal</h3></div>
      <div className="leer-karte"><p>Lädt…</p></div>
    </div>
  );

  return (
    <div className="plan-editor journal-viewer">
      <div className="plan-kopf">
        <h3>Journal</h3>
        <span className="plan-muted">{eintraege.length} Einträge (60 Tage)</span>
      </div>
      {eintraege.length === 0 ? (
        <div className="leer-karte"><p>Noch keine Einträge vom Klienten.</p></div>
      ) : (
        <div className="journal-liste">
          {eintraege.map((e) => (
            <div key={e.date} className="journal-eintrag">
              <div className="journal-meta">
                <span className="journal-datum">{e.date}</span>
                {e.mood   != null && <span className="journal-pill">Stimmung {e.mood}/10</span>}
                {e.energy != null && <span className="journal-pill">Energie {e.energy}/10</span>}
              </div>
              {e.text     && <p className="journal-text">{e.text}</p>}
              {e.win      && <p className="journal-win">🏆 {e.win}</p>}
              {e.struggle && <p className="journal-struggle">💬 {e.struggle}</p>}
              {e.relaxation?.length > 0 && (
                <div className="journal-relaxation">
                  {e.relaxation.map((s, i) => (
                    <span key={i} className="journal-relaxation-item">
                      {s.type}{s.duration_min ? ` · ${s.duration_min} min` : ""}{s.quality ? ` · Q ${s.quality}/10` : ""}{s.notes ? ` · ${s.notes}` : ""}
                    </span>
                  ))}
                </div>
              )}
              <div className="journal-kommentar-wrap">
                <textarea className="journal-kommentar" rows={2} placeholder="Coach-Kommentar…"
                  value={kommentare[e.date] || ""}
                  onChange={(ev) => setKommentare((k) => ({ ...k, [e.date]: ev.target.value }))} />
                <button type="button" className={`journal-kommentar-btn${gespeichert[e.date] ? " gespeichert" : ""}`}
                  onClick={() => kommentarSpeichern(e.date)}>
                  {gespeichert[e.date] ? "✓" : "Senden"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
