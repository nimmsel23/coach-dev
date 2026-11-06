/**
 * firestore/analysis.js — Muscle coverage, weekly report, and analytics for Firestore.
 */

import {
  collection,
  doc,
  query,
  where,
  serverTimestamp,
} from "firebase/firestore";
import { setDoc, getDoc, getDocs } from "./offline.js";

import { db } from "../../../firebase.js";
import { todayISO } from "../shared/utils.js";
import {
  addDaysISO, toISODate, rollingDatesISO, isoWeekDatesForSelector, isoWeekSelectorForDate, sessionsInRollingWindow,
} from "../shared/dates.js";
import { buildKbMap, findKbExercise, augmentKbMapWithMirror } from "../shared/kbLookup.js";
import { buildReportRecoveryIndex, reportRecoveryHours } from "../shared/reportRecovery.js";
import { calculateProgressTrend } from "../shared/progressTrend.js";
import { DAILY_WINDOW_DAYS, sumDailyScores, dailyScoresFromSessions } from "../shared/coverageWindow.js";
import {
  ACTIVITY_MUSCLE_MAPPING, muscleToGroupIds,
  getMuscleGroupsForGaps, buildMuscleBalanceInsights,
} from "../shared/muscle.js";
import { getUid, hasAuthSession } from "./core.js";
import { getAllExercises } from "./kb.js";
import { getSessionHistory, listSessionsForDate } from "./sessions.js";
import {
  getDashboardAnalytics as getLocalDashboardAnalytics,
  getRecoveryAnalytics as getLocalRecoveryAnalytics,
  getWeeklyReport as getLocalWeeklyReport,
  getMonthlyReport as getLocalMonthlyReport,
  getCoverageGaps as getLocalCoverageGaps,
  getMuscleCoverage as getLocalMuscleCoverage,
} from "../local/analysis.js";
import { getProgressTrend as getLocalProgressTrend } from "../local/sessions.js";
import { computeMuscleScores, RECOVERY_ANALYSIS_VERSION } from "../../superkompensation.js";
import { muscleToRegion } from "../shared/muscle.js";
import { ACTIVITY_WEIGHT, GAP_THRESHOLD, effortFactor, blockComplexMuscles } from "../shared/scoring.js";

export { ACTIVITY_MUSCLE_MAPPING, muscleToGroupIds };

const pendingWeeklyRefreshes = new Map();
const WEEKLY_REPORT_VERSION = 2;

const ROLE_W = { primary: 1, secondary: 0.5, stabilizer: 0.2 };

