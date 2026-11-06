# Exercise Document Schema

Used in both `inbox` (as `enriched` field) and `kb/exercises`.

```json
{{
  "exercise_id": "string (snake_case)",
  "display_name": "string (German)",
  "category": "chest|back|shoulders|arms|core|legs|cardio",
  "type": "compound|isolation",
  "movement_pattern": "string (e.g., horizontal_press)",
  "equipment": ["string"],
  "primary_muscles": ["muscle_id"],
  "secondary_muscles": ["muscle_id"],
  "coaching_notes": ["string"],
  "common_errors": ["string"],
  "source": "string (e.g., ai, community_approved, expert)",
  "biomechanical_warnings": ["string"]
}}
```
