# Project-Scoped Rules für Fuel Tracker

Diese Regeln gelten spezifisch für die Weiterentwicklung des Fuel Trackers und ergänzen die globalen AlphaOS-Regeln.

## 1. Architektur & Philosophie
- **Deppensicher & Simpel**: Das System soll so einfach wie möglich bleiben. Keine komplexen Verschachtelungen wie im alten Repo (`fuel-dev`).
- **Kein Copy-Paste aus `fuel-dev`**: Versuche nicht, den organisch gewachsenen Node/Python Code aus dem alten Repo zu kopieren. Rekonstruiere die Logik stattdessen sauber, logisch und Python-nativ.

## 2. Technologie-Stack
- **Sprache**: Python 3 (verwaltet über Poetry).
- **Datenbank**: PostgreSQL / MariaDB (für die lokale Entwicklung fallback auf SQLite). Interaktion ausschließlich über **SQLAlchemy**.
- **LLM / NLP**: Nutzung der offiziellen `google-genai` Library. Wir verwenden Structured Outputs (`response_schema`), um Pydantic-Modelle direkt aus der Gemini-API zu erhalten.

## 3. Workflow
- Aktualisiere **immer** die Datei `TODO.md` bevor du Aufgaben beginnst.
- Trage abgeschlossene Aufgaben (inklusive Datum) in `RESULTS.md` ein (gemäß AlphaOS Core Rules).
