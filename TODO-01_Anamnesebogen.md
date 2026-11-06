Ja — analog zu FUEL würde ich in der Fitness-App daraus einen **Fitness Frame** machen: nicht bloß Profilfelder, sondern eine kompakte Trainingsanamnese, die den aktuellen körperlichen und trainingsbezogenen Ausgangszustand beschreibt.

Die Domains würde ich so aufbauen:

```text
FITNESS FRAME

01 Trainingsstatus
   → Wie trainiere ich aktuell?

02 Zielsetzung
   → Wohin soll sich Training entwickeln?

03 Körper & Belastbarkeit
   → Wie reagiert mein Körper aktuell?

04 Gesundheit & Einschränkungen
   → Welche Rahmenbedingungen muss Training respektieren?

05 Frame Review
   → Was funktioniert?
   → Was funktioniert nicht?
```

Daraus ergibt sich z. B. diese Komponente:

```jsx
import {
  Compass,
  ChevronDown,
  Dumbbell,
  Target,
  Activity,
  HeartPulse,
  ScanSearch,
} from "lucide-react";
import { useSettings } from "../../store.js";

const labelCls =
  "text-xs uppercase tracking-[0.18em] text-slate-500 mb-1 block";

const inputCls =
  "w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-slate-100";

function Domain({ icon: Icon, title, children }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-300">
        <Icon className="h-4 w-4 text-violet-300" />
        {title}
      </div>

      <div className="grid gap-3">
        {children}
      </div>
    </div>
  );
}

export default function FitnessMapFrame({ sectionCls, bare = false }) {
  const {
    // Trainingsstatus
    training_experience,
    training_frequency,
    training_type,
    activity_level,

    // Ziele
    fitness_goal,
    secondary_goal,

    // Körper & Belastbarkeit
    energy_level,
    recovery_quality,
    pain_notes,
    mobility_notes,

    // Gesundheit
    chronic_conditions,
    injuries,
    medications,
    medical_clearance_notes,

    // Frame Review
    training_working,
    training_not_working,

    setSetting,
  } = useSettings();

  return (
    <section className={bare ? "grid gap-4" : sectionCls}>
      <details className="group rounded-2xl border border-white/10">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3">
          <span className="flex items-center gap-2 text-lg font-semibold">
            <Compass className="h-5 w-5 text-amber-300" />
            Fitness Frame
          </span>

          <ChevronDown className="h-4 w-4 text-slate-500 transition-transform group-open:rotate-180" />
        </summary>

        <div className="grid gap-3 border-t border-white/10 p-4">

          {/* 1 — Trainingsstatus */}
          <Domain icon={Dumbbell} title="Trainingsstatus">
            <div>
              <label className={labelCls}>
                Trainingserfahrung
              </label>

              <select
                value={training_experience ?? ""}
                onChange={(e) =>
                  setSetting("training_experience", e.target.value)
                }
                className={inputCls}
              >
                <option value="">Keine Angabe</option>
                <option value="beginner">Einsteiger</option>
                <option value="returning">Wiedereinsteiger</option>
                <option value="intermediate">Fortgeschritten</option>
                <option value="advanced">Sehr erfahren</option>
              </select>
            </div>

            <div>
              <label className={labelCls}>
                Aktuelle Trainingshäufigkeit
              </label>

              <select
                value={training_frequency ?? ""}
                onChange={(e) =>
                  setSetting("training_frequency", e.target.value)
                }
                className={inputCls}
              >
                <option value="">Keine Angabe</option>
                <option value="none">Aktuell kein Training</option>
                <option value="1">1× pro Woche</option>
                <option value="2">2× pro Woche</option>
                <option value="3">3× pro Woche</option>
                <option value="4">4× pro Woche</option>
                <option value="5_plus">5× oder häufiger</option>
              </select>
            </div>

            <div>
              <label className={labelCls}>
                Aktuelle Trainingsform
              </label>

              <textarea
                rows={2}
                value={training_type ?? ""}
                placeholder="z.B. Krafttraining, Laufen, Calisthenics, Yoga, Vereinssport"
                onChange={(e) =>
                  setSetting("training_type", e.target.value)
                }
                className={inputCls}
              />
            </div>

            <div>
              <label className={labelCls}>
                Aktivitätsniveau im Alltag
              </label>

              <select
                value={activity_level ?? ""}
                onChange={(e) =>
                  setSetting("activity_level", e.target.value)
                }
                className={inputCls}
              >
                <option value="">Keine Angabe</option>
                <option value="low">Überwiegend sitzend</option>
                <option value="moderate">Mäßig aktiv</option>
                <option value="active">Aktiver Alltag</option>
                <option value="very_active">Körperlich sehr aktiv</option>
              </select>
            </div>
          </Domain>

          {/* 2 — Zielsetzung */}
          <Domain icon={Target} title="Zielsetzung">
            <div>
              <label className={labelCls}>
                Primäres Trainingsziel
              </label>

              <select
                value={fitness_goal ?? ""}
                onChange={(e) =>
                  setSetting("fitness_goal", e.target.value)
                }
                className={inputCls}
              >
                <option value="">Keine Angabe</option>
                <option value="strength">Kraft steigern</option>
                <option value="muscle">Muskelaufbau</option>
                <option value="fat_loss">Körperfett reduzieren</option>
                <option value="endurance">Ausdauer verbessern</option>
                <option value="mobility">Beweglichkeit verbessern</option>
                <option value="health">Gesundheit / Prävention</option>
                <option value="performance">Sportliche Leistung</option>
                <option value="daily_function">
                  Alltag belastbarer gestalten
                </option>
              </select>
            </div>

            <div>
              <label className={labelCls}>
                Weitere Ziele
              </label>

              <textarea
                rows={2}
                value={secondary_goal ?? ""}
                placeholder="z.B. schmerzfrei Kniebeugen, 10 Klimmzüge, bessere Haltung"
                onChange={(e) =>
                  setSetting("secondary_goal", e.target.value)
                }
                className={inputCls}
              />
            </div>
          </Domain>

          {/* 3 — Körper & Belastbarkeit */}
          <Domain icon={Activity} title="Körper & Belastbarkeit">
            <div>
              <label className={labelCls}>
                Energie / körperliche Leistungsfähigkeit
              </label>

              <select
                value={energy_level ?? ""}
                onChange={(e) =>
                  setSetting("energy_level", e.target.value)
                }
                className={inputCls}
              >
                <option value="">Keine Angabe</option>
                <option value="low">Eher niedrig</option>
                <option value="variable">Stark schwankend</option>
                <option value="good">Gut</option>
                <option value="high">Sehr gut</option>
              </select>
            </div>

            <div>
              <label className={labelCls}>
                Erholung zwischen Trainingseinheiten
              </label>

              <select
                value={recovery_quality ?? ""}
                onChange={(e) =>
                  setSetting("recovery_quality", e.target.value)
                }
                className={inputCls}
              >
                <option value="">Keine Angabe</option>
                <option value="poor">Schlecht</option>
                <option value="variable">Schwankend</option>
                <option value="good">Gut</option>
                <option value="very_good">Sehr gut</option>
              </select>
            </div>

            <div>
              <label className={labelCls}>
                Schmerzen / Beschwerden
              </label>

              <textarea
                rows={2}
                value={pain_notes ?? ""}
                placeholder="z.B. Schulter bei Überkopfbewegungen, Knie beim Treppensteigen"
                onChange={(e) =>
                  setSetting("pain_notes", e.target.value)
                }
                className={inputCls}
              />
            </div>

            <div>
              <label className={labelCls}>
                Beweglichkeit / Bewegungseinschränkungen
              </label>

              <textarea
                rows={2}
                value={mobility_notes ?? ""}
                placeholder="z.B. eingeschränkte Sprunggelenksmobilität, Probleme bei tiefer Kniebeuge"
                onChange={(e) =>
                  setSetting("mobility_notes", e.target.value)
                }
                className={inputCls}
              />
            </div>
          </Domain>

          {/* 4 — Gesundheit */}
          <Domain icon={HeartPulse} title="Gesundheit & Einschränkungen">
            <div>
              <label className={labelCls}>
                Chronische Erkrankungen
              </label>

              <textarea
                rows={2}
                value={chronic_conditions ?? ""}
                placeholder="z.B. Bluthochdruck, Diabetes, Asthma"
                onChange={(e) =>
                  setSetting("chronic_conditions", e.target.value)
                }
                className={inputCls}
              />
            </div>

            <div>
              <label className={labelCls}>
                Verletzungen / Operationen
              </label>

              <textarea
                rows={2}
                value={injuries ?? ""}
                placeholder="z.B. Kreuzbandverletzung 2022, Schulter-OP"
                onChange={(e) =>
                  setSetting("injuries", e.target.value)
                }
                className={inputCls}
              />
            </div>

            <div>
              <label className={labelCls}>
                Medikamente (trainingsrelevant)
              </label>

              <textarea
                rows={2}
                value={medications ?? ""}
                placeholder="z.B. Blutdruckmedikamente"
                onChange={(e) =>
                  setSetting("medications", e.target.value)
                }
                className={inputCls}
              />
            </div>

            <div>
              <label className={labelCls}>
                Ärztliche Hinweise / Freigaben
              </label>

              <textarea
                rows={2}
                value={medical_clearance_notes ?? ""}
                placeholder="z.B. Belastung freigegeben, keine Sprungbelastung empfohlen"
                onChange={(e) =>
                  setSetting(
                    "medical_clearance_notes",
                    e.target.value
                  )
                }
                className={inputCls}
              />
            </div>
          </Domain>

          {/* 5 — Frame Review */}
          <Domain icon={ScanSearch} title="Frame Review">
            <div>
              <label className={labelCls}>
                Was funktioniert aktuell gut?
              </label>

              <textarea
                rows={3}
                value={training_working ?? ""}
                placeholder="Welche Übungen, Routinen oder Trainingsformen funktionieren bereits?"
                onChange={(e) =>
                  setSetting("training_working", e.target.value)
                }
                className={inputCls}
              />
            </div>

            <div>
              <label className={labelCls}>
                Was funktioniert aktuell nicht?
              </label>

              <textarea
                rows={3}
                value={training_not_working ?? ""}
                placeholder="Wo entstehen Probleme, Abbrüche, Schmerzen oder Hindernisse?"
                onChange={(e) =>
                  setSetting(
                    "training_not_working",
                    e.target.value
                  )
                }
                className={inputCls}
              />
            </div>
          </Domain>

          <p className="text-xs text-slate-500">
            Alle Angaben sind optional und dienen als Kontext für
            Trainingsplanung und Coach-Auswertungen. Der Fitness Frame
            ersetzt keine medizinische Untersuchung oder Diagnose.
          </p>
        </div>
      </details>
    </section>
  );
}
```

