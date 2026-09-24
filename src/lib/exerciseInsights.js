import { normalizeExerciseRecord } from './db/shared/exercise.js'
import { formatMuscleDetail } from './kb/muscles.js'

function cleanList(items) {
  return [...new Set((items || []).map(v => String(v || '').trim()).filter(Boolean))]
}

function describeMuscles(items, limit = 3) {
  return cleanList(items)
    .slice(0, limit)
    .map((item) => formatMuscleDetail(item, null, 'de', 'normal'))
}

function describeFallbackPattern(ex) {
  const primaryLabels = describeMuscles(ex?.primaryMuscles)
  if (!primaryLabels.length) return 'Bewegungsmuster noch nicht vom Coach beschrieben'
  if (primaryLabels.length === 1) return `Fokus auf ${primaryLabels[0]}`
  return `Fokus auf ${primaryLabels.join(', ')}`
}

function unwrapLesson(ex) {
  const lesson = ex?.lesson || ex?.anatomy_teaching || ex?.teaching || null
  return lesson && typeof lesson === 'object' ? lesson : null
}

function isUnreviewedExercise(ex) {
  const reviewStatus = String(ex?.review_state?.status || '').trim().toLowerCase()
  const source = String(ex?.source || '').trim().toLowerCase()
  return source === 'unreviewed' || reviewStatus === 'draft'
}

function flattenLessonJointActions(value) {
  if (!value) return []
  if (Array.isArray(value)) return cleanList(value)
  if (typeof value !== 'object') return cleanList([value])
  const lines = []
  for (const [joint, jointData] of Object.entries(value)) {
    if (jointData && typeof jointData === 'object' && !Array.isArray(jointData)) {
      for (const phase of ['eccentric', 'concentric', 'stabilization']) {
        const items = cleanList(jointData[phase] || [])
        if (items.length) lines.push(`${joint} ${phase}: ${items.join(', ')}`)
      }
    } else {
      lines.push(`${joint}: ${String(jointData)}`)
    }
  }
  return cleanList(lines)
}

function inferMovement(ex) {
  const lesson = unwrapLesson(ex)
  if (lesson) {
    const pattern = lesson.movement_pattern
    const primary = typeof pattern === 'string' ? pattern : pattern?.primary || ''
    const learningGoal = lesson.learning_goal || {}
    const trainer = lesson.trainer_explanation || {}
    const quizItem = Array.isArray(lesson.quiz) ? lesson.quiz[0] : lesson.quiz
    return {
      title: lesson.title || 'Anatomie-Lektion',
      pattern: primary || 'Bewegungsmuster',
      lesson: learningGoal.detailed || trainer.technical || trainer.simple || '',
      jointActions: flattenLessonJointActions(lesson.joint_actions),
      feel: cleanList(lesson.feel_cues || [trainer.client_friendly || trainer.simple || ''])[0] || '',
      cues: cleanList(lesson.coaching_cues || []),
      errors: cleanList(lesson.common_errors || []).map(err => ({
        error: err.error || 'Fehler',
        reason: err.anatomical_reason || '',
        fix: err.correction || err.coaching_cue || '',
      })),
      quiz: quizItem?.question || 'Was lehrt diese Übung?',
    }
  }

  // Keine anatomy_teaching-Lesson vorhanden: statt erfundenem Bewegungsmuster-Text
  // die echten Rohdaten aus wger/yuhonas zeigen (original_description, instructions).
  // Diese Felder liegen bereits im ExerciseRecord (fitness/catalog/core/resolver.py)
  // und werden über dataclasses.asdict() an /fitness/exercises/all durchgereicht.
  const instructions = cleanList(ex?.instructions)
  const description = Array.isArray(ex?.original_description)
    ? cleanList(ex.original_description).join(' ')
    : String(ex?.original_description || '').trim()
  const rawCoachingNotes = (isUnreviewedExercise(ex) || ex?.tags?.includes('bulk_import'))
    ? cleanList(ex?.coaching_notes).join(' ')
    : ''
  const primary = cleanList(ex?.primaryMuscles)
  const fallbackLesson = description || instructions.join(' ') || rawCoachingNotes

  return {
    title: 'Originaldaten aus der Quell-Datenbank',
    pattern: describeFallbackPattern(ex),
    lesson: fallbackLesson,
    jointActions: [],
    feel: '',
    cues: [],
    errors: [],
    quiz: '',
    isRaw: true,
    rawInstructions: instructions,
    rawDescription: description || rawCoachingNotes,
  }
}

