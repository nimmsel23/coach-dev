import { api } from "./core";
import { ACTIVITY_MUSCLE_GROUPS } from "../../../constants/ActivityConstants";
import { muscleToGroupIds, getMuscleGroupsForGaps, buildMuscleBalanceInsights, muscleToRegion } from "../shared/muscle";
import { computeMuscleScores, RECOVERY_ANALYSIS_VERSION } from "../../superkompensation.js";
import { ACTIVITY_WEIGHT, GAP_THRESHOLD, effortFactor, blockComplexMuscles } from "../shared/scoring.js";
import { todayISO } from "../shared/utils.js";
import { addDaysISO, mondayOfISO, weekDatesFromMonday, rollingDatesISO, isoWeekDatesForSelector, sessionsInRollingWindow } from "../shared/dates.js";
import { buildKbMap, findKbExercise, augmentKbMapWithMirror } from "../shared/kbLookup.js";
import { sessionsForDates } from "../shared/reportSessions.js";
import { buildReportRecoveryIndex, reportRecoveryHours } from "../shared/reportRecovery.js";

const ROLE_W = { primary: 1, secondary: 0.5, stabilizer: 0.2 };

// Rohe (Muskel, Übungsname, Gewicht)-Treffer einer Session, aus geloggten
// Übungen UND einem geloggten Cardio/Activity-Finisher. activity.primaryMuscles
// markiert die Hauptmover (z.B. Brust beim Brustschwimmen) — Rest bleibt
// secondary. Spiegel von server.mjs::sessionHits / coaching.py::_exercise_hits.
function sessionHits(sess, kbMap) {
  const rows = [];
  const eff = effortFactor(sess);
  for (const ex of (sess.exercises || [])) {
    const exName = ex.name || ex.exercise_id || "";
    const kbEx = findKbExercise(kbMap, ex);
    const primary = (ex.primaryMuscles?.length ? ex.primaryMuscles : null) || kbEx?.primary_muscles || kbEx?.primaryMuscles || [];
    const secondary = (ex.secondaryMuscles?.length ? ex.secondaryMuscles : null) || kbEx?.secondary_muscles || kbEx?.secondaryMuscles || [];
    const stabilizers = (ex.stabilizers?.length ? ex.stabilizers : null) || kbEx?.stabilizers || [];
    primary.forEach(m => rows.push([m, exName, ROLE_W.primary * eff]));
    secondary.forEach(m => rows.push([m, exName, ROLE_W.secondary * eff]));
    stabilizers.forEach(m => rows.push([m, exName, ROLE_W.stabilizer * eff]));
  }
  const actMuscles = sess.activity?.muscles
    || (sess.activity?.type ? ACTIVITY_MUSCLE_GROUPS[sess.activity.type] : null) || [];
  const actPrimary = new Set(sess.activity?.primaryMuscles || []);
  actMuscles.forEach(m => rows.push([m, null, (actPrimary.has(m) ? ROLE_W.primary : ROLE_W.secondary) * ACTIVITY_WEIGHT]));
  // Nur Split-Chip, keine Übungen: ganzer Komplex pauschal als primary.
  if (!(sess.exercises || []).length) {
    blockComplexMuscles(sess.block).forEach(m => rows.push([m, null, ROLE_W.primary * eff]));
  }
  return rows;
}

// Max-per-Muskel-Normalisierung: pro Session zählt für einen Muskel nur der
// höchste Rollen-Treffer (nicht die Summe über alle Übungen). One-Set-to-
// Failure: jede geloggte Übung ist ungefähr gleich hart, mehrere Übungen für
// denselben Muskel bedeuten mehr Breite, nicht automatisch mehr
// Gesamtbelastung. (Die zuvor versuchte Session-Budget-Skalierung war zu
// aggressiv — sie hat pro Session auf einen festen Gesamtwert gedeckelt,
// wodurch nach ein paar Tagen fast jeder Muskel auf denselben Wert
// konvergierte.) Spiegel von server.mjs::normalizedSessionHits /
// coaching.py::_normalized_session_hits.
function normalizedSessionHits(sess, kbMap) {
  const raw = sessionHits(sess, kbMap);
  const best = new Map();
  for (const [m, exName, w] of raw) {
    const cur = best.get(m);
    if (!cur || w > cur[1]) best.set(m, [exName, w]);
  }
  return Array.from(best.entries()).map(([m, [exName, w]]) => [m, exName, w]);
}