Die entsprechenden Store-Felder:

```js
training_experience: "",
training_frequency: "",
training_type: "",
activity_level: "",

fitness_goal: "",
secondary_goal: "",

energy_level: "",
recovery_quality: "",
pain_notes: "",
mobility_notes: "",

chronic_conditions: "",
injuries: "",
medications: "",
medical_clearance_notes: "",

training_working: "",
training_not_working: "",
```

### Ein wichtiger Architekturpunkt

Ich würde auch hier **Profil und Frame strikt unterscheiden**.

Beständige Sachen können im Profil bleiben:

```text
height
birthdate
sex
preferred_units
```

Der Fitness Frame dagegen beschreibt einen **Zeitpunkt**:

```text
fitnessFrames/
├── frame_2026_07
├── frame_2026_09
└── frame_2026_12
```

Ein gespeicherter Frame könnte dann etwa so aussehen:

```js
{
  id: "frame_2026_07_30",
  createdAt,

  training: {
    experience: "intermediate",
    frequency: "3",
    type: "Krafttraining",
    activityLevel: "active",
  },

  goals: {
    primary: "strength",
    secondary: "10 saubere Klimmzüge",
  },

  readiness: {
    energy: "good",
    recovery: "variable",
    painNotes: "",
    mobilityNotes: "",
  },

  health: {
    chronicConditions: "",
    injuries: "",
    medications: "",
    medicalClearanceNotes: "",
  },

  review: {
    working: "",
    notWorking: "",
  },
}
```

