# Muscle Anatomical Schema

Stored in `~/anatomy-kb/muscles/{muscle_id}.yml`.

```yaml
muscle_id: string
wger_id: integer
latin: string (Latin name)
origin: string (Anatomical origin)
insertion: string (Anatomical insertion)
innervation: string (Nerve supply)
function: string (General biomechanical function)
exercises:
  exercise_id:
    function_in_exercise: string (Specific role in this exercise)
```
