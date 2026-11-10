import { useEffect, useId, useMemo, useRef, useState } from "react";
import { api } from "./api.js";
import { PlanEditor } from "./PlanEditor.jsx";
import { HabitEditor } from "./HabitEditor.jsx";
import { FuelPlanEditor } from "./FuelEditor.jsx";
import { JournalTab } from "./JournalTab.jsx";
import { HeuteTab } from "./HeuteTab.jsx";
import { EntspannungsEditor } from "./EntspannungsEditor.jsx";
import { SessionKalender } from "./SessionKalender.jsx";
import { AppUpdatePanel } from "./AppUpdatePanel.jsx";
import { NotizenTab } from "./NotizenTab.jsx";
import "./clients.css";

const SCHMIEDE_TABS = [
  { id: "heute",       label: "Heute" },
  { id: "plan",        label: "Trainingsplan" },
  { id: "fuel",        label: "Ernährung" },
  { id: "habits",      label: "Habits" },
  { id: "notizen",     label: "Notizen" },
  { id: "journal",     label: "Journal" },
  { id: "entspannung", label: "Entspannung" },
  { id: "kalender",    label: "Kalender" },
];

function idAusUrl() {
  const m =
    window.location.pathname.match(/^\/schmiede\/([^/]+)/) ||
    window.location.pathname.match(/^\/clientforge\/([^/]+)/) ||
    window.location.pathname.match(/^\/k\/([^/]+)/) ||
    window.location.pathname.match(/^\/([A-Za-z0-9_-]+)\/?$/);
  return m && m[1] !== "assets" ? m[1] : "";
}

function KlientenSidebar({ klienten, ausgewähltId, onWähle, status, id, labelledBy }) {
  const [suche, setSuche] = useState("");
  const gefiltert = useMemo(() => {
    const q = suche.toLowerCase();
    return q ? klienten.filter((k) => `${k.id} ${k.name || ""}`.toLowerCase().includes(q)) : klienten;
  }, [klienten, suche]);

  return (
    <aside className="sidebar" id={id} aria-labelledby={labelledBy}>
      <div className="sidebar-kopf">
        <div className="sidebar-marke" aria-hidden="true">CF</div>
        <h1 id={labelledBy}>ClientForge</h1>
      </div>
      <label className="sidebar-suche-label">
        <span className="sr-only">Klient suchen</span>
        <input
          className="sidebar-suche"
          value={suche}
          onChange={(e) => setSuche(e.target.value)}
          placeholder="Klient suchen"
          autoComplete="off"
        />
      </label>
      <div className="sidebar-liste" role="listbox" aria-label="Klienten">
        {gefiltert.map((k) => (
          <button
            key={k.id}
            type="button"
            role="option"
            aria-selected={ausgewähltId === k.id}
            className={`sidebar-item${ausgewähltId === k.id ? " aktiv" : ""}`}
            onClick={() => onWähle(k.id)}
          >
            <strong>{k.name || k.id}</strong>
            <span>{k.id}</span>
          </button>
        ))}
        {gefiltert.length === 0 && <div className="sidebar-leer" role="status">Keine Klienten gefunden</div>}
      </div>
      <AppUpdatePanel />
      <div className="sidebar-status" role="status">{status}</div>
    </aside>
  );
}

function TabNav({ tabs, aktTab, onChange }) {
  const listRef = useRef(null);

  function onKeyDown(e) {
    const idx = tabs.findIndex((t) => t.id === aktTab);
    if (idx < 0) return;
    let next = idx;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (idx + 1) % tabs.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (idx - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    else return;
    e.preventDefault();
    onChange(tabs[next].id);
    const btn = listRef.current?.querySelector(`[data-tab="${tabs[next].id}"]`);
    btn?.focus();
  }

  return (
    <nav className="clientforge-tabs" role="tablist" aria-label="ClientForge-Bereiche" ref={listRef} onKeyDown={onKeyDown}>
      {tabs.map((t) => {
        const selected = aktTab === t.id;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            data-tab={t.id}
            id={`tab-${t.id}`}
            aria-selected={selected}
            aria-controls={`panel-${t.id}`}
            tabIndex={selected ? 0 : -1}
            className={`clientforge-tab${selected ? " aktiv" : ""}`}
            onClick={() => onChange(t.id)}
          >
            {t.label}
          </button>
        );
      })}
    </nav>
  );
}

