Dem Agent würde ich nicht nur YAMLs geben, sondern eine **klare Mission + harte Prinzipien + Datenvertrag**. Sonst baut er dir am Ende wieder irgendein wger-Wiki mit schönerem Namen.

Hier ist, was ich ihm mitgeben würde:

````markdown
# Fitness Agent – Core Brief

## Mission

Du bist ein lokaler Fitness-Agent, der eine eigene YAML-basierte Exercise Library nutzt, um bessere Trainingspläne, Übungslogik, Coaching-Hinweise und Progressionen zu erzeugen.

wger ist nicht die primäre Exercise Intelligence.  
wger ist lokales Backend für Tracking, Logs, Routinen und ggf. UI.

Die eigene YAML-Library ist die semantische Source of Truth.

---

## Systemrollen

### 1. YAML Exercise Library
Enthält:
- Übungs-IDs
- deutsche und englische Namen
- Muskelgruppen
- Bewegungsmuster
- Equipment
- Variationen
- Coaching Notes
- häufige Fehler
- Tags
- Schwierigkeit / Ziel optional

### 2. Exercise Inbox (Staging Area)
- Empfängt neue Übungsanfragen von Klienten.
- Speichert KI-angereicherte Drafts (`inbox_*.yml`).
- Dient als Puffer für biomechanische Audits (anatomy-kb).

### 3. aliases.yml
Löst freie Nutzereingaben auf canonical exercise IDs auf.

Beispiel:
"schrägbank kh" → incline_dumbbell_press

### 3. program_rules.yml
Definiert:
- Push/Pull/Legs
- Upper/Lower
- Übungsreihenfolge
- Satz-/Wiederholungsbereiche
- RPE
- Pausen
- Progressionslogik
- Safety Constraints

### 4. wger_mapping.yml
Mappt eigene Exercise IDs auf wger Exercise IDs.

Wenn kein guter Match existiert:
- nutze fallback_name
- exportiere als Custom Exercise
- oder belasse die Übung in der lokalen Agent-Library

### 5. wger
Wird verwendet für:
- Trainingspläne speichern
- Workouts loggen
- Historie abrufen
- Sets/Reps/Gewichte speichern
- Fortschritt verfolgen

wger wird nicht blind als Wissensquelle vertraut.

---

## Harte Prinzipien

1. Eigene Exercise IDs sind wichtiger als wger IDs.
2. Freitext wird immer zuerst über aliases.yml normalisiert.
3. Übungsauswahl folgt program_rules.yml.
4. Keine zufällige Übungsauswahl ohne Bewegungsmuster-Logik.
5. Compound Lifts kommen vor Isolationsübungen.
6. Ermüdungsmanagement ist Teil der Planung.
7. Progression erfolgt über nachvollziehbare Regeln.
8. Schulter-, Knie- und Rückenhinweise beeinflussen die Übungsauswahl.
9. Obsidian-Export bleibt immer möglich.
10. Jede generierte Einheit muss erklärbar sein.

---

## Canonical Flow

User Input (New Exercise)
→ AI Enrichment
→ Exercise Inbox (Draft)
→ Manual Review / Audit
→ Approval
→ Exercise KB (Canonical ID)
→ wger mapping / Obsidian export

User Input (Workout)
→ alias resolver
→ canonical exercise_id
→ exercise YAML lookup
→ program_rules lookup
→ workout generation
→ wger mapping
→ export/logging
→ history update
→ progression recommendation

---

## Output Targets

Der Agent soll dieselben Daten in verschiedene Formate ausgeben können:

- YAML
- JSON
- Markdown für Obsidian
- wger Routine Payload
- einfache CLI-Ansicht
- Trainingslog

---

## Beispiel: Workout Output Schema

