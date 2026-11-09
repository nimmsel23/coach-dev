# Fitness PWA: Catalog & Firestore Architecture

Dieses Dokument beschreibt die Architektur der Exercise-Datenbank, den Indexing-Mechanismus und den proaktiven Expert-Daemon.

Der konkrete Inbox -> AI-Enrichment -> Coach-Review -> Expert-Approval Flow ist in
[`EXERCISE_CATALOG_FLOW.md`](EXERCISE_CATALOG_FLOW.md) festgelegt. Diese Flow-Regel
gewinnt gegen ad-hoc Reparaturen an `unreviewed_*` oder Inbox-Drafts.

## 1. Multi-Tier Datenstruktur (The 3-Tier Model)
Um Skalierbarkeit ohne Qualitätsverlust zu garantieren, nutzt das System drei Ebenen:

- **Tier 1: Expert-Tier (The "Coach Brain")**: 
  - **Index**: Registry-Files (z.B. `chest.yml`) mit IDs und wger-normalisierten Muskel-Mappings.
  - **Details**: Expert-Detail-Files (z.B. `exercises/bench_press.yml`) mit Coaching-Notes und Biomechanik.
  - **Status**: Manuell geprüft, autoritativ.
- **Tier 2: Bulk Staging Layer (The "Wiki")**:
  - Großvolumige Importe (~1850 Übungen) aus `wger` und `yuhonas`.
  - **Status**: Markiert als `unreviewed`. Dient als Daten-Fallback für die PWA.
- **Tier 3: Inbox (The "Lab")**:
  - Temporäre Drafts (`inbox_*.yml`) für Neuanfragen oder KI-veredelte Wiki-Daten.

## 2. Der Autonome Expert-Daemon (`coach catalog` / Enricher)

Historisch: `fitness-agent watch`. Heute: Catalog-CLI unter
`coach-dev/fitness/catalog/` (`coach catalog`, Alias `coach agent`) plus
Enrichment-Daemon. Standort-SOT: [OWNERSHIP-MAP.md](OWNERSHIP-MAP.md).

Der Daemon agiert als intelligenter Hintergrundprozess mit folgenden proaktiven Zyklen:

### A. Demand-Driven Refinement (Usage Priorisierung)
- **Log-Ingestion**: Der Daemon importiert synchronisierte Sessions in eine lokale SQLite-Historie.
- **Mining**: Er analysiert die Nutzung der letzten 28 Tage.
- **Proaktives Drafting**: Meistgenutzte `unreviewed` Übungen werden automatisch via Gemini veredelt und als Expert-Draft in die Inbox gelegt.

### B. Biomechanischer Auditor (Continuous Auditing)
- **Validation**: Prüft den gesamten Katalog gegen das Regelwerk in `rules/biomechanics.yml`.
- **Logic-Checks**: Stellt sicher, dass Bewegungsmuster (z.B. `horizontal_press`) zu den primären Muskeln passen.
- **Reporting**: Erzeugt eine "Coach-To-Do-Liste" für Datenkorrekturen.

### C. Context-Aware AI Enrichment
- Nutzt spezialisierte Prompts für **neue** vs. **bestehende** (Wiki) Übungen.
- Verwendet bestehende Metadaten als Kontext, um Konsistenz bei der Veredelung zu garantieren.

## 3. Smart Approval Workflow
Der `approve`-Befehl überführt Daten sicher von Tier 3 (Lab) in Tier 1 (Expert):
1.  **Registry-Eintrag**: Schreibt Core-Metadaten in den regionalen Index.
2.  **Expert-Storage**: Speichert die volle Intelligenz als Detail-File.
3.  **Tag-Update**: Entfernt `unreviewed` und markiert die Übung als verifiziert.

## 4. Sync & Merge Pipeline (`kb_sync.py`)
Die Cloud-Synchronisation folgt dem **Expert-Wins-Prinzip**:
- **Aggregation**: Sammelt alle Datenquellen.
- **Intelligenter Merge**: Bei ID-Kollisionen überschreiben Tier-1-Daten (Expert) immer die Tier-2-Daten (Wiki).
- **Smart Sync**: Nutzt MD5-Hashing des Inhalts, um nur geänderte Dokumente an Firestore zu senden. Dies schont das Quota-Limit und beschleunigt den Prozess drastisch.
- **Orphan Cleanup**: Löscht automatisch Dokumente in Firestore, die lokal nicht mehr existieren (z.B. nach ID-Umbenennungen).
- **Output**: Ein konsolidierter Datensatz pro Übung in Firestore.

## 5. Muskel-Normalisierung (`muscles.yml`) & ID-Konvention
Zentraler Index aller Muskeln mit **wger-IDs**. 

### ID-Konvention: Prefixed Slugs
Seit Juni 2026 verwenden alle Muskel-IDs im Katalog das Format `XXX_slug` (z.B. `101_pectoralis_major`).
- **Vorteil**: Vermeidung von Namenskollisionen bei regionalen Unterteilungen (z.B. verschiedene Köpfe eines Muskels).
- **Vorteil**: Eindeutige Sortierung und schnellere Identifizierung im Code.
- **Wichtig**: Der PWA-Frontend-Code muss diese IDs als "Canonical Slugs" behandeln und bei Bedarf (Icons, Übersetzungen) das Präfix ignorieren oder gezielt mappen.

---
*Dieser proaktive Ansatz stellt sicher, dass der Katalog organisch mit den Bedürfnissen der Nutzer wächst, während das "Expert Brain" die volle biomechanische Kontrolle behält.*
