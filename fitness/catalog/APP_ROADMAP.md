# Vitaltrainer App Roadmap

Diese Datei beschreibt das Produkt auf App-Ebene.

Sie ersetzt nicht `ROADMAP.md`, sondern liegt darüber:

- `ROADMAP.md` = Agenten-, Engine- und Infrastruktur-Roadmap
- `APP_ROADMAP.md` = Produkt-, Workflow- und Nutzererlebnis-Roadmap

## 1. Produktvision

Die Vitaltrainer App ist ein lokales Lern- und Praxiswerkzeug für Training, Anatomie, Coaching und Dokumentation.

Sie hilft dabei, Übungen nicht nur auszuführen oder zu planen, sondern zu verstehen:

- Was trainiere ich?
- Was bewegt sich?
- Welche Muskeln arbeiten?
- Was soll ich spüren?
- Welche Fehler passieren?
- Wie coache ich das?
- Was lerne ich daraus?
- Wie dokumentiere ich es?

## 2. Rollenverteilung

- Vitaltrainer App = Benutzeroberfläche, Workflows, Lern- und Trainingserlebnis
- fitness-agent = lokale Engine für Resolver, Planner, Coverage, Teaching, Export
- YAML Library = semantische Wahrheit für Übungen, Muskeln, Coaching und Anatomie
- SQLite = lokaler State, Logs, Lernfortschritt, Historie
- wger = optionales Tracking-Backend und externe Fitnessdatenbank
- Obsidian = Langzeitgedächtnis, Lernarchiv, Notizsystem

## 3. App-Kern

Train the body.
Learn the body.
Coach the body.
Document the process.

Die App hat vier Hauptmodi:

- Training Mode: planen, ausführen, loggen
- Learning Mode: Anatomie verstehen, Quiz, Lernfortschritt
- Coaching Mode: Cues, Fehlerbilder, Coach Sheets, Klientensprache
- Review Mode: Coverage, Wochenreport, Fortschritt, Lücken

## 4. Hauptscreens

### 4.1 Dashboard

Frage:

- Was steht heute an?

Inhalte:

- heutiger Trainingsvorschlag
- letzter Trainingsstand
- offene Lernpunkte
- untertrainierte Regionen
- nächste empfohlene Übung
- Schnellaktionen

Beispielkarten:

- Heute empfohlen: Push Day - Hypertrophy
- Lernfokus: Schulterblattkontrolle bei Dips
- Coverage-Hinweis: Hamstrings diese Woche niedrig
- Nächste Aktion: Plan starten / Lesson ansehen / Wochenreport öffnen

### 4.2 Exercise Browser

Frage:

- Welche Übung ist das und was bedeutet sie?

Funktionen:

- Übung suchen
- Aliases auflösen
- nach Muskelgruppe filtern
- nach Bewegungsmuster filtern
- nach Equipment filtern
- Übungskarte öffnen

Übungskarte:

- Name deutsch/englisch
- Kategorie
- Equipment
- Bewegungsmuster
- primäre Muskeln
- sekundäre Muskeln
- Stabilisatoren
- Body-Highlighter-Regionen
- Coaching Cues
- häufige Fehler
- Variationen
- Buttons:
  - Warum diese Übung?
  - Anatomie lernen
  - Mit anderer Übung vergleichen
  - Zum Plan hinzufügen
  - Coach Sheet erstellen

### 4.3 Exercise Meaning View

Frage:

- Was lehrt diese Übung?

Beispiel `Dips`:

1. Drücken mit Körpergewicht
2. Brust-/Trizeps-Fokus durch Körperposition
3. Schulterblattkontrolle unter Last
4. sichere ROM-Grenzen
5. typisches Schulterdumping erkennen

Abschnitte:

- Bewegungsmuster
- Gelenkaktionen
- Muskelrollen
- Körpergefühl
- häufige Fehler
- anatomischer Grund
- einfache Coaching-Sprache
- Lernwert für Vitaltrainer

### 4.4 Body Highlighter

Frage:

- Welche Körperregionen werden belastet?

Ansichten:

- pro Übung
- pro Workout
- pro Woche
- pro Plan

Modi:

- Muscle Coverage
- Anatomy Coverage
- Coaching Coverage

Beispiel:

- Workout: Push Day
- High: Brust vorne, Trizeps
- Moderate: vordere Schulter
- Low: Core
- Learning Coverage: horizontales Drücken, Ellenbogenextension, Schulterblattkontrolle

### 4.5 Plan Builder

Frage:

- Wie baue ich einen sinnvollen Plan?

Funktionen:

- Template wählen: Push, Pull, Legs, Upper, Lower
- Ziel wählen: Hypertrophy, Strength, Beginner, Technique
- Übungen vorschlagen
- Alternativen anzeigen
- Coverage live anzeigen
- Planqualität prüfen

Wichtig: Der Plan Builder soll nicht nur Übungen ausspucken, sondern begründen.

Beispiel:

- Incline Dumbbell Press
  - deckt obere Brust/vordere Schulter ab
  - ergänzt Dips durch anderen Winkel
  - gute Hypertrophie-Übung
  - lehrt Winkelabhängigkeit beim Drücken

### 4.6 Plan Review

Frage:

- Ist dieser Plan sinnvoll?

Checks:

- Bewegungsmuster vollständig?
- Muskelgruppen ausgewogen?
- zu viel Redundanz?
- Schulter/Trizeps zu dominant?
- Pull/Push-Balance?
- Beine: Squat + Hinge + unilateral?
- Core vergessen?
- Coverage-Lücken?
- didaktischer Wert?

Beispielausgabe:

- [OK] Horizontales Drücken vorhanden
- [OK] Vertikales/Schräges Drücken vorhanden
- [WARN] Vordere Schulter hoch belastet
- [WARN] Kein direkter Serratus-/Scapula-Fokus
- [OK] Trizeps ausreichend abgedeckt

Didaktischer Wert:

Diese Einheit lehrt Drückmechanik, Schulterblattkontrolle und Ellenbogenextension.

### 4.7 Anatomy Lesson View

Frage:

- Wie verstehe ich diese Übung anatomisch?

Modi:

- Quick
- Trainer
- Anatomy
- Client

Abschnitte:

- Lernziel
- Bewegung
- Gelenkaktionen
- Muskelrollen
- Stabilisatoren
- Feel Cues
- Coaching Cues
- Fehlerbilder
- Quiz

### 4.8 Coach Sheet Generator

Frage:

- Wie coache ich diese Übung praktisch?

Output:

- Ziel der Übung
- Setup
- Ausführung
- 3-5 Coaching Cues
- häufige Fehler
- Korrekturen
- Regressionen
- Progressionen
- einfache Klientensprache
- Video-Skript

### 4.9 Training Log

Frage:

- Was habe ich gemacht?

Felder:

- Datum
- Workout
- Übung
- Sätze
- Wiederholungen
- Gewicht
- RPE/RIR
- Schmerz
- Notizen
- Technikstatus

Zusatznutzen:

- Muscle Coverage aktualisieren
- Weekly Coverage aktualisieren
- Progression aktualisieren
- Lernfortschritt aktualisieren

### 4.10 Weekly Review

Frage:

- Was habe ich diese Woche trainiert und gelernt?

Inhalte:

- absolvierte Workouts
- Volumen
- Progression
- Schmerzen oder Probleme
- gut abgedeckte Regionen
- untertrainierte Regionen
- überbetonte Regionen
- gelernte Bewegungsmuster
- geübte Gelenkaktionen
- offene Themen
- nächste Empfehlungen

## 5. App-Roadmap

### Phase 1 - Local App Shell

Ziel:

- Eine lokale App-Oberfläche, die den vorhandenen Agent-Kern sichtbar macht.

Minimal:

- Dashboard
- Navigation
- Exercise Search
- Plan anzeigen
- Coverage anzeigen

### Phase 2 - Exercise Browser

Ziel:

- Übungen durchsuchbar und verständlich machen.

Features:

- Suche über Aliases
- Übungsliste
- Übungskarte
- Muskelrollen
- Coaching Notes
- Common Errors

Backend:

- `fitness-agent resolve`
- Exercise Loader
- YAML Library

### Phase 3 - Body Highlighter View

Ziel:

- Coverage visuell begreifbar machen.

Features:

- Übung -> Körperregionen
- Workout -> Körperregionen
- Woche -> Körperregionen
- Intensitätsstufen

Backend:

- Coverage Engine
- Body-Highlighter Payload

### Phase 4 - Plan Builder

Ziel:

- Trainingspläne erstellen und begründen.

Features:

- Push/Pull/Legs Templates
- Zielauswahl
- Übungen austauschen
- Coverage live prüfen
- Plan speichern

### Phase 5 - Anatomy Learning Mode

Ziel:

- Übungen als Anatomie-Lektionen darstellen.

Features:

- Trainer Mode
- Client Mode
- Joint Actions
- Muscle Roles
- Fehlerbilder
- Quizfragen

### Phase 6 - Coach Sheet View

Ziel:

- Aus Übungswissen praktische Coaching-Unterlagen erzeugen.

Features:

- Coach Sheet pro Übung
- Video-Skript
- Fehlerbild-Spickzettel
- Obsidian Export

### Phase 7 - Training Log

Ziel:

- Training lokal dokumentieren.

Features:

- Workout starten
- Sets/Reps/Gewicht/RPE loggen
- Schmerz/Notizen erfassen
- Historie anzeigen

### Phase 8 - Weekly Review

Ziel:

- Aus Training und Lernen eine Wochenanalyse erzeugen.

Features:

- Muscle Coverage
- Anatomy Coverage
- untertrainierte Regionen
- Lernfortschritt
- nächste Empfehlungen

### Phase 9 - Vitaltrainer Ausbildungsmodul

Ziel:

- Die App wird konkret für Ausbildung und Praxisaufgaben nutzbar.

Features:

- Übungsvideo-Vorbereitung
- Rumpf-Übungs-Anleitung
- Geräteübung erklären
- Trainingsplan begründen
- Coaching-Skripte
- Lernkarten
- Quiz

### Phase 10 - Client/Trainer Mode

Ziel:

- Dieselbe Wissensbasis für verschiedene Zielgruppen ausgeben.

Modi:

- Self Mode
- Trainer Mode
- Client Mode

## 6. MVP der Vitaltrainer App

Der App-MVP sollte nicht alles können.

Der erste echte App-MVP:

- Dashboard
- Exercise Browser
- Exercise Meaning View
- Plan View für Push/Pull/Legs
- Coverage Summary
- Obsidian Export Button

Nicht sofort nötig:

- Login
- Cloud
- Multi-User
- perfekte UI
- Live-wger-Sync
- komplexe Periodisierung
- vollständige Exercise DB

## 7. MVP-Demo

1. App öffnen
2. Push Day wählen
3. Dips öffnen
4. Body Coverage sehen
5. Meaning View öffnen
6. Coach Sheet nach Obsidian exportieren

## 8. Produktkern

Vitaltrainer App ist keine Fitness-App im klassischen Sinn.

Sie ist ein lokales Lern- und Coaching-System für Menschen, die Training verstehen, erklären und dokumentieren wollen.

Der Agent ist nicht das Produkt.

Der Agent ist der Motor.

Das Produkt ist der Workflow:

Trainieren -> Verstehen -> Coachen -> Dokumentieren
