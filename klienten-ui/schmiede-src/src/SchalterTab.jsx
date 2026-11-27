import { useEffect, useState } from "react";
import { getClientEnv, setClientEnv } from "./api.js";

// Regelbare client.env-Schalter (Grundsatz Klienten/AGENTS.md): Backend liefert die
// Liste (coach_client_env.SETTINGS), neue Schalter erscheinen hier automatisch.

function fmt(ts) {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return ts;
  }
}

function Feld({ s, wert, onChange }) {
  if (s.type === "bool") {
    return (
      <label className="schalter-zeile">
        <input type="checkbox" checked={wert === "1"} onChange={(e) => onChange(e.target.checked ? "1" : "0")} />
        <span>{s.label}</span>
      </label>
    );
  }
  return (
    <label className="schalter-zeile">
      <span>{s.label}</span>
      <input
        type={s.type === "date" ? "date" : s.type === "int" ? "number" : "text"}
        min={s.type === "int" ? 1 : undefined}
        value={wert}
        placeholder={s.default || "leer"}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

export function SchalterTab({ klientId }) {
  const [view, setView] = useState(null);
  const [werte, setWerte] = useState({});
  const [status, setStatus] = useState("");
  const [speichert, setSpeichert] = useState(false);

  function übernehmen(v) {
    setView(v);
    setWerte(Object.fromEntries((v?.settings || []).map((s) => [s.key, s.value || ""])));
  }

  useEffect(() => {
    if (!klientId) return;
    setStatus("");
    getClientEnv(klientId).then(übernehmen).catch((e) => setStatus(`Fehler: ${e.message}`));
  }, [klientId]);

  async function speichern() {
    const geändert = Object.fromEntries(
      (view?.settings || []).filter((s) => (werte[s.key] ?? "") !== (s.value || "")).map((s) => [s.key, werte[s.key] ?? ""]),
    );
    if (!Object.keys(geändert).length) return setStatus("Nichts geändert");
    setSpeichert(true);
    setStatus("");
    try {
      übernehmen(await setClientEnv(klientId, geändert));
      setStatus("✓ Gespeichert");
    } catch (e) {
      setStatus(`Fehler: ${e.message}`);
    } finally {
      setSpeichert(false);
    }
  }

  if (!view) return <div className="leer-karte"><p>{status || "Lädt…"}</p></div>;
  const st = view.frame?.state;
  const timer = view.timer;

  return (
    <div className="plan-editor schalter-tab">
      <div className="plan-kopf">
        <h3>Schalter</h3>
        <div className="plan-aktionen">
          {status && <span className="plan-status">{status}</span>}
          <button type="button" className="btn-primary" onClick={speichern} disabled={speichert}>
            {speichert ? "Speichere…" : "Speichern"}
          </button>
        </div>
      </div>

      <div className="habit-block-label">Frame-Map-Interview (AlphaOS Ch. 32)</div>
      {view.settings.filter((s) => s.group === "frame").map((s) => (
        <div key={s.key} className="schalter-feld">
          <Feld s={s} wert={werte[s.key] ?? ""} onChange={(v) => setWerte((w) => ({ ...w, [s.key]: v }))} />
          <small>{s.help} <code>{s.key}</code></small>
        </div>
      ))}

      <div className="leer-karte schalter-status">
        {st ? (
          <p>
            Stand: {st.active ? "läuft" : "nicht gestartet"} · Domain <strong>{st.domain || "—"}</strong> · Frage{" "}
            {st.question_no}/{st.questions_total} · zuletzt gefragt {fmt(st.last_prompt_sent_at)}
            {st.paused_until ? ` · Pause bis ${st.paused_until}` : ""}
          </p>
        ) : (
          <p>Kein frame_interview.json im Workspace.</p>
        )}
        {timer && (
          <p>
            Timer <code>{timer.unit}</code>: {timer.enabled === "enabled" ? "aktiv" : "deaktiviert"} ({timer.active}) —
            gilt für alle Klienten, wird nur vom Coach per systemctl geschaltet.
          </p>
        )}
      </div>
    </div>
  );
}