```yaml
workout:
  id: "push_2026_05_09"
  name: "Push Day"
  goal: "hypertrophy"
  source: "custom_yaml_library"
  export_targets:
    - obsidian
    - wger

  exercises:
    - order: 1
      exercise_id: incline_dumbbell_press
      display_name: "Schrägbankdrücken mit Kurzhanteln"
      wger_id: null
      sets: 3
      reps: "6-10"
      rpe: "8"
      rest_seconds: 120
      notes:
        - "Oberer Brustfokus."
        - "Schultern tief, Brust hoch."

    - order: 2
      exercise_id: dips_chest
      display_name: "Brust-Dips"
      wger_id: null
      sets: 2
      reps: "8-12"
      rpe: "8"
      rest_seconds: 120
      notes:
        - "Leichte Vorneigung."
        - "Nur schmerzfreie Tiefe."

    - order: 3
      exercise_id: lateral_raise
      display_name: "Seitheben"
      wger_id: null
      sets: 2
      reps: "12-20"
      rpe: "9"
      rest_seconds: 60
      notes:
        - "Kein Schwung."
        - "Nacken bleibt ruhig."
````

---

# Agent Behavior Rules

## Exercise Matching

Wenn der User eine Übung nennt:

1. Prüfe exakte ID.
2. Prüfe aliases.yml.
3. Prüfe deutsche Namen.
4. Prüfe englische Namen.
5. Prüfe fuzzy matching.
6. Wenn weiterhin unklar: gib 2–3 wahrscheinlichste Treffer aus.

Beispiel:

User: "kh schrägbank"

Agent:

* matched_alias: "kh schrägbank"
* canonical_id: incline_dumbbell_press
* confidence: high

---

## wger Matching

Beim Export zu wger:

1. Prüfe wger_mapping.yml.
2. Wenn `wger_id` existiert, nutze diese.
3. Wenn `status: needs_lookup`, suche lokal in wger.
4. Wenn guter Match gefunden wird, aktualisiere wger_mapping.yml.
5. Wenn kein guter Match gefunden wird, nutze custom exercise fallback.
6. Niemals eigene Exercise ID durch wger ID ersetzen.

---

## Program Generation Rules

Ein Trainingsplan muss immer enthalten:

* Ziel
* Split
* Übungen
* Sätze
* Wiederholungen
* RPE oder RIR
* Pausen
* Reihenfolge
* kurze Begründung
* Progressionsregel

---

## Minimal Reasoning per Workout

Der Agent soll bei jeder Einheit intern prüfen:

* Ist mindestens ein Hauptbewegungsmuster enthalten?
* Gibt es unnötige Redundanz?
* Ist die Ermüdung zu hoch?
* Ist die Übungsreihenfolge sinnvoll?
* Gibt es Schulter-/Knie-/Rückenrisiko?
* Ist die Einheit in 45–75 Minuten machbar?
* Passt die Einheit zum Split?

---

## Redundanzregeln

Nicht zu viele fast gleiche Übungen in einer Einheit.

Schlecht:

* Bench Press
* Dumbbell Bench Press
* Machine Chest Press
* Push-Ups
* Dips

Besser:

* Incline Dumbbell Press
* Dips
* Cable Fly
* Lateral Raise
* Overhead Triceps Extension

---

## Fatigue Rules

### High Fatigue

Nur 1–2 pro Einheit:

* heavy deadlift
* heavy squat
* heavy barbell row
* heavy overhead press
* weighted pull-up
* weighted dip

### Low Fatigue Fillers

Gut am Ende:

* cable fly
* lateral raise
* rear delt fly
* face pull
* cable pushdown
* cable curl
* leg curl
* leg extension
* calf raise
* pallof press

---

## Progression Logic

Standard: Double Progression.

Beispiel:

```text
3x8-12
Wenn alle 3 Sätze mit 12 Wdh sauber bei Ziel-RPE geschafft werden:
→ Gewicht nächstes Mal leicht erhöhen.
Wenn nur 8-10 Wdh:
→ Gewicht behalten.
Wenn Technik bricht:
→ Gewicht reduzieren oder Satzanzahl senken.
```

---

## Recovery Adjustment

Wenn Recovery schlecht:

* Satzanzahl um 20–40 % reduzieren
* keine neuen PRs
* keine Failure-Sets
* Maschinen/Cables bevorzugen
* schwere Hinge-/Squat-Kombination vermeiden

Wenn Recovery gut:

* gleiche Übungen behalten
* kleine Steigerung bei Gewicht oder Reps
* nicht alles gleichzeitig erhöhen

---

## Safety Constraints

Der Agent darf niemals blind maximal schwere Übungen empfehlen.

Bei Schulterproblemen:
bevorzugen:

* machine chest press
* dumbbell press neutral grip
* cable fly leicht
* landmine press
* face pull

vorsichtig:

* tiefe Dips
* sehr weites Bankdrücken
* behind-neck pulldown

Bei Rückenproblemen:
bevorzugen:

* chest supported row
* leg press
* split squat
* hip thrust
* leg curl

vorsichtig:

* heavy deadlift
* heavy barbell row
* good morning
* back squat nahe Failure

Bei Knieproblemen:
bevorzugen:

* reverse lunge
* box squat
* leg press kontrolliert
* hip thrust
* RDL

vorsichtig:

* tiefe explosive Lunges
* Jump Squats
* hohe Volumen mit Leg Extension

---

# Obsidian Export Rules

Jeder Plan soll als Markdown exportierbar sein:

```markdown
# Push Day – Hypertrophy

