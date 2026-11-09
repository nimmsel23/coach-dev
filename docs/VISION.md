# VISION.md — fitness-dev (historisch)

> **Coach-Produkt-Horizon:** [FREEDOM.md](../FREEDOM.md) — die App muss nutzbar
> sein, um als Coach Klienten zu betreuen und ihren Fortschritt zu überwachen.
> Dieses Dokument bleibt der alte fitness-dev-Tempel-Text (Ausbildung/Volume).

> Was brennt. Was kommen soll. Was diesen Tempel zu mehr macht als einem Workout-Tracker.

---

## Das Warum

fitness-dev entsteht im Kontext der Diplom Präventiver Vitaltrainer Ausbildung.

**Fundament:** Die 12 allgemeinen Trainingsprinzipien der klassischen deutschen Trainingswissenschaft.  
Referenz-Autoren: Grosser, Weineck, Martin/Carl/Lehnertz, **Axel Gottlob**.

**Praktische Referenzen:**  
Arthur Jones · Mike Mentzer · Tom Platz · Dorian Yates · Jeff Cavaliere · Ido Portal

**Der Tempel lernt mit dir.**

---

## Was brennt (Ideen die jetzt heiß sind)

### 1. Anatomy Teaching Layer

Die Ausbildung verlangt: Ursprung, Ansatz, Funktion jedes Muskels kennen.

fitness-dev verbindet Trainingslog und Anatomiewissen:
- Trainingslog → zeigt welche Muskeln trainiert wurden
- Klick auf Muskel → Anatomie-Karte (Ursprung, Ansatz, Innervation, Funktion)
- Ausbildungs-Protokoll → exportierbar als Markdown für Abgaben

Der `fitness-agent` befüllt diesen Layer aus den Ausbildungsmodulen.  
Der Tempel macht das Wissen sichtbar.

---

### 2. Exercise DBs anbinden

Eigene Katalog-Daten + externe Quellen = vollständige Übungsbibliothek:

| Quelle | Was | Status |
|--------|-----|--------|
| **wger** (:8000 lokal) | 800+ Übungen, primäre Quelle | ✅ integriert |
| **yuhonas/free-exercise-db** | Bilder, alternative Namen | ✅ bekannt |
| **wrkout/exercises.json** | 2500+ Übungen, 10k+ Bilder, Public Domain | open |
| **bootstrapping-lab/exercisedb-api** | Self-hosted REST mit GIFs | open |
| **exercemus/exercises** | muscle_groups-Mapping für Coverage | open |

---

### 3. Pflichtaufgaben der Ausbildung — digital erfüllen

Die Ausbildung verlangt konkrete Outputs:
- Trainingspläne erstellen (Belastungssteuerung, Zyklisierung)
- Logs führen (Datum, Übung, Sets/Reps/Gewicht, Muskelgruppen)
- Anatomie dokumentieren (Ursprung, Ansatz, Funktion)
- Protokolle exportieren (PDF/Markdown für Abgaben)

fitness-dev soll jeden dieser Punkte nativ unterstützen —  
nicht als Schulaufgabe, sondern als echtes Werkzeug das nebenher dokumentiert.

---

## Offene Fragen (ehrlich)

- Anatomy Teaching: `react-body-highlighter` (Dashboard/Session) & `react-muscle-highlighter` (Detailed View) ✅ beides integriert.
- GIFs pro Übung: lohnt `exercisedb-api` als lokaler Docker-Container?
- Export-Format für Ausbildungsabgaben: Markdown → PDF via Pandoc? Oder direkt HTML-Print?

---

## Was diesen Tempel besonders macht

Es gibt hunderte Workout-Apps.  
Keine davon ist für einen Trainer gebaut, der gleichzeitig lernt.

fitness-dev ist beides:  
Trainingswerkzeug und Ausbildungsbegleiter.  
Es dokumentiert nicht nur was du machst —  
es hilft dir verstehen, was du deinen Klienten später erklären wirst.

**Der Prophet (fitness-agent) befüllt den Katalog.**  
**Der Tempel macht ihn erfahrbar.**

---

## Der Produktkern (aus APP_ROADMAP, Mai 2026)

Vitaltrainer App ist keine Fitness-App im klassischen Sinn.

Sie ist ein lokales Lern- und Coaching-System für Menschen, die Training verstehen, erklären und dokumentieren wollen.

**Der Agent ist nicht das Produkt.**  
**Der Agent ist der Motor.**

Das Produkt ist der Workflow:

> Trainieren → Verstehen → Coachen → Dokumentieren

Die App hat vier Hauptmodi:

- **Training Mode** — planen, ausführen, loggen
- **Learning Mode** — Anatomie verstehen, Quiz, Lernfortschritt
- **Coaching Mode** — Cues, Fehlerbilder, Coach Sheets, Klientensprache
- **Review Mode** — Coverage, Wochenreport, Fortschritt, Lücken

---

## Endgame-Stack

```
Exercise Library (YAML Katalog)
  → Muscle Coverage (welche Muskeln, wie viel)
    → Body Highlighter (visuell auf dem Körper)
      → Anatomy Teaching (warum, Gelenkaktionen, Fehlerbilder)
        → Workout Plan (Periodisierung, Progression)
          → Training Log (Session-Daten, Pflichtaufgaben-Export)
            → Obsidian (Wissensbase für Ausbildung + Coaching)
```

---

## Phasen

### Phase 1 — Fundament ✅
- Session Logging, Pflichtaufgaben CSV Export, Muscle Coverage, Katalog-Struktur
- Anatomy Teaching für Top 20 Übungen, Exercise Detail View

### Phase 2 — Ausbildung (Fitnesstrainer-Module)
- Trainingsplan-Builder (PPL, Upper/Lower)
- Progression Tracking (Double Progression, Deload)
- Weekly Review mit Volumen-Analyse
- Obsidian Export pro Session

### Phase 3 — Personaltrainer + Prävention
- Client-Profile (Anamnese, Einschränkungen)
- Safety-Filter (Schulter, Knie, Rücken — safety_rules.yml)
- Seniorentrainer-Modus, Gruppen-Trainingsplan

### Phase 4 — Business
- Client-Tracking, Klienten-Reporting (PDF/Markdown)
- Anatomy Teaching als interaktives Lernmodul

**Außerhalb des Scopes:** Rehabilitation (Physio), Ernährung (fuel-dev), Entspannung (relax-dev).

---

*Zuletzt aktualisiert: 2026-06-18*
