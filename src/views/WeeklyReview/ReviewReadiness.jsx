import { useState, useMemo, useEffect } from 'react';
import { Zap, Activity, CheckCircle2 } from 'lucide-react';
import { getRecoveryAnalytics } from '@db';

// Grobe UI-Sammelgruppen für die Recovery-Karten — bündelt die 16 feinen
// KB-Regionen aus computeMuscleScores() auf 5 lesbare Kacheln. Bewusst
// dieselbe Quelle wie der Muskeln-Tab (views/Muscles/index.jsx), damit
// Readiness keine eigene, abweichende Zahl mehr zeigt.
const BROAD_GROUPS = [
  { id: 'chest', name: 'Brust', icon: '💪', members: ['chest'] },
  { id: 'back', name: 'Rücken', icon: '🧱', members: ['upper_back', 'middle_back', 'lower_back', 'rhomboids', 'serratus_anterior'] },
  { id: 'legs', name: 'Beine', icon: '🦵', members: ['glutes', 'quadriceps', 'hamstrings', 'calves'] },
  { id: 'arms', name: 'Arme', icon: '⚡', members: ['biceps', 'triceps', 'forearms'] },
  { id: 'core', name: 'Rumpf / Core', icon: '🔥', members: ['core', 'abductors', 'adductors'] },
];

// score (1-4, aus computeMuscleScores) → Regenerations-% für die UI.
// 1 = frisch trainiert/stark belastet, 4 = voll erholt (Fenster schließt sich).
const SCORE_TO_PCT = { 1: 20, 2: 55, 3: 80, 4: 100 };