## Ziel
Brust, Schulter, Trizeps mit Fokus auf Muskelaufbau.

## Übungen

| # | Übung | Sätze | Wdh | RPE | Pause |
|---|------|------|-----|-----|-------|
| 1 | Schrägbankdrücken KH | 3 | 6-10 | 8 | 120s |
| 2 | Brust-Dips | 2 | 8-12 | 8 | 120s |
| 3 | Seitheben | 2 | 12-20 | 9 | 60s |
| 4 | Cable Fly | 2 | 12-20 | 9 | 60s |
| 5 | Overhead Triceps Extension | 2 | 10-15 | 8-9 | 60s |

## Progression
Wenn obere Wiederholungsgrenze in allen Sätzen erreicht wird, Gewicht leicht erhöhen.

## Notes
- Keine Schmerzen in Schulter/Ellenbogen erzwingen.
- Technik vor Gewicht.
```

---

# Data Ownership

Die lokale YAML-Library ist Eigentum des Users.

Der Agent darf:

* Mapping-Dateien aktualisieren
* neue Aliase vorschlagen
* neue Übungen als Draft anlegen
* Trainingshistorie speichern
* wger IDs ergänzen

Der Agent darf nicht:

* eigene IDs ungefragt löschen
* wger Daten als primäre Wahrheit behandeln
* bestehende YAML-Struktur ohne Backup überschreiben
* Trainingshistorie verlieren

````

Und dann würde ich ihm noch eine **konkrete Prioritätenliste** geben:

```yaml
agent_priorities:
  - "Preserve custom exercise semantics."
  - "Make workout generation explainable."
  - "Prefer stable IDs over display names."
  - "Use wger as backend, not as brain."
  - "Keep Obsidian export clean."
  - "Keep training plans simple enough to execute."
  - "Track progression before adding novelty."
  - "Protect joints and recovery."
  - "Prefer consistency over complexity."
````

Der wichtigste Satz für den Agenten wäre:

> **“wger is the database; the YAML library is the coach brain.”**

Damit ist die Richtung dingfest.

----

bei wger gehts auch darum dass ich in der app ein muscle coverage (body-highlighter) nutze und die exercise db von wger (habe auch noch eine andere ohne backend nur db von github die sehr bekannt und populär ist, irgendwas mit y am namemanfang, die sollte man wohl parallel nutzen)
also die exercise db kennzeichnet die muskeln die genutzt wurden. 

---

Ja — dann ist die Sache noch klarer:

Du brauchst nicht nur eine **Exercise Library**, sondern eine **Muscle Coverage Engine**.

Und die GitHub-DB mit „y“ am Anfang ist sehr wahrscheinlich **`yuhonas/free-exercise-db`**. Die ist eine Open-Public-Domain Exercise-Dataset in JSON-Format mit 800+ Übungen und Bildern/Frontend. ([GitHub][1]) wger selbst ist eine freie Open-Source-Webapp für Workouts, Gewicht und Ernährung und bietet eine REST API, wodurch sie als lokales Backend gut in so ein Bridge-System passt. ([wger.readthedocs.io][2])

Der richtige Move wäre:

```text
wger / yuhonas DB = Rohdaten + Muscle Tags + App-Integration
deine YAMLs       = bessere semantische Coach-Logik
Agent            = Mapper + Normalizer + Coverage Engine
Body Highlighter = Visualisierung der Coverage
```

## Was der Agent zusätzlich braucht

Er braucht eine zentrale Muskel-Taxonomie. Sonst sagt eine DB `chest`, die andere `pectoralis_major`, die dritte `Pecs`, und dein Body-Highlighter weiß nicht sauber, was gemeint ist.

## `muscles.yml`

