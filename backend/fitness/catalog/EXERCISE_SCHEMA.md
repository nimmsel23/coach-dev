# Exercise Schema

Zielbild ab `2026-08-12.exercise-v1`:

- Top-Level-Felder bleiben vorerst die kanonische App-Wahrheit aus Kompatibilitätsgründen.
- Rohe Quellinfos bleiben separat und immutable unter `source_snapshot`.
- Review-/Freigabezustand liegt separat unter `review_state`.
- Herkunft liegt separat unter `origin`.

## Felder

`schema_version`
- Aktuelle Schema-Version des Exercise-Dokuments.

`origin`
- `type`: `manual` | `external` | `merged_external`
- `source_refs`: externe IDs aus `wger` und/oder `yuhonas`

`source_snapshot`
- Read-only Referenz auf rohe oder quellennahe Felder.
- Aktuell:
  - `wger`: `wger_id`, `wger_muscle_ids`, `original_description`
  - `yuhonas`: `yuhonas_id`, `instructions`, `images`

`review_state`
- `status`: aktuell `draft` oder `approved`
- `review_provider`: z.B. `haiku` oder `codex`
- `ai_reviewed`: ob ein zweiter KI-Review-Pass angewendet wurde
- `enriched_at`, `approved_at`

## Status-Semantik

- `draft`: AI-angereicherter oder re-angereicherter Entwurf, noch keine explizite Coach-Freigabe
- `approved`: explizit freigegebene Exercise

Reserviert für den nächsten Schritt:

- `reviewed`: fachlich geprüft, aber noch nicht final freigegeben

## Quellprinzip

- `source_snapshot.*` wird nicht von der KI überschrieben.
- KI schreibt nur in die kanonischen Top-Level-Felder.
- Externe Datenbanken sind Referenz und Seed, nicht die finale App-Wahrheit.
