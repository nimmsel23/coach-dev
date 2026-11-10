const { HttpsError } = require("firebase-functions/v1/https");
const { createHash } = require("node:crypto");

const REGION_TIME_ZONE = "Europe/Vienna";
const MODEL = "gemini-2.5-flash";
const MAX_INPUT = 12000;
const MACROS = new Set(["kcal", "protein", "carbs", "fat"]);
// One shared daily AI budget (observeDailyLimit). The channel id attributes
// consumption inside the same budget: a future Voice-AI channel counts
// against the same day, never against a second weekly/daily limit.
const CHANNEL = "smartLog";
// Attribution map inside a day quota doc: { [channel]: { used, reserved } }.
function bumpChannel(byChannel, { used = 0, reserved = 0 }) {
  const counters = byChannel[CHANNEL] || {};
  return { ...byChannel, [CHANNEL]: {
    used: Math.max(0, (counters.used || 0) + used),
    reserved: Math.max(0, (counters.reserved || 0) + reserved),
  } };
}
function assertExpectedUid(uid, expectedUid) {
  if (typeof expectedUid !== "string" || !expectedUid || expectedUid !== uid) {
    throw new HttpsError("permission-denied", "smart_account_changed");
  }
}
function hasOperateEntitlement(entitlement, now) {
  if (entitlement?.tier !== "operate" || entitlement.active !== true) return false;
  // Existing unlabelled grants are legacy admin grants. Any future purchase
  // source must set a bounded expiry; only manual grants may be indefinite.
  if (!Object.hasOwn(entitlement, "expiresAt")) return !Object.hasOwn(entitlement, "source") || entitlement.source === "manual";
  const expiry = entitlement.expiresAt;
  const milliseconds = expiry instanceof Date ? expiry.getTime()
    : typeof expiry?.toMillis === "function" ? expiry.toMillis()
    : typeof expiry === "number" ? expiry : NaN;
  return Number.isFinite(milliseconds) && milliseconds > now.getTime();
}
function quotaPolicy(entitlement, config, now) {
  const isOperate = hasOperateEntitlement(entitlement, now);
  const limit = isOperate ? entitlement.dailyLimit : (config.observeDailyLimit ?? 1);
  if (!Number.isInteger(limit) || limit < 0) throw new HttpsError("failed-precondition", "smart_log_entitlement_not_configured");
  return { tier: isOperate ? "operate" : "observe", limit };
}
function providerUsageFrom(usageMetadata) {
  const fields = [
    ["promptTokenCount", "promptTokenCount"],
    ["candidatesTokenCount", "candidatesTokenCount"],
    ["totalTokenCount", "totalTokenCount"],
    ["cachedContentTokenCount", "cachedContentTokenCount"],
    ["thoughtsTokenCount", "thoughtsTokenCount"],
    ["toolUsePromptTokenCount", "toolUsePromptTokenCount"],
  ];
  const usage = { provider: "gemini-developer-api", model: MODEL, metricsAvailable: false };
  for (const [source, target] of fields) {
    const value = usageMetadata?.[source];
    if (Number.isSafeInteger(value) && value >= 0) {
      usage[target] = value;
      usage.metricsAvailable = true;
    }
  }
  if (typeof usageMetadata?.serviceTier === "string") usage.serviceTier = usageMetadata.serviceTier;
  return usage;
}
function isIsoDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function dayKey(now) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: REGION_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const date = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${date.year}-${date.month}-${date.day}`;
}

function validateInput(data) {
  const requestId = data.request_id;
  if (typeof requestId !== "string" || !/^[A-Za-z0-9_-]{16,80}$/.test(requestId)) {
    throw new HttpsError("invalid-argument", "request_id_invalid");
  }
  if (typeof data.text !== "string" || !data.text.trim() || data.text.length > MAX_INPUT) {
    throw new HttpsError("invalid-argument", "text_invalid");
  }
  const tags = Array.isArray(data.tags) ? data.tags : [];
  const habits = Array.isArray(data.habits) ? data.habits : [];
  if (tags.length > 30 || tags.some((x) => typeof x !== "string" || x.length > 60)) {
    throw new HttpsError("invalid-argument", "tags_invalid");
  }
  if (habits.length > 100 || habits.some((x) => !x || typeof x.name !== "string" || x.name.length > 120)) {
    throw new HttpsError("invalid-argument", "habits_invalid");
  }
  const referenceDate = isIsoDate(data.date) ? data.date : null;
  if (!referenceDate) throw new HttpsError("invalid-argument", "date_invalid");
  return { requestId, text: data.text, date: referenceDate, tags: [...new Set(tags)], habits: habits.map((x) => x.name) };
}

function promptFor({ text, date, tags, habits }) {
  return `Du extrahierst strukturierte Tracker-Daten aus einem freien Tagebuchtext. Erfinde nichts.