Und dann wird es richtig interessant, weil die eigentlichen Fitness-Daten **zwischen zwei Frames** liegen:

```text
FITNESS FRAME 01
30.07.2026
│
├── Trainingsplan
├── 24 Workouts
├── Übungsperformance
├── Volumen
├── RPE
├── Körperdaten
├── Compliance
└── Beschwerden
│
▼
FITNESS FRAME 02
30.09.2026
```

Dann kann Coach später nicht nur sagen:

> „Du hast 24-mal trainiert.“

sondern:

```text
Ausgangslage
→ 2 Trainings/Woche
→ schwankende Erholung
→ Ziel Kraft

Intervention
→ 3-Tage-Plan
→ progressive Belastungssteuerung

Resultat
→ 22/24 Einheiten absolviert
→ Squat-Performance gestiegen
→ Erholung stabiler

Neuer Frame
→ nächster Trainingsblock
```

Das ist exakt die Verbindung, die ich bei beiden Apps machen würde:

```text
           ALPHAOS FRAME MAP
                  │
          "Wo stehe ich?"
                  │
       ┌──────────┴──────────┐
       ▼                     ▼

   FITNESS FRAME          FUEL FRAME
       │                     │
 Trainingsanamnese      Ernährungsanamnese
       │                     │
       ▼                     ▼
 Fitness Logs            Food Logs
       │                     │
       ▼                     ▼
 Performance              Nutrition
   Outcomes                Outcomes
       │                     │
       └──────────┬──────────┘
                  ▼
               REVIEW
                  │
                  ▼
              NEW FRAME
```

Und für deine Ausbildung ist der Fitness Frame sogar besonders passend: **Anamnese → Zieldefinition → Belastbarkeit/Einschränkungen → Trainingsplanung → Dokumentation → Evaluation** entspricht ziemlich genau der Denkweise, die du als Personal-/Fitnesstrainer später ohnehin brauchst. Der technische Aufbau deiner App wird damit gleichzeitig ein praktisches Modell des Trainerprozesses.
