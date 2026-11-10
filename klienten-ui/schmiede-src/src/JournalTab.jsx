import { useEffect, useState, useMemo } from "react";
import { api, saveCoachingNote } from "./api.js";

function LogsTimeline({ logs, onCoachingNoteClick }) {
  const sorted = useMemo(() => {
    return (logs || [])
      .filter((l) => l && l.date)
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [logs]);

  const logIcon = (type) => {
    const icons = {
      workout: "🏋️",
      habit: "☑️",
      journal: "📓",
      nutrition: "🍽️",
      relaxation: "🧘",
      voice: "🎤",
    };
    return icons[type] || "📝";
  };

  const logLabel = (type) => {
    const labels = {
      workout: "Workout",
      habit: "Habit",
      journal: "Journal",
      nutrition: "Ernährung",
      relaxation: "Entspannung",
      voice: "Voice Session",
    };
    return labels[type] || type;
  };

  return (
    <div className="journal-timeline">
      {sorted.length === 0 ? (
        <div className="leer-karte"><p>Keine Logs.</p></div>
      ) : (
        sorted.map((log, i) => (
          <div key={`${log.type}:${log.date}:${i}`} className="timeline-entry">
            <div className="timeline-header">
              <span className="timeline-icon">{logIcon(log.type)}</span>
              <span className="timeline-label">{logLabel(log.type)}</span>
              <span className="timeline-date">{log.date}</span>
            </div>
            {log.title && <div className="timeline-title">{log.title}</div>}
            {log.summary && <div className="timeline-summary">{log.summary}</div>}
            <div className="timeline-footer">
              <button
                type="button"
                className="btn-coaching-note"
                onClick={() => onCoachingNoteClick(log.date)}
                title="Coaching-Feedback hinzufügen"
              >
                💬 Feedback
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function CoachingNoteModal({ open, date, klientId, onClose, onSave }) {
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !date || !klientId) { setNote(""); return; }
    setLoading(true);
    fetch(`/k/${klientId}/coaching-note?date=${date}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.ok) setNote(d.note || ""); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, date, klientId]);

  async function handleSave() {
    if (!date) return;
    setSaving(true);
    try {
      await onSave(date, note);
      setNote("");
      onClose();
    } catch (e) {
      alert("Fehler beim Speichern: " + e.message);
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="bg-white rounded-lg shadow-lg max-w-md w-full p-6">
        <h3 className="text-lg font-bold mb-4">Feedback für {date}</h3>
        {loading ? (
          <div className="text-gray-400 text-sm py-4 text-center">Lade vorhandenes Feedback…</div>
        ) : (
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Dein Coaching-Feedback..."
            className="w-full p-3 border rounded-lg mb-4 h-32 font-sm"
          />
        )}
        <div className="flex gap-2 justify-end">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Abbrechen
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={handleSave}
            disabled={saving || loading}
          >
            {saving ? "Speichert…" : "Speichern"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function JournalTab({ klientId }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [coachingNoteDate, setCoachingNoteDate] = useState(null);
  const [coachingNoteModal, setCoachingNoteModal] = useState(false);

  useEffect(() => {
    if (!klientId) return;
    async function load() {
      setLoading(true);
      const allLogs = [];
      try {
        // Workouts
        const workouts = await api(`/k/${klientId}/workout/logs?days=90`)
          .then((d) => (d?.workouts || []).map((w) => ({
            type: "workout",
            date: w.date,
            title: w.block || "Session",
            summary: w.exercises?.length ? `${w.exercises.length} Übungen` : "",
          })))
          .catch(() => []);
        allLogs.push(...workouts);

        // Habit Records
        const habits = await api(`/k/${klientId}/habits/logs?days=90`)
          .then((d) => {
            const days = {};
            (d?.habits || []).forEach((h) => {
              (h.records || []).forEach((r) => {
                if (!days[r.date]) days[r.date] = [];
                days[r.date].push(h.name);
              });
            });
            return Object.entries(days).map(([date, names]) => ({
              type: "habit",
              date,
              title: "Habits",
              summary: names.join(", "),
            }));
          })
          .catch(() => []);
        allLogs.push(...habits);

        // Journal Entries
        const journal = await api(`/k/${klientId}/journal/list?limit=90`)
          .then((d) => (d?.entries || []).map((e) => ({
            type: "journal",
            date: e.date,
            title: e.title || "Journal-Eintrag",
            summary: e.content ? e.content.slice(0, 100) + "…" : "",
          })))
          .catch(() => []);
        allLogs.push(...journal);

        setLogs(allLogs);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [klientId]);

  async function handleCoachingNoteSave(date, note) {
    try {
      await saveCoachingNote(klientId, date, note);
      setCoachingNoteModal(false);
    } catch (e) {
      throw e;
    }
  }

  async function openCoachingNote(date) {
    setCoachingNoteDate(date);
    setCoachingNoteModal(true);
  }

  return (
    <div className="journal-tab">
      {loading ? (
        <div className="leer-karte"><p>Lädt…</p></div>
      ) : (
        <>
          <LogsTimeline logs={logs} onCoachingNoteClick={openCoachingNote} />
          <CoachingNoteModal
            open={coachingNoteModal}
            date={coachingNoteDate}
            klientId={klientId}
            onClose={() => setCoachingNoteModal(false)}
            onSave={handleCoachingNoteSave}
          />
        </>
      )}
    </div>
  );
}