export async function getDashboardAnalytics(days = 28) {
  try {
    const data = await api.get(`/fitness/analytics/dashboard?days=${days}`);
    if (data?.data) return data.data;
  } catch {}
  
  // Fallback to local calculation for backwards compatibility
  const scores = await getMuscleCoverage(days);
  return {
    body_region_scores: scores,
    total_volume: 0,
    session_count: 0
  };
}

// "current" = Kalenderwoche Mo–So (lokales Verhalten); "YYYY-Www" = ISO-Woche.
function getWeekBounds(selector = "current") {
  if (selector === "current") return weekDatesFromMonday(mondayOfISO(todayISO()));
  return isoWeekDatesForSelector(selector);
}

// Letzte `days` Kalendertage (heute inklusive, älteste zuerst) — rollendes
// Fenster statt Kalenderwoche/-monat, damit "monatlich" nicht an Monatsgrenzen
// hängt (z.B. am 1. eines Monats sonst nur 1 Tag Daten).
function getRollingDates(days) {
  return rollingDatesISO(days);
}

// Baut den eigentlichen Report (Sessions/Scores/Gaps/Top-Exercises) für eine
// beliebige Liste von Datums-Strings. Von getWeeklyReport() (7-Tage-Kalenderwoche)
// UND getMonthlyReport() (rollendes 28-Tage-Fenster + 7-Tage-Wochen-Chunks
// darin) genutzt, damit beide exakt dieselbe Normalisierung/Aggregation teilen.
function computeReport(dates, { history, kbMap, historyWithMuscles, topExMap }) {
  const sessions = [];
  const bodyRegionScores = {};
  const muscleScores = {};
  const allExercises = [];

  for (const sess of sessionsForDates(history, dates)) {
    const date = sess.date;
    const sessGroupsCount = {};
    for (const ex of (sess.exercises || [])) {
      const exName = ex.name || ex.exercise_id || "";
      if (!exName) continue;
      // Snapshot-First: inline-Werte aus dem Log gewinnen. KB nur Fallback,
      // damit gelöschte/umbenannte Katalog-Einträge keine alten Sessions kaputtmachen.
      const kbEx = findKbExercise(kbMap, ex);
      const primary = (ex.primaryMuscles?.length ? ex.primaryMuscles : null) || kbEx?.primary_muscles || kbEx?.primaryMuscles || [];
      allExercises.push({ name: exName, primaryMuscles: primary });
      // muscleScores bleibt eine reine Übungs-Häufigkeit (wie oft dieser Muskel
      // als primary vorkommt), unabhängig von der Session-Budget-Normalisierung
      // unten — anderes Konzept als "Belastung".
      primary.forEach(m => { muscleScores[m] = (muscleScores[m] || 0) + 1; });
    }
    // Max-per-Muskel-normalisiert (normalizedSessionHits): verhindert, dass eine
    // Session mit vielen Übungen allein wegen der Übungsanzahl höher zählt als
    // eine gleich intensive Session mit 1-2 Übungen.
    for (const [m, exName, w] of normalizedSessionHits(sess, kbMap)) {
      muscleToGroupIds(m, exName).forEach(gid => {
        sessGroupsCount[gid] = (sessGroupsCount[gid] || 0) + w;
        bodyRegionScores[gid] = (bodyRegionScores[gid] || 0) + w;
      });
    }
    const muscleRecovery = reportRecoveryHours(date, Object.keys(sessGroupsCount), historyWithMuscles);
    sessions.push({ ...sess, exercise_count: sess.exercises?.length || 0, muscle_recovery: muscleRecovery });
  }

  const allGroups = getMuscleGroupsForGaps().map(g => g.id);
  const gaps = allGroups.filter(g => (bodyRegionScores[g] || 0) < GAP_THRESHOLD);
  const totalExercises = sessions.reduce((sum, s) => sum + (s.exercise_count || 0), 0);
  const effortValues = sessions.map(s => s.effort).filter(e => e && Number(e) > 0);
  const avgEffort = effortValues.length > 0 ? Math.round(effortValues.reduce((a, b) => a + Number(b), 0) / effortValues.length * 10) / 10 : null;
  return {
    ok: true,
    date_from: dates[0],
    date_to: dates[dates.length - 1],
    session_count: sessions.length,
    total_exercises: totalExercises,
    avg_effort: avgEffort,
    sessions,
    muscle_scores: muscleScores,
    body_region_scores: bodyRegionScores,
    missing_regions: gaps,
    recommendations: [
      // Roher Gap-Dump entfernt — dieselben `gaps` erscheinen bereits übersetzt
      // als Chips im "Coverage Gaps"-Abschnitt (ReviewInsights.jsx), eine
      // zusätzliche unübersetzte Fließtext-Liste war reine Dopplung.
      ...(gaps.length === 0 ? ["Woche gut abgedeckt!"] : []),
      ...buildMuscleBalanceInsights(allExercises),
    ],
    top_exercises: !topExMap ? [] : Object.entries(topExMap).sort((a, b) => b[1] - a[1]).map(([name, count]) => {
      const kbEx = kbMap.get(name.toLowerCase());
      return {
        display_name: name,
        count,
        exercise_id: kbEx?.exercise_id || kbEx?.id || null,
        primary_muscles: kbEx?.primary_muscles || kbEx?.primaryMuscles || [],
        secondary_muscles: kbEx?.secondary_muscles || kbEx?.secondaryMuscles || [],
      };
    })
  };
}