function inferRegionLabels(ex) {
  const lesson = unwrapLesson(ex)
  if (lesson?.body_highlighter_regions) {
    const regions = lesson.body_highlighter_regions
    const labels = []
    const add = (value) => {
      for (const item of cleanList(Array.isArray(value) ? value : [value])) {
        if (!labels.includes(item)) labels.push(item)
      }
    }
    if (Array.isArray(regions)) {
      add(regions)
    } else if (typeof regions === 'object') {
      add(regions.primary || [])
      add(regions.secondary || [])
      add(regions.light || [])
    }
    if (labels.length) return labels
  }

  const muscles = cleanList([...(ex?.primaryMuscles || []), ...(ex?.secondaryMuscles || [])]).join(' | ').toLowerCase()
  const labels = []
  const add = (label) => { if (!labels.includes(label)) labels.push(label) }

  if (/chest|pec|pectoral/.test(muscles)) add('Brust vorne')
  if (/lat|back|trapezius|rhomboid/.test(muscles)) add('Rücken')
  if (/shoulder|deltoid/.test(muscles)) add('Schulter')
  if (/triceps/.test(muscles)) add('Armstrecker')
  if (/biceps|brachialis|brachioradialis/.test(muscles)) add('Armbeuger')
  if (/quad|quadriceps/.test(muscles)) add('Oberschenkel vorne')
  if (/hamstring|biceps femoris/.test(muscles)) add('Oberschenkel hinten')
  if (/glute/.test(muscles)) add('Gesäß')
  if (/core|abs|abdom/.test(muscles)) add('Core')
  if (/calf|gastrocnemius|soleus/.test(muscles)) add('Waden')

  if (!labels.length) {
    const movement = inferMovement(ex).title
    if (movement.includes('Drück')) add('Brust / Schulter / Trizeps')
    else if (movement.includes('Zug')) add('Rücken / Arme')
    else if (movement.includes('Bein')) add('Beine / Gesäß')
    else add('Ganzkörper')
  }

  return labels
}

export function buildExerciseInsights(rawEx) {
  const ex = normalizeExerciseRecord(rawEx)
  const primary = cleanList(ex?.primaryMuscles)
  const secondary = cleanList(ex?.secondaryMuscles)
  const lesson = unwrapLesson(ex)
  const movement = inferMovement(ex)
  const regions = inferRegionLabels(ex)
  const title = ex?.displayName || ex?.name || 'Übung'
  const category = ex?.category || 'Unbekannte Kategorie'
  const equipment = Array.isArray(ex?.equipment) ? ex.equipment.join(', ') : (ex?.equipment || 'Unbekannt')

  const coachCues = cleanList([
    ...movement.cues,
    ...(lesson?.coaching_cues || []),
    ...(primary.length ? [`Treiber: ${primary.slice(0, 2).join(', ')}`] : []),
    ...(secondary.length ? [`Mitspieler: ${secondary.slice(0, 2).join(', ')}`] : []),
  ])

  const lessonErrors = Array.isArray(lesson?.common_errors) ? lesson.common_errors : []
  const commonErrors = (lessonErrors.length ? lessonErrors : movement.errors).map(err => ({
    error: err.error || err,
    anatomicalReason: err.anatomical_reason || err.reason || '',
    correction: err.correction || err.fix || '',
    coachingCue: err.coaching_cue || err.fix || '',
  }))

  return {
    title,
    category,
    equipment,
    movement,
    regions,
    primary,
    secondary,
    coachCues,
    commonErrors,
    learningGoal: lesson?.learning_goal?.detailed || movement.lesson,
    detailedMeaning: lesson?.trainer_explanation?.technical || movement.lesson,
    simpleMeaning: movement.pattern,
    feelCues: cleanList([
      movement.feel,
      ...(lesson?.feel_cues || []),
      primary[0] ? `Achte auf ${primary[0]}.` : '',
    ]),
    quiz: [
      {
        question: lesson?.quiz?.question || lesson?.quiz?.[0]?.question || movement.quiz,
        answer: lesson?.quiz?.answer || lesson?.quiz?.[0]?.answer || movement.lesson,
      },
    ],
    isRaw: !lesson,
    rawInstructions: movement.rawInstructions || [],
    rawDescription: movement.rawDescription || '',
  }
}