// Max-per-Muskel-Normalisierung: pro Session zählt für einen Muskel nur der
// höchste Rollen-Treffer (nicht die Summe über alle Übungen) — verhindert
// dass eine Session mit vielen Übungen allein durch die Anzahl höher zählt
// als eine gleich intensive Session mit 1-2 Übungen (One-Set-to-Failure).
// Spiegel von local/analysis.js::normalizedSessionHits.
//
// KB-Fallback ergänzt (2026-09-05, Nutzer-Freigabe nach Dual-DB-Layer-
// Review): war bis dahin der einzige echte Verhaltensunterschied zu
// local/analysis.js::sessionHits() — fehlten einer Übung ihre eigenen
// primaryMuscles/secondaryMuscles/stabilizers (z.B. Quick-Add/Inbox-
// Übungen vor abgeschlossenem Enrichment), zählte sie auf der Firebase-
// PWA gar nicht zur Muskel-Coverage, lokal schon (dort per KB-Lookup).
// `kbMap` ist optional (Aufrufer ohne Katalog-Fetch bleiben unverändert
// funktionsfähig, nur ohne Fallback).
function normalizedSessionHits(session, kbMap = null) {
  const rows = [];
  const eff = effortFactor(session);
  for (const ex of (Array.isArray(session.exercises) ? session.exercises : [])) {
    const exName = ex.name || ex.exercise_id || "";
    const kbEx = findKbExercise(kbMap, ex);
    const primary = (ex.primaryMuscles?.length ? ex.primaryMuscles : null) || kbEx?.primary_muscles || kbEx?.primaryMuscles || [];
    const secondary = (ex.secondaryMuscles?.length ? ex.secondaryMuscles : null) || kbEx?.secondary_muscles || kbEx?.secondaryMuscles || [];
    const stabilizers = (ex.stabilizers?.length ? ex.stabilizers : null) || kbEx?.stabilizers || [];
    primary.forEach((m) => rows.push([m, exName, ROLE_W.primary * eff]));
    secondary.forEach((m) => rows.push([m, exName, ROLE_W.secondary * eff]));
    stabilizers.forEach((m) => rows.push([m, exName, ROLE_W.stabilizer * eff]));
  }
  const actPrimary = new Set(session.activity?.primaryMuscles || []);
  (session.activity?.muscles || []).forEach((m) =>
    rows.push([m, null, (actPrimary.has(m) ? ROLE_W.primary : ROLE_W.secondary) * ACTIVITY_WEIGHT])
  );
  // Nur Split-Chip, keine Übungen: ganzer Komplex pauschal als primary.
  if (!(Array.isArray(session.exercises) && session.exercises.length)) {
    blockComplexMuscles(session.block).forEach((m) => rows.push([m, null, ROLE_W.primary * eff]));
  }
  const best = new Map();
  for (const [m, exName, w] of rows) {
    const cur = best.get(m);
    if (!cur || w > cur[1]) best.set(m, [exName, w]);
  }
  return Array.from(best.entries()).map(([m, [exName, w]]) => [m, exName, w]);
}

// ── Analytics cache doc ───────────────────────────────────────────────────────
//
// `analytics/dashboard` speichert PRO KALENDERTAG die Region-Scores
// (`daily_region_scores`), nicht nur fertige Fenster-Summen. Ein eingefrorenes
// "rolling_7_days" zeigte Tage nach dem letzten Speichern weiter Sessions, die
// längst aus dem Fenster gefallen waren (auch für die Erinnerungs-Pushes der
// Cloud Function). Aus den Tageswerten lässt sich jedes Fenster zu jedem
// Zeitpunkt korrekt aufsummieren. Die rolling_*-Felder bleiben als
// Kompatibilität für ältere Leser erhalten, werden aber nur noch genutzt,
// wenn sie heute geschrieben wurden.

// Sessions + KB-Lookup für ein Datumsfenster (eine Range-Query).
async function loadCoverageInputs(startStr, endStr) {
  const [q, kbExercises] = await Promise.all([
    getDocs(query(
      collection(db, "fitness", getUid(), "sessions"),
      where("date", ">=", startStr),
      where("date", "<=", endStr),
    )),
    getAllExercises(),
  ]);
  const sessions = q.docs.map((d) => d.data());
  const kbMap = buildKbMap(kbExercises);
  await augmentKbMapWithMirror(kbMap, sessions);
  return { sessions, kbMap };
}

function dailyRegionScores(sessions, kbMap) {
  return dailyScoresFromSessions(
    sessions,
    (session) => normalizedSessionHits(session, kbMap),
    (muscle, exName) => muscleToGroupIds(muscle, exName),
  );
}

async function loadDailyRegionScores(days = DAILY_WINDOW_DAYS) {
  const dates = rollingDatesISO(days);
  const { sessions, kbMap } = await loadCoverageInputs(dates[0], dates[dates.length - 1]);
  return dailyRegionScores(sessions, kbMap);
}

