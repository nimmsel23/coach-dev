# Vitaltrainer App - Screen Map

## Dashboard

### User Question

Was trainiere oder lerne ich heute?

### Needs from Agent

- last_generated_plan.yml
- weekly_coverage.yml
- learning_progress.yml
- recommended_next_action

### Actions

- Plan oeffnen
- Uebung suchen
- Wochenreport oeffnen
- Lernmodus oeffnen

---

## Exercise Browser

### User Question

Welche Uebung suche ich?

### Needs from Agent

- aliases.yml
- exercises/*.yml
- resolve(query)
- exercise lookup

### Actions

- Uebung oeffnen
- vergleichen
- zum Plan hinzufuegen
- Coach Sheet erstellen

---

## Exercise Meaning

### User Question

Was lehrt diese Uebung?

### Needs from Agent

- exercise YAML
- anatomy_teaching YAML
- muscle taxonomy
- body_highlighter bridge

### Sections

- Bewegungsmuster
- Gelenkaktionen
- Muskelrollen
- Feel Cues
- Fehlerbilder
- Coaching Cues
- Lernwert

---

## Plan Builder

### User Question

Welcher Plan passt zum Ziel?

### Needs from Agent

- program_rules.yml
- exercise library
- coverage calculator
- planner

### Actions

- Template waehlen
- Ziel waehlen
- Plan generieren
- Uebung austauschen
- Coverage pruefen
- Plan exportieren

---

## Weekly Review

### User Question

Was habe ich diese Woche trainiert und gelernt?

### Needs from Agent

- training_history.sqlite
- weekly_coverage.yml
- learning_progress.yml
- coverage engine
- anatomy coverage

### Sections

- Workouts
- Muscle Coverage
- untertrainierte Regionen
- ueberbetonte Regionen
- Lernpunkte
- Empfehlungen