export function buildExerciseCoachSheet(ex) {
  const i = buildExerciseInsights(ex)
  const status = isUnreviewedExercise(ex) ? 'unreviewed' : i.isRaw ? 'imported' : 'reviewed'
  const lines = [
    `---`,
    `type: exercise-coach-sheet`,
    `exercise: ${JSON.stringify(i.title)}`,
    `category: ${JSON.stringify(i.category)}`,
    `status: ${status}`,
    `---`,
    `# ${i.title}`,
    ``,
    `## Was es lehrt`,
    `- ${i.learningGoal || 'Keine Original-Beschreibung vorhanden.'}`,
    ``,
    `## Setup`,
    `- Kategorie: ${i.category}`,
    `- Equipment: ${i.equipment}`,
    `- Body Regions: ${i.regions.join(', ')}`,
    ``,
    `## Muskeln`,
    `- Primär: ${i.primary.length ? i.primary.join(', ') : 'n/a'}`,
    `- Sekundär: ${i.secondary.length ? i.secondary.join(', ') : 'n/a'}`,
  ]

  if (i.isRaw) {
    lines.push(``, `## Original-Anleitung (ungeprüft)`)
    lines.push(...(i.rawInstructions.length ? i.rawInstructions.map(l => `- ${l}`) : [`- Keine Original-Anleitung vorhanden.`]))
    return lines.join('\n')
  }

  if (i.coachCues.length) {
    lines.push(``, `## Coaching Cues`, ...i.coachCues.map(c => `- ${c}`))
  }
  if (i.commonErrors.length) {
    lines.push(``, `## Fehlerbilder`, ...i.commonErrors.map(err => `- ${err.error}: ${err.anatomicalReason} -> ${err.correction}`))
  }
  if (i.quiz[0]?.question) {
    lines.push(``, `## Quiz`, `- ${i.quiz[0].question}`)
  }
  return lines.join('\n')
}

export function buildSessionCoachSheet(session) {
  const exercises = session?.exercises || []

  const rows = exercises.map(ex => `| ${ex.name || 'Übung'} | ${ex.sets ?? ''} | ${ex.reps ?? ''} | ${ex.weight ?? ''} | ${ex.note || ''} |`)

  return [
    `---`,
    `type: training-session`,
    `date: ${JSON.stringify(session?.date || '')}`,
    `block: ${JSON.stringify(session?.block || '')}`,
    `---`,
    `# Session ${session?.date || ''}`,
    ``,
    `## Summary`,
    `- Block: ${session?.block || 'n/a'}`,
    `- Effort: ${session?.effort ?? 'n/a'}`,
    `- Mood: ${session?.mood || 'n/a'}`,
    ``,
    `## Exercises`,
    `| Done | Exercise | Sets | Reps | Weight | Note |`,
    `| --- | --- | --- | --- | --- | --- |`,
    ...(rows.length ? rows : [`| - | - | - | - | - | - |`]),
    ``,
    `## Notes`,
    session?.notes ? session.notes : '-',
  ].join('\n')
}