export async function updateAnalyticsDoc() {
  if (!hasAuthSession()) return null;
  try {
    const [daily, r7, r14, r28] = await Promise.all([
      loadDailyRegionScores(DAILY_WINDOW_DAYS),
      buildRecoveryAnalyticsData(7),
      buildRecoveryAnalyticsData(14),
      buildRecoveryAnalyticsData(28),
    ]);
    const now = new Date().toISOString();
    const rolling = (n) => ({ body_region_scores: sumDailyScores(daily, rollingDatesISO(n)), updated_at: now });
    await setDoc(
      doc(db, "fitness", getUid(), "analytics", "dashboard"),
      {
        daily_region_scores: daily,
        daily_window_days: DAILY_WINDOW_DAYS,
        daily_updated_at: now,
        rolling_7_days:  rolling(7),
        rolling_14_days: rolling(14),
        rolling_21_days: rolling(21),
        recovery_7_days: r7,
        recovery_14_days: r14,
        recovery_28_days: r28,
      }
    );
  } catch (e) {
    console.warn("analytics update failed", e);
  }
}

// Wurde der Cache (ISO-Zeitstempel) heute geschrieben? Für alles, was NICHT aus
// Tageswerten abgeleitet werden kann (Recovery-/Legacy-Rolling-Felder).
function writtenToday(isoTimestamp) {
  const t = Date.parse(isoTimestamp || "");
  return Number.isFinite(t) && toISODate(new Date(t)) === todayISO();
}

// Einmal pro Tag und Nutzer: fehlt der Tageswerte-Cache (Konto vor diesem
// Umbau oder Cache nie geschrieben), nachziehen — sonst bliebe die Cloud
// Function auf dem alten, eingefrorenen Stand, bis der Nutzer wieder speichert.
const ensuredDailyCache = new Set();
async function ensureDailyCache() {
  if (!hasAuthSession()) return;
  const key = `${getUid()}:${todayISO()}`;
  if (ensuredDailyCache.has(key)) return;
  ensuredDailyCache.add(key);
  try {
    const snap = await getDoc(doc(db, "fitness", getUid(), "analytics", "dashboard"));
    if (!snap.exists() || !snap.data()?.daily_region_scores) await updateAnalyticsDoc();
  } catch (e) {
    ensuredDailyCache.delete(key);
    console.warn("analytics cache check failed", e);
  }
}

export async function getDashboardAnalytics(days = 21) {
  if (!hasAuthSession()) return getLocalDashboardAnalytics(days);
  try {
    const snap = await getDoc(doc(db, "fitness", getUid(), "analytics", "dashboard"));
    if (snap.exists()) {
      const data = snap.data();
      if (data.daily_region_scores && days <= DAILY_WINDOW_DAYS) {
        return {
          body_region_scores: sumDailyScores(data.daily_region_scores, rollingDatesISO(days)),
          updated_at: data.daily_updated_at || null,
        };
      }
      // Legacy-Felder nur bei exakt passender Fenstergröße UND heute geschrieben.
      const legacy = { 7: data.rolling_7_days, 14: data.rolling_14_days, 21: data.rolling_21_days }[days];
      if (legacy && writtenToday(legacy.updated_at)) return legacy;
    }
  } catch (e) {
    console.error("Failed to fetch dashboard analytics", e);
  }
  // Fallback: live aus den Sessions rechnen
  const scores = await getMuscleCoverage(days);
  return { body_region_scores: scores };
}

// ── Muscle coverage ───────────────────────────────────────────────────────────

export async function getMuscleCoverage(days = 7) {
  if (!hasAuthSession()) return getLocalMuscleCoverage(days);
  const dates = rollingDatesISO(days);
  const { sessions, kbMap } = await loadCoverageInputs(dates[0], dates[dates.length - 1]);
  ensureDailyCache();
  return sumDailyScores(dailyRegionScores(sessions, kbMap), dates);
}

export async function getCoverageGaps(days = 7, threshold = GAP_THRESHOLD) {
  if (!hasAuthSession()) return getLocalCoverageGaps(days, threshold);
  const hits = await getMuscleCoverage(days);
  return getMuscleGroupsForGaps()
    .filter((g) => (hits[g.id] || 0) < threshold)
    .map((g) => ({ name: g.label, id: g.id, hits: hits[g.id] || 0 }));
}