```yaml
muscle_taxonomy:
  version: "0.1.0"
  language: "de"

  muscle_groups:
    chest:
      label_de: "Brust"
      label_en: "Chest"
      aliases:
        - chest
        - pecs
        - pectorals
        - pectoralis
        - pectoralis_major
        - brust
        - brustmuskel
      body_highlight_region:
        - chest_front
      submuscles:
        - pectoralis_major_clavicular
        - pectoralis_major_sternal
        - pectoralis_major_costal
        - pectoralis_minor

    back:
      label_de: "Rücken"
      label_en: "Back"
      aliases:
        - back
        - upper_back
        - middle_back
        - lats
        - latissimus
        - latissimus_dorsi
        - rhomboids
        - traps
        - trapezius
        - rücken
      body_highlight_region:
        - upper_back
        - mid_back
        - lats
      submuscles:
        - latissimus_dorsi
        - trapezius_upper
        - trapezius_middle
        - trapezius_lower
        - rhomboids
        - teres_major
        - rear_deltoid
        - spinal_erectors

    shoulders:
      label_de: "Schultern"
      label_en: "Shoulders"
      aliases:
        - shoulders
        - delts
        - deltoids
        - deltoideus
        - schulter
        - schultern
      body_highlight_region:
        - shoulders_front
        - shoulders_side
        - shoulders_rear
      submuscles:
        - anterior_deltoid
        - lateral_deltoid
        - rear_deltoid
        - rotator_cuff

    biceps:
      label_de: "Bizeps"
      label_en: "Biceps"
      aliases:
        - biceps
        - biceps_brachii
        - armbeuger
        - bizeps
      body_highlight_region:
        - upper_arm_front
      submuscles:
        - biceps_brachii
        - brachialis
        - brachioradialis

    triceps:
      label_de: "Trizeps"
      label_en: "Triceps"
      aliases:
        - triceps
        - triceps_brachii
        - armstrecker
        - trizeps
      body_highlight_region:
        - upper_arm_back
      submuscles:
        - triceps_long_head
        - triceps_lateral_head
        - triceps_medial_head

    forearms:
      label_de: "Unterarme"
      label_en: "Forearms"
      aliases:
        - forearms
        - grip
        - unterarme
        - griffkraft
      body_highlight_region:
        - forearms
      submuscles:
        - wrist_flexors
        - wrist_extensors
        - brachioradialis

    abs:
      label_de: "Bauch"
      label_en: "Abs"
      aliases:
        - abs
        - abdominals
        - core
        - rectus_abdominis
        - bauch
        - rumpf
      body_highlight_region:
        - abdomen_front
      submuscles:
        - rectus_abdominis
        - transverse_abdominis
        - obliques

    lower_back:
      label_de: "Unterer Rücken"
      label_en: "Lower Back"
      aliases:
        - lower_back
        - spinal_erectors
        - erector_spinae
        - unterer_rücken
        - rückenstrecker
      body_highlight_region:
        - lower_back
      submuscles:
        - spinal_erectors
        - quadratus_lumborum

    quads:
      label_de: "Quadrizeps"
      label_en: "Quadriceps"
      aliases:
        - quads
        - quadriceps
        - quadrizeps
        - vorderer_oberschenkel
      body_highlight_region:
        - thigh_front
      submuscles:
        - rectus_femoris
        - vastus_lateralis
        - vastus_medialis
        - vastus_intermedius

    hamstrings:
      label_de: "Hamstrings"
      label_en: "Hamstrings"
      aliases:
        - hamstrings
        - hamstring
        - beinbeuger
        - hinterer_oberschenkel
      body_highlight_region:
        - thigh_back
      submuscles:
        - biceps_femoris
        - semitendinosus
        - semimembranosus

    glutes:
      label_de: "Gesäß"
      label_en: "Glutes"
      aliases:
        - glutes
        - gluteus
        - gluteus_maximus
        - gesäß
        - po
      body_highlight_region:
        - glutes
      submuscles:
        - gluteus_maximus
        - gluteus_medius
        - gluteus_minimus

    adductors:
      label_de: "Adduktoren"
      label_en: "Adductors"
      aliases:
        - adductors
        - inner_thigh
        - adduktoren
        - innenschenkel
      body_highlight_region:
        - thigh_inner
      submuscles:
        - adductor_magnus
        - adductor_longus
        - adductor_brevis
        - gracilis

    calves:
      label_de: "Waden"
      label_en: "Calves"
      aliases:
        - calves
        - calf
        - waden
        - gastrocnemius
        - soleus
      body_highlight_region:
        - calves
      submuscles:
        - gastrocnemius
        - soleus
```