Gib ausschließlich JSON mit daily_deposits, journal_entry, water_ml, meals, habits_done, fitness_sessions, relax_sessions und planner_tasks zurück.
journal_entry: knappe deutsche Zusammenfassung. Der Originaltext wird separat unverändert gespeichert.
daily_deposits: Objekt mit genau den Textfeldern body, business, balance und being. Fasse je Bereich in einem kurzen Satz zusammen, was der Text ausdrücklich über den Tag belegt. body = Bewegung, Essen, Schlaf und körperliche Pflege; business = Arbeit, Lernen und wichtige Vorhaben; balance = Beziehungen, Erholung, Freude und Grenzen; being = Meditation, Aufmerksamkeit, innerer Zustand und persönliche Ausrichtung. Ein Ereignis nur einer passenden Hauptkategorie zuordnen. Wenn es keinen klaren Beleg für einen Bereich gibt, dessen Wert als leeren String zurückgeben. Nichts aus anderen Bereichen ableiten, keine Psychologie diagnostizieren, keine Bewertung oder Motivation ergänzen. Der Nutzer kann leere oder ungenaue Felder selbst bearbeiten.
meals: nur klar erwähnte Mahlzeiten/Getränke; type ist breakfast, lunch, dinner oder snack.
time nur als HH:mm, wenn ausdrücklich genannt. Makros für ein ausdrücklich erwähntes Essen erfassen: im Text genannte Werte unverändert übernehmen; fehlende Werte nur schätzen, wenn Lebensmittel und Menge klar sind. Fehlt die Menge, darfst du bei einem eindeutig benannten Einzel-Lebensmittel eine typische Portion annehmen; nenne diese Grundlage in notes (z. B. "Portion geschätzt: 1 mittelgroßer Apfel"). Bei vagen Sammelbegriffen oder Gerichten mit unbekannten Zutaten keine Makros erfinden, sondern null lassen. Jede modellgeschätzte Makrogröße unter estimated_fields (kcal, protein, carbs, fat) markieren; explizit vom Nutzer genannte Werte nicht markieren. Runde Schätzungen sinnvoll und vermeide Dezimalstellen bzw. Scheingenauigkeit. Die Vorschau lässt Werte und Schätzmarkierungen bearbeiten.
habits_done darf nur exakt passende Namen aus dieser Liste enthalten: ${JSON.stringify(habits)}
fitness_sessions nur für klar berichtete, bereits absolvierte Einheiten. Felder: activity_type (strength, hiit, running, walking, cycling, rowing, swimming, hiking, climbing, yoga, stretching), date als YYYY-MM-DD wenn aus Bezugsdatum ${date} eindeutig, sonst weglassen; duration_minutes als ganze Zahl oder weglassen, notes, time nur bei ausdrücklich genannter Uhrzeit. Bei strength zusätzlich exercises: nur ausdrücklich genannte absolvierte Übungen, je {name, sets:[{reps,weight_kg}]}. Nur ausdrücklich genannte Wiederholungen und kg-Gewichte eintragen; unbekannte Werte null, keine Sätze oder Übungen hinzuerfinden. Keine Übungen für andere activity_types.
relax_sessions nur für klar absolvierte Praxis. Felder: technique, date wenn eindeutig, minutes als ganze Zahl oder weglassen, note. Stimmung nicht ableiten.
planner_tasks nur für ausdrücklich zukünftige Absichten mit konkretem Verb. Bezugsdatum des Journaleintrags: ${date}. Felder: title, date (YYYY-MM-DD nur wenn aus Kontext eindeutig ableitbar), time (HH:mm nur ausdrücklich genannt), duration_minutes nur wenn genannt, notes. Keine Termine aus vagen Wünschen erzeugen.
water_ml ist eine klar genannte Trinkmenge als ganze ml-Zahl, sonst 0. Tags helfen nur bei der Zuordnung, nicht als Fakten: ${JSON.stringify(tags)}
Text:\n"""\n${text}\n"""`;
}

function fingerprint(input) {
  return createHash("sha256").update(JSON.stringify({
    text: input.text,
    date: input.date,
    tags: input.tags,
    habits: input.habits,
  })).digest("hex");
}

function validateResult(parsed, input) {
  const allowedRoot = new Set(["daily_deposits", "journal_entry", "water_ml", "meals", "habits_done", "fitness_sessions", "relax_sessions", "planner_tasks"]);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)
      || Object.keys(parsed).some((key) => !allowedRoot.has(key))) throw new Error("schema_root");
  const depositFields = ["body", "business", "balance", "being"];
  const rawDeposits = parsed.daily_deposits ?? {};
  if (!rawDeposits || typeof rawDeposits !== "object" || Array.isArray(rawDeposits)
      || Object.keys(rawDeposits).some((key) => !depositFields.includes(key))) throw new Error("schema_daily_deposits");
  const daily_deposits = Object.fromEntries(depositFields.map((field) => {
    const value = rawDeposits[field] ?? "";
    if (typeof value !== "string" || value.length > 500) throw new Error(`schema_daily_deposit_${field}`);
    return [field, value.trim()];
  }));
  if (typeof parsed.journal_entry !== "string" || parsed.journal_entry.length > 4000) throw new Error("schema_journal");
  if (!Number.isInteger(parsed.water_ml) || parsed.water_ml < 0 || parsed.water_ml > 20000) throw new Error("schema_water");
  if (!Array.isArray(parsed.meals) || parsed.meals.length > 20) throw new Error("schema_meals");
  if (!Array.isArray(parsed.habits_done) || parsed.habits_done.length > 50) throw new Error("schema_habits");
  const meals = parsed.meals.map((meal) => {
    const fields = new Set(["description", "type", "notes", "time", ...MACROS, "estimated_fields"]);
    if (!meal || typeof meal !== "object" || Array.isArray(meal)
        || Object.keys(meal).some((key) => !fields.has(key))) throw new Error("schema_meal");
    if (typeof meal.description !== "string" || !meal.description.trim() || meal.description.length > 240) throw new Error("schema_description");
    if (!["breakfast", "lunch", "dinner", "snack"].includes(meal.type)) throw new Error("schema_type");
    if (meal.notes != null && (typeof meal.notes !== "string" || meal.notes.length > 500)) throw new Error("schema_notes");
    if (meal.time != null && (typeof meal.time !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(meal.time))) throw new Error("schema_time");
    const estimates = meal.estimated_fields ?? [];
    if (!Array.isArray(estimates) || estimates.some((x) => !MACROS.has(x))) throw new Error("schema_estimates");
    for (const [key, max] of [["kcal", 10000], ["protein", 1500], ["carbs", 2000], ["fat", 1500]]) {
      if (meal[key] != null && (typeof meal[key] !== "number" || !Number.isFinite(meal[key]) || meal[key] < 0 || meal[key] > max)) throw new Error(`schema_${key}`);
      if (estimates.includes(key) && meal[key] == null) throw new Error("schema_estimate_missing");
    }
    return { description: meal.description.trim(), type: meal.type, notes: meal.notes || "", time: meal.time || null,
      kcal: meal.kcal ?? null, protein: meal.protein ?? null, carbs: meal.carbs ?? null, fat: meal.fat ?? null,
      estimated_fields: [...new Set(estimates)] };
  });
  const allowedHabits = new Set(input.habits);
  const habits_done = parsed.habits_done.map((habit) => {
    if (!habit || typeof habit.name !== "string" || !allowedHabits.has(habit.name)) throw new Error("schema_habit_name");
    if (habit.evidence != null && (typeof habit.evidence !== "string" || habit.evidence.length > 500)) throw new Error("schema_habit_evidence");
    return { name: habit.name, evidence: habit.evidence || "" };
  });
  const fitnessTypes = new Set(["strength", "hiit", "running", "walking", "cycling", "rowing", "swimming", "hiking", "climbing", "yoga", "stretching"]);
  for (const [key, cap] of [["fitness_sessions", 20], ["relax_sessions", 20], ["planner_tasks", 20]]) {
    if (parsed[key] != null && (!Array.isArray(parsed[key]) || parsed[key].length > cap)) throw new Error(`schema_${key}`);
  }
  const fitness_sessions = (parsed.fitness_sessions ?? []).map((item) => {
    if (!item || typeof item !== "object" || Object.keys(item).some((key) => !["activity_type", "date", "duration_minutes", "notes", "time", "exercises"].includes(key))) throw new Error("schema_fitness");
    if (!fitnessTypes.has(item.activity_type)) throw new Error("schema_fitness_type");
    if (item.duration_minutes != null && (!Number.isInteger(item.duration_minutes) || item.duration_minutes < 1 || item.duration_minutes > 1440)) throw new Error("schema_fitness_duration");
    if (item.notes != null && (typeof item.notes !== "string" || item.notes.length > 500)) throw new Error("schema_fitness_notes");
    if (item.time != null && (typeof item.time !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(item.time))) throw new Error("schema_fitness_time");
    if (item.date != null && !isIsoDate(item.date)) throw new Error("schema_fitness_date");
    if (item.exercises != null && (item.activity_type !== "strength" || !Array.isArray(item.exercises) || item.exercises.length > 20)) throw new Error("schema_fitness_exercises");
    const exercises = (item.exercises ?? []).map((exercise) => {
      if (!exercise || typeof exercise !== "object" || Object.keys(exercise).some((key) => !["name", "sets"].includes(key))) throw new Error("schema_fitness_exercise");
      if (typeof exercise.name !== "string" || !exercise.name.trim() || exercise.name.length > 120 || !Array.isArray(exercise.sets) || exercise.sets.length > 30) throw new Error("schema_fitness_exercise");
      const sets = exercise.sets.map((set) => {
        if (!set || typeof set !== "object" || Object.keys(set).some((key) => !["reps", "weight_kg"].includes(key))) throw new Error("schema_fitness_set");
        if (set.reps != null && (!Number.isInteger(set.reps) || set.reps < 1 || set.reps > 1000)) throw new Error("schema_fitness_reps");
        if (set.weight_kg != null && (typeof set.weight_kg !== "number" || !Number.isFinite(set.weight_kg) || set.weight_kg < 0 || set.weight_kg > 1000)) throw new Error("schema_fitness_weight");
        return { reps: set.reps ?? null, weight_kg: set.weight_kg ?? null };
      });
      return { name: exercise.name.trim(), sets };
    });
    return { activity_type: item.activity_type, date: item.date || input.date, duration_minutes: item.duration_minutes ?? null, notes: item.notes || "", time: item.time || null, exercises };
  });
  const relax_sessions = (parsed.relax_sessions ?? []).map((item) => {
    if (!item || typeof item !== "object" || Object.keys(item).some((key) => !["technique", "date", "minutes", "note"].includes(key))) throw new Error("schema_relax");
    if (typeof item.technique !== "string" || !item.technique.trim() || item.technique.length > 120) throw new Error("schema_relax_technique");
    if (item.minutes != null && (!Number.isInteger(item.minutes) || item.minutes < 1 || item.minutes > 1440)) throw new Error("schema_relax_minutes");
    if (item.note != null && (typeof item.note !== "string" || item.note.length > 500)) throw new Error("schema_relax_note");
    if (item.date != null && !isIsoDate(item.date)) throw new Error("schema_relax_date");
    return { technique: item.technique.trim(), date: item.date || input.date, minutes: item.minutes ?? null, note: item.note || "" };
  });
  const planner_tasks = (parsed.planner_tasks ?? []).map((item) => {
    if (!item || typeof item !== "object" || Object.keys(item).some((key) => !["title", "date", "time", "duration_minutes", "notes"].includes(key))) throw new Error("schema_planner");
    if (typeof item.title !== "string" || !item.title.trim() || item.title.length > 160) throw new Error("schema_planner_title");
    if (item.date != null && !isIsoDate(item.date)) throw new Error("schema_planner_date");
    if (item.time != null && (typeof item.time !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(item.time))) throw new Error("schema_planner_time");
    if (item.duration_minutes != null && (!Number.isInteger(item.duration_minutes) || item.duration_minutes < 1 || item.duration_minutes > 1440)) throw new Error("schema_planner_duration");
    if (item.notes != null && (typeof item.notes !== "string" || item.notes.length > 500)) throw new Error("schema_planner_notes");
    return { title: item.title.trim(), date: item.date || null, time: item.time || null, duration_minutes: item.duration_minutes ?? null, notes: item.notes || "" };
  });
  return { request_id: input.requestId, original_text: input.text, source_tags: input.tags, daily_deposits,
    journal_entry: parsed.journal_entry, water_ml: parsed.water_ml, meals, habits_done, fitness_sessions, relax_sessions, planner_tasks };
}

async function analyze({ db, uid, data, apiKey, fetchImpl, now = new Date() }) {
  const input = validateInput(data);
  const inputHash = fingerprint(input);
  const key = dayKey(now);
  const reqRef = db.collection("smartLoggingRequests").doc(uid).collection("requests").doc(input.requestId);
  const quotaRef = db.collection("smartLoggingQuotas").doc(uid).collection("days").doc(key);
  const entitlementRef = db.collection("smartLoggingEntitlements").doc(uid);
  const configRef = db.collection("smartLoggingConfig").doc("default");

  const reservation = await db.runTransaction(async (tx) => {
    const [reqSnap, quotaSnap, entitlementSnap, configSnap] = await Promise.all([
      tx.get(reqRef), tx.get(quotaRef), tx.get(entitlementRef), tx.get(configRef),
    ]);
    if (reqSnap.exists && reqSnap.get("inputHash") && reqSnap.get("inputHash") !== inputHash) {
      throw new HttpsError("failed-precondition", "smart_log_request_id_conflict");
    }
    if (reqSnap.exists && reqSnap.get("status") === "succeeded") return { cached: reqSnap.get("result") };
    if (reqSnap.exists && ["processing", "locked"].includes(reqSnap.get("status"))) {
      throw new HttpsError("aborted", "smart_log_request_locked");
    }
    if (!apiKey) throw new HttpsError("failed-precondition", "smart_log_provider_not_configured");
    const entitlement = entitlementSnap.data() || {};
    const config = configSnap.data() || {};
    const { tier, limit } = quotaPolicy(entitlement, config, now);
    const used = quotaSnap.exists ? (quotaSnap.get("used") || 0) : 0;
    const pending = quotaSnap.exists ? (quotaSnap.get("reserved") || 0) : 0;
    if (used + pending >= limit) throw new HttpsError("resource-exhausted", "smart_log_daily_quota_reached", { tier, day: key, limit });
    const byChannel = quotaSnap.exists ? (quotaSnap.get("byChannel") || {}) : {};
    tx.set(quotaRef, { used, reserved: pending + 1, day: key, tier,
      byChannel: bumpChannel(byChannel, { reserved: 1 }),
      updatedAt: new Date() }, { merge: true });
    tx.set(reqRef, { status: "processing", day: key, channel: CHANNEL, inputHash, createdAt: new Date(), updatedAt: new Date() });
    return { cached: null };
  });
  if (reservation.cached) return reservation.cached;

  let providerStarted = false;
  let outcomeDecided = false;
  let providerUsage = null;
  try {
    providerStarted = true;
    const response = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: promptFor(input) }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.1 } }),
    });
    if (!response.ok) throw new Error(`provider_http_${response.status}`);
    const body = await response.json();
    providerUsage = providerUsageFrom(body?.usageMetadata);
    const raw = body?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("");
    if (!raw) throw new Error("provider_empty_response");
    // From here the provider answered in full: anything that fails now is a
    // final rejection of that answer, never an unknown outcome.
    outcomeDecided = true;
    const result = validateResult(JSON.parse(raw), input);
    await db.runTransaction(async (tx) => {
      const [quotaSnap, reqSnap] = await Promise.all([tx.get(quotaRef), tx.get(reqRef)]);
      if (!reqSnap.exists || reqSnap.get("status") !== "processing") throw new Error("smart_request_state_lost");
      const reserved = Math.max(0, (quotaSnap.get("reserved") || 1) - 1);
      const byChannel = quotaSnap.get("byChannel") || {};
      tx.set(quotaRef, { reserved, used: (quotaSnap.get("used") || 0) + 1,
        byChannel: bumpChannel(byChannel, { used: 1, reserved: -1 }),
        updatedAt: new Date() }, { merge: true });
      tx.set(reqRef, { status: "succeeded", result, providerUsage, updatedAt: new Date() }, { merge: true });
    });
    return result;
  } catch (error) {
    await db.runTransaction(async (tx) => {
      const [quotaSnap, reqSnap] = await Promise.all([tx.get(quotaRef), tx.get(reqRef)]);
      if (reqSnap.exists && reqSnap.get("status") === "processing") {
        if (providerStarted && !outcomeDecided) {
          // Gemini may have processed/billed the request even though its own
          // response or our success write failed mid-flight. Keep the request
          // and quota locked so a retry with the same ID cannot trigger a
          // second model call.
          tx.set(reqRef, { status: "locked", updatedAt: new Date(), failure: "provider_result_unknown",
            providerUsage: providerUsage || providerUsageFrom(null) }, { merge: true });
        } else {
          // Either the request never reached Gemini, or Gemini answered and
          // the answer was rejected outright. No unknown outcome exists: free
          // the reservation so the day quota is not stuck and mark the request
          // failed (a retry books a fresh provider call under its own quota).
          tx.set(quotaRef, { reserved: Math.max(0, (quotaSnap.get("reserved") || 1) - 1),
            byChannel: bumpChannel(quotaSnap.get("byChannel") || {}, { reserved: -1 }),
            updatedAt: new Date() }, { merge: true });
          tx.set(reqRef, { status: "failed", updatedAt: new Date(),
            failure: String(error?.message || "unknown").slice(0, 200) }, { merge: true });
        }
      }
    });
    throw error;
  }
}

async function getQuotaStatus({ db, uid, now = new Date() }) {
  const day = dayKey(now);
  const quota = db.collection("smartLoggingQuotas").doc(uid).collection("days").doc(day);
  const entitlement = db.collection("smartLoggingEntitlements").doc(uid);
  const config = db.collection("smartLoggingConfig").doc("default");
  return db.runTransaction(async (tx) => {
    const [q, e, c] = await Promise.all([tx.get(quota), tx.get(entitlement), tx.get(config)]);
    const { tier, limit } = quotaPolicy(e.data() || {}, c.data() || {}, now);
    const used = q.exists ? (q.get("used") || 0) : 0;
    const reserved = q.exists ? (q.get("reserved") || 0) : 0;
    return { tier, day, channel: CHANNEL, timeZone: REGION_TIME_ZONE, limit, used, reserved, remaining: Math.max(0, limit - used - reserved) };
  });
}

module.exports = { analyze, getQuotaStatus, dayKey, validateInput, validateResult, assertExpectedUid };