export function ClientForgeApp() {
  const sidebarTitleId = useId();
  const [klienten, setKlienten] = useState([]);
  const [ausgewähltId, setAusgewähltId] = useState(idAusUrl);
  const [aktTab, setAktTab] = useState("plan");
  const [plan, setPlan] = useState(null);
  const [habits, setHabits] = useState(null);
  const [loggedHabits, setLoggedHabits] = useState(null);
  const [loggedWorkouts, setLoggedWorkouts] = useState(null);
  const [fuelPlan, setFuelPlan] = useState(null);
  const [statusText, setStatusText] = useState("Lädt…");
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    function onPop() { setAusgewähltId(idAusUrl()); }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    const current = idAusUrl();
    if (ausgewähltId && ausgewähltId !== current) history.pushState(null, "", `/schmiede/${ausgewähltId}/`);
    else if (!ausgewähltId && current) history.pushState(null, "", "/schmiede/");
  }, [ausgewähltId]);

  useEffect(() => {
    api("/api/clients")
      .then((d) => {
        setKlienten(Array.isArray(d?.clients) ? d.clients : []);
        setStatusText(d?.clients?.length ? `${d.clients.length} Klienten` : "Noch keine Klienten");
      })
      .catch((e) => setStatusText(`Fehler: ${e.message}`));
  }, []);

  useEffect(() => {
    if (!ausgewähltId) {
      setPlan(null); setHabits(null); setLoggedHabits(null); setLoggedWorkouts(null); setFuelPlan(null);
      return;
    }
    setPlan(null); setHabits(null); setLoggedHabits(null); setLoggedWorkouts(null); setFuelPlan(null);
    api(`/api/client/${ausgewähltId}/plan`).then((d) => setPlan(d?.data || { einheiten: [] })).catch(() => setPlan({ einheiten: [] }));
    api(`/api/client/${ausgewähltId}/habits/config`).then((d) => setHabits(Array.isArray(d?.habits) ? d.habits : [])).catch(() => setHabits([]));
    api(`/k/${ausgewähltId}/habits/logs?days=28`).then((d) => setLoggedHabits(Array.isArray(d?.habits) ? d.habits : [])).catch(() => setLoggedHabits([]));
    api(`/k/${ausgewähltId}/workout/logs?days=28`).then((d) => setLoggedWorkouts(Array.isArray(d?.workouts) ? d.workouts : [])).catch(() => setLoggedWorkouts([]));
    api(`/k/${ausgewähltId}/plan/fuel`).then((d) => setFuelPlan(d?.data || {})).catch(() => setFuelPlan({}));
  }, [ausgewähltId]);

  useEffect(() => {
    if (!navOpen) return;
    function onKey(e) { if (e.key === "Escape") setNavOpen(false); }
    document.addEventListener("keydown", onKey);
    document.body.classList.add("schmiede-nav-open");
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.classList.remove("schmiede-nav-open");
    };
  }, [navOpen]);

  const ausgewählt = useMemo(
    () => klienten.find((k) => k.id === ausgewähltId) || null,
    [klienten, ausgewähltId],
  );
  const basisLädt = plan === null || habits === null || loggedHabits === null || loggedWorkouts === null || fuelPlan === null;
  const skipLoadGate = ["kalender", "entspannung", "heute", "journal", "notizen"].includes(aktTab);

  function wähleKlient(id) {
    setAusgewähltId(id);
    setAktTab("plan");
    setNavOpen(false);
  }

  return (
    <div className={`app-shell${navOpen ? " nav-open" : ""}`}>
      <a className="skip-link" href="#schmiede-main">Zum Inhalt springen</a>

      <header className="schmiede-topbar">
        <button
          type="button"
          className="schmiede-nav-toggle"
          aria-expanded={navOpen}
          aria-controls="schmiede-sidebar"
          onClick={() => setNavOpen((v) => !v)}
        >
          <span aria-hidden="true">{navOpen ? "✕" : "☰"}</span>
          <span>{navOpen ? "Schließen" : "Klienten"}</span>
        </button>
        <div className="schmiede-topbar-brand">
          {ausgewähltId ? <strong>{ausgewählt?.name || ausgewähltId}</strong> : <strong>ClientForge</strong>}
        </div>
      </header>

      <div
        className="schmiede-nav-backdrop"
        hidden={!navOpen}
        onClick={() => setNavOpen(false)}
        aria-hidden="true"
      />

      <KlientenSidebar
        id="schmiede-sidebar"
        labelledBy={sidebarTitleId}
        klienten={klienten}
        ausgewähltId={ausgewähltId}
        onWähle={wähleKlient}
        status={statusText}
      />

      <main className="haupt" id="schmiede-main" tabIndex={-1}>
        {!ausgewähltId ? (
          <div className="willkommen" role="status">
            <h2>Klient wählen</h2>
            <p>Links (bzw. Menü) einen Klienten öffnen.</p>
            <button type="button" className="btn-primary schmiede-welcome-cta" onClick={() => setNavOpen(true)}>
              Klientenliste öffnen
            </button>
          </div>
        ) : (
          <div className="klient-ansicht">
            <div className="klient-kopf">
              <div>
                <h2>{ausgewählt?.name || ausgewähltId}</h2>
                {ausgewählt?.endpoint_path && (
                  <a href={ausgewählt.endpoint_path} target="_blank" rel="noreferrer" className="endpoint-link">
                    {ausgewählt.endpoint_path}
                  </a>
                )}
              </div>
              <button type="button" className="btn-zurück" onClick={() => setAusgewähltId("")}>
                Alle Klienten
              </button>
            </div>

            <TabNav tabs={SCHMIEDE_TABS} aktTab={aktTab} onChange={setAktTab} />

            <div
              className="klient-tab-inhalt"
              role="tabpanel"
              id={`panel-${aktTab}`}
              aria-labelledby={`tab-${aktTab}`}
            >
              {basisLädt && !skipLoadGate ? (
                <div className="willkommen" role="status" aria-live="polite"><p>Lädt…</p></div>
              ) : (
                <>
                  {aktTab === "heute" && <HeuteTab klientId={ausgewähltId} loggedWorkouts={loggedWorkouts} />}
                  {aktTab === "plan" && <PlanEditor klientId={ausgewähltId} plan={plan} onGespeichert={setPlan} />}
                  {aktTab === "habits" && (
                    <HabitEditor
                      klientId={ausgewähltId}
                      habits={habits}
                      loggedHabits={loggedHabits}
                      plan={plan}
                      loggedWorkouts={loggedWorkouts}
                      onGespeichert={setHabits}
                    />
                  )}
                  {aktTab === "notizen" && <NotizenTab klientId={ausgewähltId} />}
                  {aktTab === "journal" && <JournalTab klientId={ausgewähltId} />}
                  {aktTab === "fuel" && (
                    <FuelPlanEditor klientId={ausgewähltId} fuelPlan={fuelPlan} onGespeichert={setFuelPlan} />
                  )}
                  {aktTab === "entspannung" && <EntspannungsEditor klientId={ausgewähltId} />}
                  {aktTab === "kalender" && (
                    <SessionKalender klientId={ausgewähltId} loggedWorkouts={loggedWorkouts} />
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
