import { useEffect, useMemo, useState } from "react";
import { post, FARBEN, FREQUENZEN, toggleHabitRecord } from "./api.js";

function frequenzLabel(value) {
  return FREQUENZEN.find((f) => f.value === value)?.label || value || "";
}

function frequenzZiel(value) {
  if (value === "daily") return 7;
  const m = /^weekly-(\d)$/.exec(value || "");
  return m ? Number(m[1]) : 1;
}

function wochenStart(isoDatum) {
  const t = new Date(isoDatum);
  t.setDate(t.getDate() - ((t.getDay() + 6) % 7)); // Montag
  return t.toISOString().slice(0, 10);
}

export function HabitEditor({ klientId, habits: initialHabits, loggedHabits, plan, loggedWorkouts, onGespeichert }) {
  const [view, setView] = useState("logs"); // "logs" or "edit"
  const [habits, setHabits] = useState([]);
  const [status, setStatus] = useState("");
  const [speichert, setSpeichert] = useState(false);

  const enrichedLoggedHabits = useMemo(() => {
    return (loggedHabits || []).map((h) => ({
      ...h,
      hasRecord: (date) =>
        Array.isArray(h.records) &&
        h.records.some((r) => r.date === date && r.completion === "DONE"),
    }));
  }, [loggedHabits]);

  useEffect(() => { setHabits(initialHabits || []); }, [initialHabits, klientId]);

  const heute = new Date().toISOString().slice(0, 10);
  const wStart = wochenStart(heute);

  // Trainingsplan → abgeleitete Habits im habits-dev-Interface:
  // { uuid, name, icon, source, frequency, records[{date, completion}], hasRecord(date) }
  // Records entstehen virtuell aus den Workout-Logs (Auto-Check-in), nichts wird doppelt gespeichert.
  const planEinheiten = useMemo(
    () => (plan?.einheiten || []).filter((e) => (e.name || "").trim()),
    [plan]
  );

  const planHabits = useMemo(() => {
    function matchtEinheit(workout, einheit) {
      if (planEinheiten.length === 1) return true;
      const wName = String(workout.block || workout.name || workout.title || "").trim().toLowerCase();
      return wName === einheit.name.trim().toLowerCase();
    }
    return planEinheiten.map((einheit) => {
      const records = (loggedWorkouts || [])
        .filter((w) => w.date && matchtEinheit(w, einheit))
        .map((w) => ({ date: w.date, completion: "DONE" }));
      return {
        uuid: `plan:${einheit.name.trim().toLowerCase().replace(/[^a-z0-9äöüß]+/g, "-").replace(/^-|-$/g, "")}`,
        name: einheit.name,
        icon: "Dumbbell",
        source: "plan",
        frequency: einheit.frequenz || "weekly-1",
        records,
        hasRecord: (date) => records.some((r) => r.date === date && r.completion === "DONE"),
      };
    });
  }, [planEinheiten, loggedWorkouts]);

  function hinzu() {
    const id = `habit-${Date.now()}`;
    setHabits((h) => [...h, { id, name: "", frequency: "daily", color: FARBEN[h.length % FARBEN.length], type: "boolean" }]);
  }
  function weg(id)             { setHabits((h) => h.filter((x) => x.id !== id)); }
  function patch(id, key, val) { setHabits((h) => h.map((x) => x.id === id ? { ...x, [key]: val } : x)); }

  async function speichern() {
    setSpeichert(true); setStatus("");
    try { await post(`/api/client/${klientId}/habits/config`, { habits }); onGespeichert(habits); setStatus("✓ Gespeichert"); }
    catch (e) { setStatus(`Fehler: ${e.message}`); }
    finally { setSpeichert(false); }
  }

  async function toggle(habit) {
    try {
      await toggleHabitRecord(klientId, habit.uuid, heute);
      window.location.reload();
    } catch (e) { alert("Fehler: " + e.message); }
  }

  return (
    <div className="plan-editor habit-editor">
      <div className="plan-kopf">
        <h3>Habits</h3>
        <div className="plan-aktionen">
          <button type="button" className={view === 'logs' ? 'aktiv' : ''} onClick={() => setView("logs")}>Logs</button>
          <button type="button" className={view === 'edit' ? 'aktiv' : ''} onClick={() => setView("edit")}>Bearbeiten</button>
        </div>
      </div>

      {view === "logs" ? (
        <>
          {planHabits.length > 0 && (
            <div className="habit-plan-block">
              <div className="habit-block-label">Trainingsplan</div>
              {planHabits.map((h) => {
                const ziel = frequenzZiel(h.frequency);
                const zähler = h.records.filter((r) => r.date >= wStart && r.date <= heute).length;
                return (
                  <div key={h.uuid} className="habit-log-zeile habit-plan-zeile">
                    <span>{h.name}</span>
                    <span className="habit-frequenz-label">{frequenzLabel(h.frequency)}</span>
                    <span className={`habit-wochen-zähler${zähler >= ziel ? " voll" : ""}`}>{zähler}/{ziel} diese Woche</span>
                    <span title="Wird automatisch abgehakt, wenn heute ein passendes Workout geloggt wurde">
                      {h.hasRecord(heute) ? "✅" : "⬜"}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          <div className="habit-logs-liste">
            {planHabits.length > 0 && enrichedLoggedHabits.length > 0 && (
              <div className="habit-block-label">Weitere Habits</div>
            )}
            {enrichedLoggedHabits.map(h => (
              <div key={h.uuid} className="habit-log-zeile">
                <span>{h.name}</span>
                <button type="button" onClick={() => toggle(h)}>
                  {h.hasRecord(heute) ? "✅" : "⬜"}
                </button>
              </div>
            ))}
            {planEinheiten.length === 0 && enrichedLoggedHabits.length === 0 && (
              <div className="leer-karte"><p>Keine Habits. Trainingsplan anlegen oder Habits unter „Bearbeiten" definieren.</p></div>
            )}
          </div>
        </>
      ) : (
        <div className="habit-edit-modus">
          {planEinheiten.length > 0 && (
            <p className="habit-plan-hinweis">
              Trainings-Habits kommen aus dem Trainingsplan (eine Zeile pro Einheit, Frequenz dort einstellbar) und werden beim Workout-Log automatisch abgehakt.
            </p>
          )}
          {status && <span className="plan-status">{status}</span>}
          <button type="button" onClick={hinzu}>+ Habit</button>
          <button type="button" className="btn-primary" onClick={speichern} disabled={speichert}>
            {speichert ? "Speichere…" : "Speichern"}
          </button>
          <div className="habit-defs-liste">
            {habits.map((h) => (
              <div key={h.id} className="habit-def-zeile">
                <input className="habit-def-name" value={h.name} onChange={(e) => patch(h.id, "name", e.target.value)} placeholder="Habit-Name" />
                <select className="habit-def-frequenz" value={h.frequency || "daily"} onChange={(e) => patch(h.id, "frequency", e.target.value)}>
                  {FREQUENZEN.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
                <button type="button" className="btn-entfernen" onClick={() => weg(h.id)}>✕</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
