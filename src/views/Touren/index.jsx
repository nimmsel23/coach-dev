import { useEffect, useState, useCallback } from 'react';
import { Bike } from 'lucide-react';
import { getCyclingTours, getCyclingTourStats, saveCyclingTour, deleteCyclingTour, getSettings, saveSettings } from '@db';
import TourStats from './TourStats.jsx';
import TourGoal from './TourGoal.jsx';
import TourList from './TourList.jsx';
import TourImportPanel from './TourImportPanel.jsx';

/**
 * Radtouren — eigenständiger Haupt-Tab (nicht Subtab von WeeklyReview/
 * Muscles), analog zu session/journal/review. Begründung: Radtouren waren
 * bisher nur ein kleines Cardio-Addon im Session-Modal — der User will sie
 * als vollwertigen, gleichrangigen Bereich neben dem Krafttraining, mit
 * eigenem Einstiegspunkt in der Nav (User-Klarstellung 2026-09-23).
 *
 * Liest dieselben Session-JSONs wie Session/ActivitySection.jsx — eine dort
 * geloggte Radtour (activity.type === 'cycling') erscheint hier automatisch,
 * ohne zusätzlichen Schreibpfad.
 */
export default function Touren({ onOpenSession }) {
  const [tours, setTours] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [t, s] = await Promise.all([getCyclingTours(), getCyclingTourStats()]);
      setTours(Array.isArray(t) ? t : []);
      setStats(s || null);
    } catch (err) {
      console.error('Touren-Load fehlgeschlagen', err);
      setTours([]);
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);
  useEffect(() => { getSettings().then(setSettings).catch(() => setSettings({})); }, []);

  async function handleImportParsed(tour) {
    if (tour.distanceKm == null && tour.durationMin == null) {
      throw new Error('Keine verwertbaren Kennzahlen in dieser Datei gefunden.');
    }
    await saveCyclingTour(tour);
    await reload();
  }

  async function handleDelete(tour) {
    if (!window.confirm(`Radtour vom ${tour.date} wirklich löschen?`)) return;
    await deleteCyclingTour(tour.date, tour.sessionId);
    await reload();
  }

  async function handleSaveGoal({ goalKm, goalLabel }) {
    const next = { ...(settings || {}), tourGoalKm: goalKm, tourGoalLabel: goalLabel };
    setSettings(next);
    await saveSettings(next);
  }

  return (
    <div className="space-y-6 pb-32">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl flex items-center justify-center bg-fit-orange/15 text-fit-orange">
          <Bike size={20} />
        </div>
        <div>
          <h1 className="text-lg font-black text-fit-ink">Radtouren</h1>
          <p className="text-xs text-fit-dim/50 font-medium">Manuell geloggt + importiert — alles an einem Ort</p>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 opacity-30">
          <div className="spinner mb-4" />
          <p className="text-xs font-semibold">Lade Radtouren…</p>
        </div>
      ) : (
        <>
          <TourStats stats={stats} />

          <TourGoal
            totalKm={stats?.totalKm || 0}
            goalKm={settings?.tourGoalKm ?? null}
            goalLabel={settings?.tourGoalLabel ?? ''}
            onSave={handleSaveGoal}
          />

          <TourImportPanel onImportParsed={handleImportParsed} />

          <section>
            <div className="flex items-center gap-2 mb-3 text-[11px] font-semibold" style={{ color: 'var(--dim)', opacity: 0.7 }}>
              <Bike size={14} className="text-fit-accent" />
              Alle Touren ({tours.length})
            </div>
            <TourList tours={tours} onOpenSession={onOpenSession} onDelete={handleDelete} />
          </section>
        </>
      )}
    </div>
  );
}
