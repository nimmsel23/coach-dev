import { useEffect, useMemo, useState } from "react";
import { api, post } from "./api.js";
import { BodyMapPair } from "./BodyMap.jsx";

const muscleCache = new Map();

async function resolveExerciseMuscles(name) {
  const key = String(name || "").trim().toLowerCase();
  if (!key) return { name, primaryMuscles: [], secondaryMuscles: [] };
  if (muscleCache.has(key)) return muscleCache.get(key);

  const empty = { name, primaryMuscles: [], secondaryMuscles: [] };
  try {
    const d = await api(`/exercises/search?q=${encodeURIComponent(name)}&limit=4`);
    const hit = (d?.results || []).find((r) => {
      const dn = String(r.display_name || r.name || "").toLowerCase();
      return dn === key || dn.includes(key) || key.includes(dn);
    }) || (d?.results || [])[0];
    const resolved = {
      name,
      primaryMuscles: hit?.primary_muscles || hit?.primaryMuscles || [],
      secondaryMuscles: hit?.secondary_muscles || hit?.secondaryMuscles || [],
    };
    muscleCache.set(key, resolved);
    return resolved;
  } catch {
    muscleCache.set(key, empty);
    return empty;
  }
}

function collectNames(einheit, workouts) {
  const names = [];
  for (const a of einheit?.abschnitte || []) {
    for (const ü of a.übungen || []) {
      if (ü?.name) names.push(ü.name);
    }
  }
  for (const w of (workouts || []).slice(0, 5)) {
    for (const name of w.exerciseNames || []) {
      if (name) names.push(name);
    }
    for (const ex of w.exercises || []) {
      if (ex?.name) names.push(ex.name);
      else if (typeof ex === "string") names.push(ex);
    }
  }
  return [...new Set(names.map((n) => String(n).trim()).filter(Boolean))];
}

function workoutTitle(w) {
  return w?.block || w?.name || w?.trainingsart || "Training";
}

function workoutDateLabel(w) {
  const raw = w?.date || String(w?.finished_at || "").slice(0, 10) || String(w?.id || "").replace(/^fitness-session:/, "").slice(0, 10);
  if (!raw || !/^\d{4}-\d{2}-\d{2}/.test(raw)) return "—";
  try {
    return new Date(`${raw.slice(0, 10)}T12:00:00`).toLocaleDateString("de-DE", {
      weekday: "short", day: "numeric", month: "short",
    });
  } catch {
    return raw.slice(0, 10);
  }
}