function buildAcwr(sessions) {
  const now = new Date();
  const safeSessions = Array.isArray(sessions) ? sessions.filter(Boolean) : [];
  const dayOf = (dateStr) => Math.floor((now - new Date(`${dateStr}T12:00:00`)) / 86400000);
  const sessionLoad = (session) => {
    const effort = typeof session?.effort === "number" ? session.effort : 6;
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

async function buildRecoveryAnalyticsData(days = 28) {
  const [sessions, kbExercises] = await Promise.all([
    getSessionHistory(60),
    getAllExercises(),
  ]);
  const safeSessions = Array.isArray(sessions)
    ? sessions.filter(Boolean).map((session) => ({
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

// Recovery-Werte hängen an "jetzt" (ACWR, Tage seit letztem Reiz) und lassen
// sich nicht aus Tageswerten ableiten — der Cache gilt deshalb nur am Tag seines
// Schreibens. Danach live rechnen; kurz gememoized, damit mehrere Views beim
// Öffnen nicht jeweils KB + Historie neu laden.
const RECOVERY_LIVE_TTL_MS = 2 * 60 * 1000;
const recoveryLive = new Map();

export async function getRecoveryAnalytics(days = 28) {
  if (!hasAuthSession()) return getLocalRecoveryAnalytics(days);
  try {
    const snap = await getDoc(doc(db, "fitness", getUid(), "analytics", "dashboard"));
    if (snap.exists()) {
      const data = snap.data() || {};
      const field = { 7: "recovery_7_days", 14: "recovery_14_days", 28: "recovery_28_days" }[days];
      const cached = field && data[field];
      if (cached?.analysis_version === RECOVERY_ANALYSIS_VERSION && cached.days === days && writtenToday(cached.updated_at)) return cached;
    }
  } catch (e) {
    console.warn("Failed to fetch cached recovery analytics", e);
  }
  const key = `${getUid()}:${days}:${todayISO()}`;
  const hit = recoveryLive.get(key);
  if (hit && Date.now() - hit.at < RECOVERY_LIVE_TTL_MS) return hit.promise;
  const promise = buildRecoveryAnalyticsData(days);
  recoveryLive.set(key, { at: Date.now(), promise });
  promise.catch(() => recoveryLive.delete(key));
  return promise;
}

// ── Weekly report ─────────────────────────────────────────────────────────────

// "current" = die letzten 7 Tage bis heute (rollend, Firebase-Verhalten);
// "YYYY-Www" = die ISO-Kalenderwoche Mo–So.
function getWeekBounds(selector = "current") {
  if (selector === "current") return rollingDatesISO(7);
  return isoWeekDatesForSelector(selector);
}

function getWeekSelectorFromDate(date = todayISO()) {
  return isoWeekSelectorForDate(date);
}

function resolveWeekSelector(selector = "current") {
  return selector === "current" ? getWeekSelectorFromDate(todayISO()) : selector;
}

function weeklyReportDocRef(selector = "current") {
  return doc(db, "fitness", getUid(), "analytics", `weekly_${resolveWeekSelector(selector)}`);
}

// Sessions je Tag aus dem bereits geladenen Verlauf (getSessionHistory(120))
// statt einer Query pro Tag (Wochenbericht 7×, Monatsbericht 28×). Nur Tage
// älter als das Verlaufsfenster (alte Wochen-Selektoren) fragen weiter einzeln ab.
const HISTORY_WINDOW_DAYS = 120;
async function sessionsByDateFromHistory(history, dates) {
  const from = addDaysISO(todayISO(), -(HISTORY_WINDOW_DAYS - 2));
  const byDate = new Map();
  for (const s of history) {
    if (!s?.date) continue;
    if (!byDate.has(s.date)) byDate.set(s.date, []);
    byDate.get(s.date).push(s);
  }
  const out = new Map();
  for (const date of dates) {
    out.set(date, date >= from
      ? (byDate.get(date) || []).slice().sort((a, b) => String(a.saved_at).localeCompare(String(b.saved_at)))
      : await listSessionsForDate(date));
  }
  return out;
}

async function buildWeeklyReportData(selector = "current") {
  const dates = getWeekBounds(selector);
  const [kbExercises, history] = await Promise.all([
    getAllExercises(),
    getSessionHistory(120),
  ]);
  const kbMap = buildKbMap(kbExercises);

  const safeHistory = Array.isArray(history)
    ? history.filter(Boolean).map((s) => ({ ...s, exercises: Array.isArray(s.exercises) ? s.exercises : [] }))
    : [];
  await augmentKbMapWithMirror(kbMap, safeHistory);

  const historyWithMuscles = buildReportRecoveryIndex(safeHistory, (s) => {
    const hits = normalizedSessionHits(s, kbMap);
    if (!s.activity?.muscles?.length) {
      for (const muscle of ACTIVITY_MUSCLE_MAPPING[s.activity?.type]?.muscles || []) hits.push([muscle, null, ACTIVITY_WEIGHT]);
    }
    return hits;
  }, muscleToGroupIds);

  const sessions = [];
  let entriesCount = 0;
  const muscleScores = {}, bodyRegionScores = {}, topExMap = {};
  const allExercises = [];

  // "Top Exercises" bewusst über die volle Historie (bis zu 120 Sessions),
  // nicht nur die aktuelle Wochen-/Periodenauswahl (dates) — sonst zeigt der
  // Report bei kurzen Perioden nur 1-2 Sessions und wirkt wie "es zählt nur
  // das letzte Workout", obwohl deutlich mehr Trainingsdaten vorliegen.
  for (const s of safeHistory) {
    for (const ex of (s.exercises || [])) {
      const exName = ex.name || ex.exercise_id || "";
      if (exName) topExMap[exName] = (topExMap[exName] || 0) + 1;
    }
  }

  // listSessionsForDate() statt getSession(date): getSession() lädt per exakter
  // Dokument-ID (nur der reine Datumsstring). Sessions, die über "Neues Workout"
  // angelegt wurden, haben aber eine "date__<timestamp>"-Dokument-ID (Mehrfach-
  // Sessions pro Tag) — getSession(date) fand solche Docs nie, wodurch komplette
  // Trainingstage (inkl. aller Muskelgruppen) aus dem Weekly Report verschwanden.
  // listSessionsForDate() nutzt eine Query auf das "date"-Feld und findet alle
  // Sessions eines Tages, unabhängig von der Dokument-ID.
  const weekSessionsByDate = await sessionsByDateFromHistory(safeHistory, dates);
  for (const date of dates) {
    const daySessions = weekSessionsByDate.get(date) || [];

    for (const sess of daySessions) {
    let hasDoneExercises = false;
    const sessGroupsCount = {};

    for (const ex of (Array.isArray(sess.exercises) ? sess.exercises : [])) {
      const kbEx = findKbExercise(kbMap, ex);
      const primary = (ex.primaryMuscles?.length ? ex.primaryMuscles : null) || kbEx?.primary_muscles || kbEx?.primaryMuscles || [];
      const secondary = (ex.secondaryMuscles?.length ? ex.secondaryMuscles : null) || kbEx?.secondary_muscles || kbEx?.secondaryMuscles || [];
      const stabilizers = (ex.stabilizers?.length ? ex.stabilizers : null) || kbEx?.stabilizers || [];
      const exName = ex.name || ex.exercise_id || "";
      hasDoneExercises = true; entriesCount++;
      allExercises.push({ name: exName, primaryMuscles: primary });
      let hasMapped = false;
      [...primary, ...secondary, ...stabilizers].forEach((m) => {
        muscleToGroupIds(m, exName).forEach((gid) => { sessGroupsCount[gid] = (sessGroupsCount[gid] || 0) + 1; hasMapped = true; });
      });
      for (const m of primary) {
        muscleToGroupIds(m, exName).forEach((gid) => { muscleScores[m] = (muscleScores[m] || 0) + 1; hasMapped = true; });
      }
      for (const m of secondary) {
        muscleToGroupIds(m, exName).forEach(() => { hasMapped = true; });
      }
      for (const m of stabilizers) {
        muscleToGroupIds(m, exName).forEach(() => { hasMapped = true; });
      }
      if (!hasMapped && exName) {
        muscleToGroupIds("", exName).forEach((gid) => { sessGroupsCount[gid] = (sessGroupsCount[gid] || 0) + 1; });
      }
    }

    if (hasDoneExercises || sess.block || sess.activity) {
      const sortedGroups = Object.entries(sessGroupsCount).sort((a, b) => b[1] - a[1]);
      let autoSplit = sess.block || sess.trainingsart || "Training";
      if (!sess.block && sortedGroups.length > 0) autoSplit = sortedGroups[0][0].charAt(0).toUpperCase() + sortedGroups[0][0].slice(1);
      if (sess.activity && ACTIVITY_MUSCLE_MAPPING[sess.activity.type]) {
        ACTIVITY_MUSCLE_MAPPING[sess.activity.type].muscles.forEach((m) => {
          muscleToGroupIds(m).forEach((gid) => {
            sessGroupsCount[gid] = (sessGroupsCount[gid] || 0) + 1;
          });
        });
      }
      // Chip-only: Komplex zählt auch für die Regeneration (muscle_recovery) der Folge-Sessions.
      if (!(Array.isArray(sess.exercises) && sess.exercises.length)) {
        blockComplexMuscles(sess.block).forEach((m) => muscleToGroupIds(m).forEach((gid) => { sessGroupsCount[gid] = (sessGroupsCount[gid] || 0) + 1; }));
      }
      // Score einheitlich über normalizedSessionHits (RPE-skaliert, Cardio leichter,
      // Split-Chip ohne Übungen = ganzer Komplex), wie Monats-/Rolling-Auswertung.
      for (const [m, exName, w] of normalizedSessionHits(sess, kbMap)) {
        muscleToGroupIds(m, exName).forEach((gid) => {
          bodyRegionScores[gid] = (bodyRegionScores[gid] || 0) + w;
          sessGroupsCount[gid] = (sessGroupsCount[gid] || 0) + w;
        });
      }
      const muscleRecovery = reportRecoveryHours(date, Object.keys(sessGroupsCount), historyWithMuscles);
      sessions.push({ ...sess, block: autoSplit, exercise_count: sess.exercises?.length || 0, muscle_recovery: muscleRecovery });
    }
    }
  }

  const allGroups = getMuscleGroupsForGaps().map((g) => g.id);
  const gaps = allGroups.filter((g) => (bodyRegionScores[g] || 0) < GAP_THRESHOLD);

  const efforts = sessions.map((s) => s.effort).filter((e) => typeof e === "number");
  const avgEffort = efforts.length > 0 ? Math.round((efforts.reduce((a, b) => a + b, 0) / efforts.length) * 10) / 10 : null;

  return {
    ok: true,
    report_version: WEEKLY_REPORT_VERSION,
    week: resolveWeekSelector(selector),
    requested_week: selector,
    week_dates: dates,
    session_count: sessions.length,
    entries_count: entriesCount,
    total_exercises: entriesCount, avg_effort: avgEffort,
    sessions, muscle_scores: muscleScores, body_region_scores: bodyRegionScores, missing_regions: gaps,
    top_exercises: Object.entries(topExMap).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ display_name: name, count })),
    recommendations: [
      // Roher Gap-Dump entfernt — dieselben `gaps` erscheinen bereits übersetzt
      // als Chips im "Coverage Gaps"-Abschnitt (ReviewInsights.jsx), eine
      // zusätzliche unübersetzte Fließtext-Liste war reine Dopplung.
      ...(gaps.length === 0 ? ["Woche perfekt abgedeckt!"] : []),
      ...buildMuscleBalanceInsights(allExercises),
    ],
  };
}

export async function updateWeeklyReportDoc(selector = "current") {
  if (!hasAuthSession()) return null;
  const data = await buildWeeklyReportData(selector);
  await setDoc(weeklyReportDocRef(selector), {
    ...data,
    updated_at: new Date().toISOString(),
    saved_at: serverTimestamp(),
  });
  return data;
}

export function scheduleWeeklyReportRefreshForDate(date = todayISO(), delayMs = 900) {
  if (!hasAuthSession()) return Promise.resolve(null);
  const selector = getWeekSelectorFromDate(date);
  const existing = pendingWeeklyRefreshes.get(selector);
  if (existing?.timer) clearTimeout(existing.timer);

  let resolvePromise;
  let rejectPromise;
  const promise = new Promise((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });

  const timer = setTimeout(async () => {
    try {
      const data = await updateWeeklyReportDoc(selector);
      resolvePromise(data);
    } catch (error) {
      rejectPromise(error);
    } finally {
      pendingWeeklyRefreshes.delete(selector);
    }
  }, delayMs);

  pendingWeeklyRefreshes.set(selector, { timer, promise });
  return promise;
}

export async function getWeeklyReport(selector = "current") {
  if (!hasAuthSession()) return getLocalWeeklyReport(selector);

  const resolvedSelector = resolveWeekSelector(selector);
  const pending = pendingWeeklyRefreshes.get(resolvedSelector);
  if (pending?.promise) {
    try {
      await pending.promise;
    } catch {}
  }

  try {
    const snap = await getDoc(weeklyReportDocRef(selector));
    if (snap.exists()) {
      const cached = snap.data();
      // "current" ist ein rollendes 7-Tage-Fenster: der Cache stammt vom Tag
      // des letzten Speicherns und wäre am nächsten Tag um Tage verschoben.
      if (cached?.report_version === WEEKLY_REPORT_VERSION && cached.requested_week === selector && (selector !== "current" || writtenToday(cached?.updated_at))) return cached;
    }
  } catch (e) {
    console.warn("Failed to fetch cached weekly report", e);
  }

  return updateWeeklyReportDoc(selector);
}

// Rollendes 28-Tage-Fenster ("Monat" = letzte 28 Tage, nicht Kalendermonat) +
// Aufschlüsselung in 4 rollende 7-Tage-Wochen (jüngste zuerst) für die
// Wochenansichten innerhalb des Monats-Reviews. Bewusst NICHT über
// buildWeeklyReportData()/den Firestore-Cache-Doc-Pfad gebaut (andere,
// ältere Rollen-Gewichtung ohne Max-per-Muskel-Normalisierung, siehe
// normalizedSessionHits oben) — nutzt stattdessen dieselbe Normalisierung
// wie getMuscleCoverage()/getCoverageGaps() in dieser Datei.
export async function getMonthlyReport(days = 28) {
  if (!hasAuthSession()) return getLocalMonthlyReport(days);

  const dates = rollingDatesISO(days);
  const [kbExercises, history] = await Promise.all([
    getAllExercises(),
    getSessionHistory(120),
  ]);
  const kbMap = buildKbMap(kbExercises);

  const safeHistory = Array.isArray(history)
    ? history.filter(Boolean).map((s) => ({ ...s, exercises: Array.isArray(s.exercises) ? s.exercises : [] }))
    : [];

  const topExMap = {};
  for (const s of safeHistory) {
    for (const ex of (s.exercises || [])) {
      const exName = ex.name || ex.exercise_id || "";
      if (exName) topExMap[exName] = (topExMap[exName] || 0) + 1;
    }
  }

  // Sessions je Tag aus dem Verlauf (siehe sessionsByDateFromHistory), für den
  // Gesamtzeitraum UND die 7-Tage-Wochen-Chunks wiederverwendet.
  const sessionsByDate = await sessionsByDateFromHistory(safeHistory, dates);

  await augmentKbMapWithMirror(kbMap, Array.from(sessionsByDate.values()).flat());

  function aggregate(dateSlice) {
    const bodyRegionScores = {};
    const muscleScores = {};
    const allExercises = [];
    let sessionCount = 0;
    let exerciseCount = 0;
    const efforts = [];
    for (const date of dateSlice) {
      for (const sess of (sessionsByDate.get(date) || [])) {
        const exercises = Array.isArray(sess.exercises) ? sess.exercises : [];
        const hasContent = exercises.length > 0 || sess.block || sess.activity;
        if (!hasContent) continue;
        sessionCount++;
        exerciseCount += exercises.length;
        if (typeof sess.effort === "number") efforts.push(sess.effort);
        for (const ex of exercises) {
          const exName = ex.name || ex.exercise_id || "";
          const primary = ex.primaryMuscles || [];
          allExercises.push({ name: exName, primaryMuscles: primary });
          primary.forEach((m) => { muscleScores[m] = (muscleScores[m] || 0) + 1; });
        }
        for (const [m, exName, w] of normalizedSessionHits(sess, kbMap)) {
          muscleToGroupIds(m, exName).forEach((gid) => { bodyRegionScores[gid] = (bodyRegionScores[gid] || 0) + w; });
        }
      }
    }
    const avgEffort = efforts.length > 0 ? Math.round((efforts.reduce((a, b) => a + b, 0) / efforts.length) * 10) / 10 : null;
    return { bodyRegionScores, muscleScores, allExercises, sessionCount, exerciseCount, avgEffort };
  }

  const overall = aggregate(dates);
  const allGroups = getMuscleGroupsForGaps().map((g) => g.id);
  const gaps = allGroups.filter((g) => (overall.bodyRegionScores[g] || 0) < GAP_THRESHOLD);

  const weeks = [];
  for (let start = dates.length - 7; start > -7; start -= 7) {
    const chunk = dates.slice(Math.max(0, start), start + 7);
    if (chunk.length === 0) continue;
    const wk = aggregate(chunk);
    weeks.push({
      date_from: chunk[0],
      date_to: chunk[chunk.length - 1],
      session_count: wk.sessionCount,
      avg_effort: wk.avgEffort,
      body_region_scores: wk.bodyRegionScores,
      missing_regions: allGroups.filter((g) => (wk.bodyRegionScores[g] || 0) < GAP_THRESHOLD),
    });
  }
  // Schleife läuft bereits jüngste→älteste 7-Tage-Chunk zuerst (start zählt
  // von dates.length-7 runter) — weeks ist somit schon jüngste-zuerst.

  return {
    ok: true,
    date_from: dates[0],
    date_to: dates[dates.length - 1],
    session_count: overall.sessionCount,
    total_exercises: overall.exerciseCount,
    avg_effort: overall.avgEffort,
    muscle_scores: overall.muscleScores,
    body_region_scores: overall.bodyRegionScores,
    missing_regions: gaps,
    recommendations: [
      ...(gaps.length === 0 ? ["Zeitraum gut abgedeckt!"] : []),
      ...buildMuscleBalanceInsights(overall.allExercises),
    ],
    top_exercises: Object.entries(topExMap).sort((a, b) => b[1] - a[1]).map(([name, count]) => {
      const kbEx = kbMap.get(name.toLowerCase());
      return {
        display_name: name,
        count,
        exercise_id: kbEx?.exercise_id || kbEx?.id || null,
        primary_muscles: kbEx?.primary_muscles || kbEx?.primaryMuscles || [],
        secondary_muscles: kbEx?.secondary_muscles || kbEx?.secondaryMuscles || [],
      };
    }),
    weeks,
  };
}

// ── Progress trend ────────────────────────────────────────────────────────────

export async function getProgressTrend(exercise, lastN = 4) {
  if (!hasAuthSession()) return getLocalProgressTrend(exercise, lastN);
  const history = await getSessionHistory(lastN * 7);
  return calculateProgressTrend(history, exercise, lastN);
}
