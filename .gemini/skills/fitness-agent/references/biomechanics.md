# Biomechanical Rules & Logic

The Fitness Agent uses these deterministic rules to audit exercises.

## Movement Pattern Mapping

| Pattern | Required Primary Muscle(s) | Description |
| :--- | :--- | :--- |
| `horizontal_press` | `chest`, `pectoralis_major` | Shoulders + Triceps synergists. |
| `vertical_press` | `shoulders`, `anterior_deltoid` | Core stabilizers required. |
| `vertical_pull` | `back`, `lats` | Scapular depression focus. |
| `horizontal_pull` | `back`, `traps`, `rhomboids` | Scapular retraction focus. |
| `squat` | `legs`, `quadriceps` | Glute/Lower back involvement. |
| `hinge` | `glutes`, `hamstrings` | Posterior chain dominance. |

## Auditing Logic

1.  **Mandatory Match**: Every exercise MUST have a `movement_pattern`.
2.  **Muscle Check**: The `primary_muscles` list must contain at least one muscle from the required list for that pattern.
3.  **Isolation Guard**: Isolation exercises are flagged if they have > 2 primary muscles.
4.  **Normalization**: All muscle IDs must exist in `muscles.yml`.
