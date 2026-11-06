import { useState, useEffect } from "react";
import { getRecoveryAnalytics, getMuscle, getRecentSessions, listSessionsForDate } from "@db";
import { sessionsInRollingWindow } from "../../lib/db/shared/dates.js";

import MuscleHeader from "./MuscleHeader";
import MuscleAnalysis from "./MuscleAnalysis";
import MuscleDetailedMap from "./MuscleDetailedMap";
import MuscleBodyMap from "./MuscleBodyMap";
import MuscleSessionMap from "./MuscleSessionMap";
import MuscleInsights from "./MuscleInsights";
import AnatomyDetailModal from "../../components/AnatomyDetailModal";
import SessionDetailModal from "./SessionDetailModal";
import ReviewSessionList from "../WeeklyReview/ReviewSessionList";

export default function Muscles({ gender, muscleLanguage = 'de', taxonomy = null, recentDays = 10, onInspectExercise = null }) {
  const [days, setDays] = useState(recentDays);
  const [loading, setLoading] = useState(true);
  const [hitAnalysis, setHitAnalysis] = useState({ heavy: [], recovering: [], super: [], ready: [], scores: {} });
  const [viewMode, setViewMode] = useState('standard');
  const [todayExercises, setTodayExercises] = useState([]);
  const [selectedMuscleId, setSelectedMuscleId] = useState(null);
  const [muscleData, setMuscleData] = useState(null);
  const [muscleLoading, setMuscleLoading] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState(null);

  useEffect(() => {
    if (viewMode !== 'today') return;
    let active = true;
    listSessionsForDate()
      .then(list => {
        if (active) setTodayExercises((Array.isArray(list) ? list : []).flatMap(s => Array.isArray(s?.exercises) ? s.exercises : []));
      })
      .catch(() => { if (active) setTodayExercises([]); });
    return () => { active = false; };
  }, [viewMode]);

  useEffect(() => {
    if (!selectedMuscleId) { setMuscleData(null); return; }
    setMuscleLoading(true);
    getMuscle(selectedMuscleId)
      .then(d => setMuscleData(d || null))
      .catch(() => setMuscleData(null))
      .finally(() => setMuscleLoading(false));
  }, [selectedMuscleId]);

  useEffect(() => {
    setDays(recentDays);
  }, [recentDays]);

  useEffect(() => {
    setLoading(true);
    getRecoveryAnalytics(days)
      .then((data) => setHitAnalysis(data?.hit_analysis || { heavy: [], recovering: [], super: [], ready: [], scores: {} }))
      .catch((error) => console.error(error))
      .finally(() => setLoading(false));
  }, [days]);

  useEffect(() => {
    getRecentSessions(60)
      .then(list => {
        const filtered = sessionsInRollingWindow(list, days)
          .map(s => ({ ...s, exercise_count: s.exercises?.length || 0 }))
          .sort((a, b) => b.date.localeCompare(a.date));
        setSessions(filtered);
      })
      .catch(() => setSessions([]));
  }, [days]);

  return (
    <div className="pb-32">
      <MuscleHeader
        days={days}
        setDays={setDays}
        viewMode={viewMode}
        setViewMode={setViewMode}
      />

      {loading ? (
        <div className="flex flex-col items-center justify-center py-32 opacity-30">
          <div className="spinner mb-6" />
          <p className="text-xs font-black uppercase tracking-[0.3em]">Berechne…</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-8 p-10 rounded-[40px] border flex justify-center gap-20 bg-fit-card border-fit-line shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-accent/5 to-transparent pointer-events-none" />
            {viewMode === 'detail' && (
              <MuscleDetailedMap
                gender={gender}
                scores={hitAnalysis.scores}
                onGroupClick={setSelectedMuscleId}
              />
            )}
            {viewMode === 'standard' && (
              <MuscleBodyMap
                scores={hitAnalysis.scores}
                onGroupClick={setSelectedMuscleId}
              />
            )}
            {viewMode === 'today' && (
              <MuscleSessionMap
                gender={gender}
                exercises={todayExercises}
                onGroupClick={setSelectedMuscleId}
              />
            )}
          </div>

          <div className="lg:col-span-4 space-y-6">
            <MuscleAnalysis hitAnalysis={hitAnalysis} muscleLanguage={muscleLanguage} taxonomy={taxonomy} />
            <MuscleInsights hitAnalysis={hitAnalysis} />
          </div>
        </div>
      )}

      {!loading && (
        <div className="mt-8">
          <ReviewSessionList
            sessions={sessions}
            onNavigate={(_, date, session) => setSelectedSession(session)}
            muscleLanguage={muscleLanguage}
            taxonomy={taxonomy}
          />
        </div>
      )}

      <SessionDetailModal
        session={selectedSession}
        onClose={() => setSelectedSession(null)}
        muscleLanguage={muscleLanguage}
        taxonomy={taxonomy}
      />

      <AnatomyDetailModal
        muscleId={selectedMuscleId}
        muscleData={muscleData}
        loading={muscleLoading}
        onClose={() => setSelectedMuscleId(null)}
        muscleLanguage={muscleLanguage}
        taxonomy={taxonomy}
        onInspectExercise={onInspectExercise}
      />
    </div>
  );
}
