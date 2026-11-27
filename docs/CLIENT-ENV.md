# Klienten-Schalter aus `client.env` (seit 2026-11-27)

Grundsatz (`~/Klienten/AGENTS.md`): Was im Klienten-Workspace per `client.env` geschaltet
wird, muss der Coach auch in coach-dev regeln können.

- **Code:** `coach_client_env.py`. `SETTINGS` ist die Liste der regelbaren Keys mit
  Typ, Default und Label. Nur diese Keys sind schreibbar, `FIREBASE_UID` u. ä. nicht.
  Kommentare und fremde Zeilen in `client.env` bleiben erhalten; ein leerer Wert
  entfernt die Zeile.
- **CLI:** `coach frame <slug> [status|on|off] [--start YYYY-MM-DD] [--nudge H]`,
  `coach client-env <slug> [show|set KEY=WERT …] [--json]`.
- **API** (:9150, local-only, in `coach_legacy_clients.py`):
  `GET /k/<slug>/client-env` liefert Schalter, Frame-Zustand (`frame_interview.json`)
  und den globalen Timer-Status. `POST /k/<slug>/client-env` mit `{"set": {"KEY": "WERT"}}`.
- **Schmiede:** Tab „Schalter“ (`klienten-ui/schmiede-src/src/SchalterTab.jsx`).

Aktuelle Schalter: `FRAME_INTERVIEW` (Standard off), `FRAME_START`, `FRAME_NUDGE_HOURS`,
genutzt von `~/Klienten/bin/frame-interview.sh`. Der Timer `frame-interview.timer` gilt
für alle Klienten und wird bewusst nicht über die API geschaltet.

Neuer Schalter = Eintrag in `SETTINGS` → erscheint automatisch in CLI, API und Schmiede.
Tests: `tests/test_client_env.py`.