async function loadReportContext() {
  const [exRes, histRes] = await Promise.all([
    api.get('/fitness/exercises/all').catch(() => ({ exercises: [] })),
    api.get('/session/history?limit=120').catch(() => ({ sessions: [] }))
  ]);

  const kbExercises = exRes.exercises || [];
  const history = histRes.sessions || [];
  const kbMap = buildKbMap(kbExercises);
  await augmentKbMapWithMirror(kbMap, history);

  // Pre-build muscle group index over full history for recovery calculation
  const historyWithMuscles = buildReportRecoveryIndex(history, (s) => normalizedSessionHits(s, kbMap), muscleToGroupIds);

  // "Top Exercises" bewusst über die volle Historie (bis zu 120 Sessions),
  // nicht nur die aktuelle Perioden-Auswahl — sonst zeigt der Report bei
  // kurzen Perioden nur 1-2 Sessions und wirkt wie "es zählt nur das letzte
  // Workout", obwohl deutlich mehr Trainingsdaten vorliegen.
  const topExMap = {};
  for (const s of history) {
    for (const ex of (s.exercises || [])) {
      const exName = ex.name || ex.exercise_id || "";
      if (exName) topExMap[exName] = (topExMap[exName] || 0) + 1;
    }
  }

  return { history, kbMap, historyWithMuscles, topExMap };
}

export async function getWeeklyReport(selector = "current") {
  const dates = getWeekBounds(selector);
  const ctx = await loadReportContext();
  return computeReport(dates, ctx);
}

// Rollendes 28-Tage-Fenster ("Monat" = letzte 28 Tage, nicht Kalendermonat) +
// Aufschlüsselung in 4 rollende 7-Tage-Wochen (jüngste zuerst) für die
// Wochenansichten innerhalb des Monats-Reviews.
export async function getMonthlyReport(days = 28) {
  const dates = getRollingDates(days);
  const ctx = await loadReportContext();
  const overall = computeReport(dates, ctx);

  const weeks = [];
  for (let start = dates.length - 7; start > -7; start -= 7) {
    const chunk = dates.slice(Math.max(0, start), start + 7);
    if (chunk.length === 0) continue;
    const weekReport = computeReport(chunk, ctx);
    weeks.push({
      date_from: chunk[0],
      date_to: chunk[chunk.length - 1],
      session_count: weekReport.session_count,
      avg_effort: weekReport.avg_effort,
      body_region_scores: weekReport.body_region_scores,
      missing_regions: weekReport.missing_regions,
    });
  }
  // Schleife läuft bereits von der jüngsten zur ältesten 7-Tage-Chunk (start
  // beginnt bei dates.length-7 und zählt runter) — weeks ist somit schon
  // jüngste-zuerst sortiert, kein zusätzliches reverse() nötig.

  return { ...overall, weeks };
}