export function HeuteTab({ klientId, loggedWorkouts }) {
  const [data, setData] = useState(null);
  const [logging, setLogging] = useState(false);
  const [done, setDone] = useState(false);
  const [block, setBlock] = useState("");
  const [notes, setNotes] = useState("");
  const [effort, setEffort] = useState(3);
  const [selectedEinheit, setSelectedEinheit] = useState(null);
  const [mapExercises, setMapExercises] = useState([]);

  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    if (!klientId) return;
    api(`/api/client/${klientId}/plan/today`).then((d) => {
      setData(d);
      if (d.next) {
        setBlock(d.next.name || "");
        setSelectedEinheit(d.next);
      }
    }).catch(() => setData({ ok: false }));
  }, [klientId]);

  const nameKey = useMemo(
    () => collectNames(selectedEinheit, loggedWorkouts).join("|"),
    [selectedEinheit, loggedWorkouts],
  );

  useEffect(() => {
    let cancelled = false;
    const names = nameKey ? nameKey.split("|").filter(Boolean) : [];
    if (!names.length) {
      setMapExercises([]);
      return undefined;
    }
    (async () => {
      const resolved = await Promise.all(names.map(resolveExerciseMuscles));
      if (!cancelled) setMapExercises(resolved);
    })();
    return () => { cancelled = true; };
  }, [nameKey]);

  async function logSession() {
    setLogging(true);
    try {
      const einheit = data?.einheiten?.find((e) => e.name === block) || selectedEinheit;
      const exercises = (einheit?.abschnitte || []).flatMap((a) =>
        (a.übungen || []).map((ü) => ({ name: ü.name, sätze: ü.sätze, wdh: ü.wdh, gewicht: ü.gewicht })),
      );
      await post(`/api/client/${klientId}/session`, { date: today, block, notes, effort, exercises, status: "logged" });
      setDone(true);
      setData((prev) => ({ ...prev, todayDone: true }));
    } catch (e) {
      alert(`Fehler: ${e.message}`);
    } finally {
      setLogging(false);
    }
  }

  if (!data) return <div className="leer-karte"><p>Lädt…</p></div>;

  const einheiten = data.einheiten || [];

  return (
    <div className="heute-tab">
      <div className="heute-datum">{new Date().toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" })}</div>

      <BodyMapPair exercises={mapExercises} />

      <div className="heute-workouts">
        <h3>Letzte Workouts</h3>
        {(loggedWorkouts || []).length === 0 && <div className="leer-karte text-sm"><p>Keine Workouts in den letzten 28 Tagen.</p></div>}
        {(loggedWorkouts || []).slice(0, 5).map((w) => {
          const names = w.exerciseNames || (w.exercises || []).map((ex) => ex?.name || ex).filter(Boolean);
          const minutes = w.duration || (w.durationSeconds ? Math.round(w.durationSeconds / 60) : null);
          return (
            <div key={w.id || `${w.date}-${workoutTitle(w)}`} className="workout-log-zeile">
              <div className="workout-log-kopf">
                <strong>{workoutTitle(w)}</strong>
                <span>{workoutDateLabel(w)}</span>
              </div>
              <div className="workout-log-meta">
                {w.trainingsart && w.trainingsart !== workoutTitle(w) && <span>{w.trainingsart}</span>}
                {minutes ? <span>{minutes} min</span> : null}
                {w.exerciseCount != null ? <span>{w.exerciseCount} Übungen</span> : null}
                {w.completedSetCount != null ? <span>{w.completedSetCount} Sätze</span> : null}
              </div>
              {w.location && <div className="workout-log-ort">{w.location}</div>}
              {names.length > 0 && (
                <div className="workout-log-uebungen">{names.slice(0, 6).join(" · ")}{names.length > 6 ? " …" : ""}</div>
              )}
            </div>
          );
        })}
      </div>

      {data.todayDone && !done ? (
        <div className="heute-erledigt"><span className="heute-check">✓</span><span>Session heute bereits geloggt</span></div>
      ) : done ? (
        <div className="heute-erledigt"><span className="heute-check">✓</span><span>Session geloggt!</span></div>
      ) : (
        <>
          {einheiten.length === 0 ? (
            <div className="leer-karte"><p>Kein Trainingsplan vorhanden. Plan zuerst anlegen.</p></div>
          ) : (
            <div className="heute-plan">
              <div className="heute-section-label">Nächste Einheit</div>
              <div className="heute-einheit-tabs">
                {einheiten.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    className={`heute-einheit-btn${block === e.name ? " aktiv" : ""}`}
                    onClick={() => { setBlock(e.name); setSelectedEinheit(e); }}
                  >
                    {e.name}{e.hit && <span className="hit-badge">HIT</span>}
                  </button>
                ))}
              </div>
              {selectedEinheit && (
                <div className="heute-einheit-detail">
                  {(selectedEinheit.abschnitte || []).map((a, i) => (
                    <div key={i} className="heute-abschnitt">
                      <div className="heute-abschnitt-name">{a.name || `Block ${i + 1}`}</div>
                      {(a.übungen || []).map((ü, j) => (
                        <div key={j} className="heute-übung">
                          <span className="heute-übung-name">{ü.name}</span>
                          {(ü.sätze || ü.wdh) && (
                            <span className="heute-übung-vol">
                              {ü.sätze && `${ü.sätze}×`}
                              {ü.wdh && ü.wdh}
                              {ü.gewicht && ` @ ${ü.gewicht}kg`}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
              <div className="heute-log-form">
                <div className="heute-log-zeile">
                  <span className="heute-label">Anstrengung</span>
                  <div className="heute-effort">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button key={n} type="button" className={`heute-effort-dot${effort >= n ? " aktiv" : ""}`} onClick={() => setEffort(n)}>●</button>
                    ))}
                    <span className="heute-effort-label">{["", "leicht", "moderat", "mittel", "hart", "max"][effort]}</span>
                  </div>
                </div>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notizen zur Session (optional)" className="heute-notizen" rows={2} />
                <button type="button" className="btn-primary heute-done-btn" onClick={logSession} disabled={logging || !block}>
                  {logging ? "Wird geloggt…" : "✓ Session loggen"}
                </button>
              </div>
            </div>
          )}
        </>
      )}
      <div className="heute-stats">
        <div className="heute-stat"><span className="heute-stat-zahl">{data.sessionsTotal ?? "—"}</span><span className="heute-stat-label">Sessions gesamt</span></div>
        <div className="heute-stat"><span className="heute-stat-zahl">{einheiten.length}</span><span className="heute-stat-label">Einheiten im Plan</span></div>
      </div>
    </div>
  );
}