Dann braucht der Agent eine **Coverage-Gewichtung**, weil nicht jeder beteiligte Muskel gleich stark zählt.

## `muscle_coverage_rules.yml`

```yaml
muscle_coverage_rules:
  version: "0.1.0"

  intensity_weights:
    primary: 1.0
    secondary: 0.5
    stabilizer: 0.2
    minor: 0.1

  set_weighting:
    description: "Coverage contribution per performed set."
    formula: "coverage_score = sets * muscle_role_weight * effort_factor"

  effort_factor_by_rpe:
    "6": 0.6
    "7": 0.75
    "8": 0.9
    "9": 1.0
    "10": 1.05

  default_role_mapping:
    primary_muscles: primary
    secondary_muscles: secondary
    stabilizers: stabilizer

  body_highlighter:
    mode: "weighted_heatmap"
    scale:
      none: 0
      low: "0.1-2.9"
      moderate: "3.0-5.9"
      high: "6.0-9.9"
      very_high: "10+"

    display_rules:
      - "Primary muscles receive strongest highlight."
      - "Secondary muscles receive medium highlight."
      - "Stabilizers receive light highlight unless accumulated across many exercises."
      - "Untrained muscles remain unhighlighted."
      - "If two sources disagree, prefer custom_yaml over external database."

  weekly_targets:
    hypertrophy:
      chest: "8-16"
      back: "10-20"
      shoulders: "8-18"
      biceps: "6-14"
      triceps: "6-14"
      quads: "8-18"
      hamstrings: "6-16"
      glutes: "8-18"
      calves: "6-16"
      abs: "4-12"

    strength_hypertrophy:
      chest: "6-12"
      back: "8-16"
      shoulders: "6-14"
      biceps: "4-10"
      triceps: "4-10"
      quads: "6-14"
      hamstrings: "5-12"
      glutes: "6-14"
      calves: "4-12"
      abs: "3-10"
```

## Dann die Datenquellen-Priorität

Das ist wichtig, weil wger, yuhonas und deine YAMLs nicht immer gleich taggen werden.

## `data_source_priority.yml`

```yaml
data_sources:
  version: "0.1.0"

  priority_order:
    - custom_yaml
    - manual_user_override
    - wger_local
    - yuhonas_free_exercise_db
    - fallback_inference

  source_roles:
    custom_yaml:
      role: "semantic_source_of_truth"
      use_for:
        - canonical_exercise_id
        - coaching_notes
        - movement_pattern
        - primary_muscles
        - secondary_muscles
        - stabilizers
        - programming_logic

    wger_local:
      role: "tracking_backend_and_app_bridge"
      use_for:
        - exercise_logs
        - routine_storage
        - app_body_highlighter_if_available
        - local_user_history
        - workout_execution

    yuhonas_free_exercise_db:
      role: "external_exercise_media_and_raw_muscle_tags"
      use_for:
        - images
        - additional exercise variants
        - alternative names
        - muscle tag comparison
        - fallback lookup

    fallback_inference:
      role: "last_resort"
      use_for:
        - estimating muscle groups if no source contains mapping
      warning: "Mark inferred mappings as unverified."

  conflict_resolution:
    muscle_mapping:
      rule: "custom_yaml wins unless manually overridden"
    display_name:
      rule: "prefer German custom name for user display"
    media:
      rule: "prefer local/media source with known license"
    wger_id:
      rule: "store as external reference, never replace canonical_id"
```

## Und jetzt der eigentliche Body-Highlighter Bridge Layer

## `body_highlighter_bridge.yml`