export async function getMuscleCoverage(days = 7) {
  // `days` Kalendertage inklusive heute (wie firestore/analysis.js) — vorher
  // days+1 Tage und nach UTC statt lokalem Datum.
  const cutoffDate = addDaysISO(todayISO(), -(days - 1));
  const [exRes, histRes] = await Promise.all([
    api.get('/fitness/exercises/all').catch(() => ({ exercises: [] })),
    api.get('/session/history?limit=120').catch(() => ({ sessions: [] }))
  ]);

  const kbExercises = exRes.exercises || [];
  const history = histRes.sessions || [];
  const kbMap = buildKbMap(kbExercises);
  await augmentKbMapWithMirror(kbMap, history);

  const bodyRegionScores = {};
  const sessionsInWindow = history.filter(s => s.date && s.date >= cutoffDate && s.date <= todayISO());

  for (const sess of sessionsInWindow) {
    for (const [m, exName, w] of normalizedSessionHits(sess, kbMap)) {
      muscleToGroupIds(m, exName).forEach(gid => { bodyRegionScores[gid] = (bodyRegionScores[gid] || 0) + w; });
    }
  }

  return bodyRegionScores;
}

export async function getCoverageGaps(days = 7, threshold = GAP_THRESHOLD) {
  const hits = await getMuscleCoverage(days);
  return getMuscleGroupsForGaps()
    .filter(g => (hits[g.id] || 0) < threshold)
    .map(g => ({ name: g.label, id: g.id, hits: hits[g.id] || 0 }));
}

function buildAcwr(sessions) {
  const now = new Date();
  const safeSessions = Array.isArray(sessions) ? sessions.filter(Boolean) : [];
  const dayOf = (dateStr) => Math.floor((now - new Date(`${dateStr}T12:00:00`)) / 86400000);
  const sessionLoad = (session) => {
    const effort = typeof session?.effort === 'number' ? session.effort : 6;
    const count = Array.isArray(session?.exercises) && session.exercises.length > 0
      ? session.exercises.length
      : session?.activity ? 1 : 0;
    return effort * count;
  };

  let acute = 0;
  let chronic28 = 0;
  for (const session of safeSessions) {
    if (!session?.date) continue;
    const daysAgo = dayOf(session.date);
    if (daysAgo < 0 || daysAgo > 27) continue;
    const load = sessionLoad(session);
    chronic28 += load;
    if (daysAgo <= 6) acute += load;
  }
  const chronicWeekly = chronic28 / 4;
  if (chronicWeekly <= 0) return null;
  return Math.round((acute / chronicWeekly) * 100) / 100;
}

export async function getRecoveryAnalytics(days = 28) {
  const [exRes, histRes] = await Promise.all([
    api.get('/fitness/exercises/all').catch(() => ({ exercises: [] })),
    api.get('/session/history?limit=120').catch(() => ({ sessions: [] })),
  ]);

  const kbExercises = exRes.exercises || [];
  const history = histRes.sessions || [];
  const safeSessions = Array.isArray(history)
    ? history.filter(Boolean).map((session) => ({
      ...session,
      exercises: Array.isArray(session.exercises) ? session.exercises : [],
    }))
    : [];
  const kbMap = buildKbMap(kbExercises);
  await augmentKbMapWithMirror(kbMap, safeSessions);

  const cutoffStr = addDaysISO(todayISO(), -(days - 1));
  const sessionsInRange = sessionsInRollingWindow(safeSessions, days);
  return {
    ok: true,
    analysis_version: RECOVERY_ANALYSIS_VERSION,
    days,
    cutoff_date: cutoffStr,
    updated_at: new Date().toISOString(),
    session_count: sessionsInRange.length,
    hit_analysis: computeMuscleScores(sessionsInRange, kbMap, muscleToRegion),
    acwr: buildAcwr(safeSessions),
  };
}
