import { useEffect, useState } from "react";
import { Calendar, dateFnsLocalizer } from "react-big-calendar";
import { format, parse, startOfWeek, getDay } from "date-fns";
import { de } from "date-fns/locale";
import { api } from "./api.js";

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: (d) => startOfWeek(d, { locale: de }),
  getDay,
  locales: { de },
});

export function SessionKalender({ klientId, loggedWorkouts }) {
  const [events, setEvents]       = useState([]);
  const [datum, setDatum]         = useState(new Date());
  const [ausgewählt, setAusgewählt] = useState(null);

  useEffect(() => {
    if (!klientId) return;
    
    function toEvent(s) {
      const day = s.date || String(s.finished_at || "").slice(0, 10) || String(s.id || "").replace(/^fitness-session:/, "").slice(0, 10);
      const title = s.block || s.name || s.trainingsart || "Training";
      return {
        title,
        start: new Date(`${day}T10:00:00`),
        end: new Date(`${day}T11:00:00`),
        resource: s,
      };
    }
    // First, map the passed-in loggedWorkouts (Fitness-Runtime unter ~/.aos)
    if (loggedWorkouts && loggedWorkouts.length > 0) {
      setEvents(loggedWorkouts.map(toEvent));
    } else {
      api(`/k/${klientId}/workout/logs?days=90`)
        .then((d) => setEvents((d?.workouts || []).map(toEvent)))
        .catch(() => setEvents([]));
    }
  }, [klientId, loggedWorkouts]);

  return (
    <div className="plan-editor session-kalender">
      <div className="plan-kopf">
        <h3>Kalender</h3>
        <span className="plan-muted">{events.length} Sessions</span>
      </div>
      {ausgewählt && (
        <div className="kalender-detail" style={{ background: "var(--clientforge-panel-strong)", padding: "12px", borderBottom: "1px solid var(--clientforge-line)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <strong>{ausgewählt.resource.date}</strong> · {ausgewählt.resource.block || "—"} 
              {ausgewählt.resource.duration ? ` (${ausgewählt.resource.duration} min)` : ""}
            </div>
            <button type="button" className="btn-entfernen-klein" onClick={() => setAusgewählt(null)}>×</button>
          </div>
          {ausgewählt.resource.location && <div style={{ fontSize: "0.85em", color: "var(--clientforge-muted)", marginTop: "4px" }}>📍 {ausgewählt.resource.location}</div>}
          <div style={{ fontSize: "0.85em", marginTop: "8px", display: "flex", gap: "12px" }}>
            {ausgewählt.resource.effort != null && <span>Effort: <strong style={{ color: "var(--clientforge-accent)" }}>{ausgewählt.resource.effort}/10</strong></span>}
            {ausgewählt.resource.exercises && <span>Übungen: <strong>{ausgewählt.resource.exercises.length}</strong></span>}
          </div>
        </div>
      )}
      <div className="kalender-wrap">
        <Calendar localizer={localizer} events={events} date={datum} onNavigate={setDatum}
          onSelectEvent={(ev) => setAusgewählt(ev)} views={["month", "week"]} defaultView="month"
          culture="de" style={{ height: 520 }}
          eventPropGetter={() => ({ style: { background: "var(--clientforge-accent)", borderColor: "var(--clientforge-accent)", color: "#fff", borderRadius: 4 } })}
          messages={{ next: "›", back: "‹", today: "Heute", month: "Monat", week: "Woche", day: "Tag" }}
        />
      </div>
    </div>
  );
}