```yaml
body_highlighter_bridge:
  version: "0.1.0"

  canonical_regions:
    chest_front:
      label_de: "Brust"
      muscles:
        - pectoralis_major
        - upper_pectoralis_major
        - lower_pectoralis_major

    shoulders_front:
      label_de: "Vordere Schulter"
      muscles:
        - anterior_deltoid

    shoulders_side:
      label_de: "Seitliche Schulter"
      muscles:
        - lateral_deltoid

    shoulders_rear:
      label_de: "Hintere Schulter"
      muscles:
        - rear_deltoid

    upper_arm_front:
      label_de: "Bizeps / Armbeuger"
      muscles:
        - biceps_brachii
        - brachialis

    upper_arm_back:
      label_de: "Trizeps / Armstrecker"
      muscles:
        - triceps_brachii
        - triceps_long_head
        - triceps_lateral_head
        - triceps_medial_head

    forearms:
      label_de: "Unterarme"
      muscles:
        - brachioradialis
        - wrist_flexors
        - wrist_extensors

    lats:
      label_de: "Latissimus"
      muscles:
        - latissimus_dorsi
        - teres_major

    upper_back:
      label_de: "Oberer Rücken"
      muscles:
        - trapezius
        - rhomboids
        - rear_deltoid

    lower_back:
      label_de: "Unterer Rücken"
      muscles:
        - spinal_erectors
        - quadratus_lumborum

    abdomen_front:
      label_de: "Bauch"
      muscles:
        - rectus_abdominis
        - transverse_abdominis

    obliques:
      label_de: "Seitliche Bauchmuskeln"
      muscles:
        - obliques

    glutes:
      label_de: "Gesäß"
      muscles:
        - gluteus_maximus
        - gluteus_medius
        - gluteus_minimus

    thigh_front:
      label_de: "Vorderer Oberschenkel"
      muscles:
        - quadriceps
        - rectus_femoris
        - vastus_lateralis
        - vastus_medialis
        - vastus_intermedius

    thigh_back:
      label_de: "Hinterer Oberschenkel"
      muscles:
        - hamstrings
        - biceps_femoris
        - semitendinosus
        - semimembranosus

    thigh_inner:
      label_de: "Innenschenkel"
      muscles:
        - adductors
        - adductor_magnus
        - adductor_longus
        - adductor_brevis

    calves:
      label_de: "Waden"
      muscles:
        - gastrocnemius
        - soleus

  output_format:
    exercise_coverage:
      fields:
        - exercise_id
        - display_name
        - regions
        - muscles
        - source
        - confidence

    workout_coverage:
      fields:
        - workout_id
        - total_sets
        - region_scores
        - muscle_scores
        - missing_regions
        - overemphasized_regions
```

## Beispiel: eine Übung als Coverage-Objekt

So sollte dein Agent am Ende für den Body-Highlighter denken:

```yaml
exercise_coverage:
  exercise_id: incline_dumbbell_press
  display_name: "Schrägbankdrücken mit Kurzhanteln"
  source: "custom_yaml"
  confidence: "high"

  muscles:
    upper_pectoralis_major:
      role: primary
      weight: 1.0
    anterior_deltoid:
      role: secondary
      weight: 0.5
    triceps_brachii:
      role: secondary
      weight: 0.5
    serratus_anterior:
      role: stabilizer
      weight: 0.2

  body_regions:
    chest_front:
      score: 1.0
    shoulders_front:
      score: 0.5
    upper_arm_back:
      score: 0.5
```

## Beispiel: Workout-Coverage

```yaml
workout_coverage:
  workout_id: "push_day_2026_05_09"
  total_sets: 11

  region_scores:
    chest_front: 7.0
    shoulders_front: 4.0
    shoulders_side: 2.0
    upper_arm_back: 4.5

  missing_regions:
    - back
    - legs
    - calves
    - abs

  overemphasized_regions: []

  interpretation:
    - "Guter Brust- und Trizeps-Fokus."
    - "Seitliche Schulter wurde leicht abgedeckt."
    - "Kein Rücken/Core-Anteil, passend für reinen Push Day."
```

## Der entscheidende Satz für deinen Agenten

```text
Do not merely ask “which muscles does this exercise use?”
Ask: “Which body-highlighter regions should receive how much weighted coverage from this exercise, based on role, sets, effort and source confidence?”
```

Das ist der Unterschied zwischen einer Exercise DB und einem echten Fitness-Coach-System.

Also ja: **wger + yuhonas/free-exercise-db + deine YAMLs** ist genau der richtige Stack.

Aber:
Deine YAMLs sollten die **Wahrheit für Trainingslogik** bleiben.
wger/yuhonas liefern **IDs, Medien, Roh-Muskel-Tags und App-Kompatibilität**.
Der Agent baut daraus die **Coverage Map**.

[1]: https://github.com/yuhonas/free-exercise-db?utm_source=chatgpt.com "yuhonas/free-exercise-db: Open Public Domain ..."
[2]: https://wger.readthedocs.io/en/2.0/?utm_source=chatgpt.com "wger Workout Manager 2.0 alpha documentation"
