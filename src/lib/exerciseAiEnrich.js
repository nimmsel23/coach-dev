/**
 * Browser-seitiges Exercise-Enrichment via Vertex AI — Fallback für
 * reenrichInbox(), wenn der lokale Python-Backend-Call (Coach-Laptop
 * muss dafür an sein) fehlschlägt. Prompts sind 1:1 aus
 * fitness/catalog/agent/gemini.py (PROMPT_EXERCISE_ENRICH/_NEW) portiert,
 * damit beide Pfade dieselbe Qualität/Struktur liefern. Die dort
 * server-seitig zusätzlich erzwungene Muskel-Vokabular-Liste wird hier
 * bewusst weggelassen (nur eine Empfehlung statt harter Prompt-Constraint) —
 * der Coach reviewt jeden Draft ohnehin vor der Freigabe (siehe
 * ExerciseInsightModal "Rohdaten"-Anzeige), ein leicht unpräziser Vorschlag
 * ist hier kein Datenintegritätsproblem.
 */
import { getGenerativeModel, SchemaType } from "firebase/ai";
import { getVertexAI } from "../firebase.js";
import { withAiRetry } from "./aiRetry.js";

const RESPONSE_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    exercise_id: { type: SchemaType.STRING },
    id: { type: SchemaType.STRING },
    name: { type: SchemaType.STRING },
    display_name: { type: SchemaType.STRING },
    german: { type: SchemaType.STRING },
    english: { type: SchemaType.STRING },
    category: { type: SchemaType.STRING, description: "push|pull|squat|lunge|gait|twist|carry" },
    type: { type: SchemaType.STRING, description: "compound|isolation" },
    movements: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
    equipment: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
    primary_muscles: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
    secondary_muscles: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
    stabilizers: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
    coaching_notes: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
    common_errors: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
    tags: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
  },
  required: ["display_name", "german", "english", "category", "primary_muscles", "coaching_notes"],
}

const SHARED_RULES = `CRITICAL: "german" and "english" are BOTH MANDATORY, independent fields - not
one primary name with the other as an afterthought/alias. Fill both with the
real, commonly-used name in that language (not a literal translation if a
different term is actually used by lifters in that language). "display_name"
mirrors "german" by convention (UI default), but "english" MUST still be
filled with the correct, distinct English term.

CRITICAL: primary_muscles, secondary_muscles, and stabilizers should use
specific anatomical IDs where you are confident (e.g. "101_pectoralis_major"
rather than "chest"), otherwise a reasonable coarse muscle-group name. Exact
vocabulary match is not required — a coach reviews every draft before it
goes live.

CRITICAL: "category" is the single Primal Movement Pattern bucket for the
exercise: push, pull, squat, lunge, gait, twist, or carry. Do NOT use body
regions such as chest, back, legs, shoulders, arms, or core as category.
Joint actions/details (horizontal, vertical, knee_flexion, hip_extension,
shoulder_abduction, gait, balance_control) belong in "movements", not
"category".

"coaching_notes" and "common_errors" MUST be flat arrays of German strings —
never nested under a language key like {"de": [...]}.`

function buildNewPrompt(exerciseName, safeName) {
  return `You are an expert fitness coach and biomechanics expert.
A user has logged a new, unknown exercise: "${exerciseName}"

${SHARED_RULES}

exercise_id and id should both be "${safeName}".`
}

function buildEnrichPrompt(existingData, feedback) {
  const feedbackSection = feedback
    ? `\nCoach Feedback zum vorherigen Entwurf (WICHTIG, unbedingt beachten):\n"${feedback}"\n`
    : ""
  const feedbackInstruction = feedback
    ? "\nBerücksichtige das Coach-Feedback oben zwingend — insbesondere kritisierte Formulierungen/Wortwahl NICHT wiederverwenden, sondern durch präzise, fachlich korrekte Alternativen ersetzen."
    : ""
  return `You are an expert fitness coach and biomechanics expert.
I have a basic exercise entry from a bulk import that needs professional "Expert Tier" enrichment.

${SHARED_RULES}

Existing Data (Wiki Layer):
${JSON.stringify(existingData, null, 2)}
${feedbackSection}
Your task:
1. Keep the exercise_id and wger_id.
2. Verify and refine category as the Primal Movement Pattern bucket, plus the muscles.
3. Generate HIGH-QUALITY coaching_notes and common_errors in GERMAN.
4. Ensure biomechanical movement details are captured in movements as a list.${feedbackInstruction}`
}

const NEST_BY_LANG_FIELDS = ["coaching_notes", "common_errors", "cues", "feel_cues", "variations"]

// Gemini/Vertex liefert coaching_notes/common_errors manchmal als {"de": [...]}
// statt flacher Liste, trotz expliziter Anweisung — identischer Bugfix wie
// normalize_enriched_fields() in gemini.py.
function normalizeEnrichedFields(data) {
  const out = { ...data }
  for (const field of NEST_BY_LANG_FIELDS) {
    const val = out[field]
    if (val && typeof val === "object" && !Array.isArray(val)) {
      const flat = val.de || val.en || Object.values(val)[0]
      out[field] = Array.isArray(flat) ? flat : (flat == null ? [] : [String(flat)])
    }
  }
  return out
}

async function callVertex(prompt) {
  const vertexAI = getVertexAI()
  if (!vertexAI) {
    throw new Error("vertex_ai_unavailable")
  }
  const model = getGenerativeModel(vertexAI, {
    model: "gemini-2.5-flash",
    generationConfig: { responseMimeType: "application/json", responseSchema: RESPONSE_SCHEMA },
  })
  const result = await withAiRetry(() => model.generateContent(prompt))
  return normalizeEnrichedFields(JSON.parse(result.response.text()))
}

// Neue, unbekannte Übung ohne Wiki-Vorlage.
export async function enrichNewExerciseViaVertex(exerciseName, safeName) {
  return callVertex(buildNewPrompt(exerciseName, safeName))
}

// Bestehender Bulk-Import-Eintrag, der Expert-Tier-Veredelung braucht
// (der reguläre reenrichInbox-Anwendungsfall).
export async function enrichExerciseViaVertex(existingData, feedback = null) {
  return callVertex(buildEnrichPrompt(existingData, feedback))
}