export default function ReviewReadiness() {
  const [hitAnalysis, setHitAnalysis] = useState({ heavy: [], recovering: [], super: [], ready: [], scores: {} });
  const [acwr, setAcwr] = useState(null);

  useEffect(() => {
    getRecoveryAnalytics(28)
      .then((data) => {
        setHitAnalysis(data?.hit_analysis || { heavy: [], recovering: [], super: [], ready: [], scores: {} });
        setAcwr(data?.acwr ?? null);
      })
      .catch(() => {
        setHitAnalysis({ heavy: [], recovering: [], super: [], ready: [], scores: {} });
        setAcwr(null);
      });
  }, []);

  const groupStatuses = useMemo(() => {
    return BROAD_GROUPS.map(g => {
      const memberScores = g.members
        .map(m => hitAnalysis.scores[m]?.score)
        .filter(s => s != null);
      const avgScore = memberScores.length
        ? memberScores.reduce((a, b) => a + b, 0) / memberScores.length
        : 4; // keine Daten → gilt als voll erholt
      const pct = Math.round(
        memberScores.length
          ? memberScores.reduce((sum, s) => sum + SCORE_TO_PCT[s], 0) / memberScores.length
          : 100
      );
      let statusLabel = 'Voll einsatzbereit';
      let statusColor = 'text-fit-accent bg-fit-accent/10 border-fit-accent/30';
      if (pct < 40) {
        statusLabel = 'Hohe Ermüdung';
        statusColor = 'text-fit-red bg-fit-red/10 border-fit-red/30';
      } else if (pct < 85) {
        statusLabel = 'Leichte Regeneration';
        statusColor = 'text-amber-400 bg-amber-400/10 border-amber-400/30';
      }
      return { ...g, pct, avgScore, statusLabel, statusColor };
    });
  }, [hitAnalysis]);

  const overallReadiness = useMemo(() => {
    if (groupStatuses.length === 0) return 0;
    return Math.round(groupStatuses.reduce((acc, g) => acc + g.pct, 0) / groupStatuses.length);
  }, [groupStatuses]);

  const focusRecommendation = useMemo(() => {
    if (groupStatuses.length === 0) return null;
    return [...groupStatuses].sort((a, b) => b.pct - a.pct)[0];
  }, [groupStatuses]);

  // ACWR (Acute:Chronic Workload Ratio) — Trainingslast (Effort × Übungsanzahl
  // je Session, RPE-basierte Load-Näherung) der letzten 7 Tage im Verhältnis
  // zum 4-Wochen-Schnitt derselben Größe. 0.8–1.3 gilt gemeinhin als
  // Sweetspot, >1.5 als erhöhtes Überlastungsrisiko.
  const acwrLabel = acwr === null ? '—' : acwr < 0.8 ? 'Detraining' : acwr <= 1.3 ? 'Optimal' : acwr <= 1.5 ? 'Erhöht' : 'Risiko';
  const acwrColor = acwr === null || (acwr >= 0.8 && acwr <= 1.3)
    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
    : acwr <= 1.5
      ? 'bg-amber-400/10 text-amber-400 border-amber-400/20'
      : 'bg-fit-red/10 text-fit-red border-fit-red/20';

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Top Banner / Readiness Score */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        <div className="md:col-span-8 card p-8 bg-gradient-to-br from-fit-card via-fit-bg2 to-fit-card border border-fit-line shadow-xl relative overflow-hidden flex flex-col justify-between">
          <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
            <Zap size={180} className="text-fit-accent" />
          </div>

          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className="p-2 rounded-xl bg-fit-accent/10 border border-fit-accent/20 text-fit-accent">
                <Zap size={20} />
              </span>
              <div>
                <h2 className="text-lg font-black tracking-tight text-fit-ink">Readiness</h2>
                <p className="text-fit-dim text-[11px] font-semibold">Regenerations-Index &amp; Trainingslast, konsistent mit dem Muskeln-Tab</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-6">
            <div className="p-4 rounded-2xl bg-fit-bg border border-fit-line/60">
              <div className="text-[10px] font-black uppercase tracking-widest text-fit-dim mb-1">Overall Readiness</div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black text-fit-accent">{overallReadiness}%</span>
                <span className="text-[10px] font-bold text-fit-dim">Score</span>
              </div>
              <div className="w-full bg-fit-line/40 h-1.5 rounded-full mt-2 overflow-hidden">
                <div className="bg-fit-accent h-full transition-all duration-700" style={{ width: `${overallReadiness}%` }} />
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-fit-bg border border-fit-line/60">
              <div className="text-[10px] font-black uppercase tracking-widest text-fit-dim mb-1">ACWR Ratio</div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black text-fit-ink">{acwr === null ? '—' : acwr}</span>
                <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded border ${acwrColor}`}>{acwrLabel}</span>
              </div>
              <p className="text-[9px] text-fit-dim mt-1 truncate">Sweetspot (0.8 – 1.3)</p>
            </div>

            <div className="col-span-2 sm:col-span-1 p-4 rounded-2xl bg-fit-bg border border-fit-line/60 flex flex-col justify-between">
              <div className="text-[10px] font-black uppercase tracking-widest text-fit-dim mb-1">Tages-Empfehlung</div>
              <div className="flex items-center gap-2 text-xs font-bold text-fit-ink">
                <CheckCircle2 size={14} className="text-fit-accent flex-shrink-0" />
                <span>{focusRecommendation ? `${focusRecommendation.name} Focus` : 'Keine Daten'}</span>
              </div>
              <span className="text-[9px] text-fit-accent font-semibold mt-1">
                {focusRecommendation ? `Regeneration ${focusRecommendation.pct}% abgeschlossen` : ''}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Muscle Recovery Status Matrix */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="label-caps flex items-center gap-2 !mb-0">
            <Activity size={16} className="text-fit-accent" />
            Muskulärer Regenerations-Status
          </div>
          <span className="text-[10px] font-black uppercase tracking-widest text-fit-dim">{BROAD_GROUPS.length} Hauptgruppen</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {groupStatuses.map((m) => (
            <div
              key={m.id}
              className="p-5 rounded-2xl bg-fit-bg2 border border-fit-line hover:border-fit-accent/40 transition-all flex flex-col justify-between space-y-4 group"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="text-xl">{m.icon}</span>
                  <div className="text-xs font-black text-fit-ink group-hover:text-fit-accent transition-colors">
                    {m.name}
                  </div>
                </div>
                <span className={`px-2 py-0.5 rounded-md text-[9px] font-black border ${m.statusColor}`}>
                  {m.pct}%
                </span>
              </div>

              <div>
                <div className="flex justify-between text-[9px] font-bold text-fit-dim mb-1">
                  <span>{m.statusLabel}</span>
                </div>
                <div className="w-full bg-fit-line/50 h-2 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-700 ${
                      m.pct < 40 ? 'bg-fit-red' : m.pct < 85 ? 'bg-amber-400' : 'bg-fit-accent'
                    }`}
                    style={{ width: `${m.pct}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
