from __future__ import annotations

from typing import Any

from fitness.catalog.core.loader import load_catalog_directory_yaml, load_catalog_yaml


def load_chest_lessons() -> list[dict[str, Any]]:
    document = load_catalog_yaml("anatomy_teaching/chest_lessons.yml")
    if not isinstance(document, dict):
        return []
    return parse_lesson_document(document)


def load_all_lessons() -> list[dict[str, Any]]:
    lessons: list[dict[str, Any]] = []
    for _, document in load_catalog_directory_yaml("anatomy_teaching"):
        lessons.extend(parse_lesson_document(document))
    return lessons


def find_lesson(exercise_id: str) -> dict[str, Any] | None:
    for lesson in load_all_lessons():
        if lesson.get("exercise_id") == exercise_id:
            return lesson
    return None


def teach_exercise(exercise_id: str, mode: str = "trainer") -> str:
    lesson = find_lesson(exercise_id)
    if lesson is None:
        raise ValueError(f"Unknown anatomy lesson: {exercise_id}")

    if mode not in {"trainer", "client"}:
        raise ValueError(f"Unsupported mode: {mode}")

    return render_lesson_markdown(lesson, mode=mode)


def render_lesson_markdown(lesson: dict[str, Any], *, mode: str) -> str:
    learning_goal = lesson.get("learning_goal", {})
    trainer = lesson.get("trainer_explanation", {})
    common_errors = lesson.get("common_errors", [])
    variations = lesson.get("variations_teach", [])
    if not isinstance(learning_goal, dict):
        learning_goal = {}
    if not isinstance(trainer, dict):
        trainer = {}
    if not isinstance(common_errors, list):
        common_errors = []
    if not isinstance(variations, list):
        variations = []

    lines: list[str] = []
    lines.append(f"# {str(lesson.get('exercise_id', 'lesson')).replace('_', ' ').title()}")
    lines.append("")
    lines.append("## Lernziel")
    lines.append(f"- Kurz: {stringify(learning_goal.get('short'))}")
    lines.append(f"- Detailliert: {stringify(learning_goal.get('detailed'))}")
    lines.append("")
    lines.append("## Bewegung")
    lines.append(f"- Pattern: {render_movement_pattern(lesson.get('movement_pattern'))}")
    lines.append("")
    lines.append("## Gelenkaktionen")
    lines.extend(render_joint_actions(lesson.get("joint_actions")))
    lines.append("")
    lines.append("## Muskelrollen")
    lines.extend(render_muscle_roles(lesson.get("muscle_roles")))
    lines.append("")
    lines.append("## Body Highlighter Regions")
    lines.extend(render_region_groups(lesson.get("body_highlighter_regions")))
    lines.append("")
    lines.append("## Coaching Cues")
    for item in as_lines(lesson.get("coaching_cues")):
        lines.append(f"- {item}")
    lines.append("")
    lines.append("## Feel Cues")
    for item in as_lines(lesson.get("feel_cues")):
        lines.append(f"- {item}")
    lines.append("")
    lines.append("## Häufige Fehler")
    for error in common_errors:
        if isinstance(error, dict):
            lines.append(f"- Fehler: {stringify(error.get('error'))}")
            lines.append(f"  - Anatomischer Grund: {stringify(error.get('anatomical_reason'))}")
            lines.append(f"  - Korrektur: {stringify(error.get('correction'))}")
            lines.append(f"  - Coaching Cue: {stringify(error.get('coaching_cue'))}")
        else:
            lines.append(f"- {stringify(error)}")
    lines.append("")
    lines.append("## Anatomische Erklärung")
    if mode == "trainer":
        lines.append(f"- Einfach: {stringify(trainer.get('simple'))}")
        lines.append(f"- Technisch: {stringify(trainer.get('technical'))}")
    else:
        lines.append(f"- Einfach: {stringify(trainer.get('client_friendly'))}")
    lines.append("")
    lines.append("## Klientensprache")
    lines.append(f"- {stringify(trainer.get('client_friendly'))}")
    lines.append("")
    lines.append("## Variationen")
    lines.extend(render_variations(variations))
    quiz = lesson.get("quiz")
    if isinstance(quiz, dict) and quiz.get("question"):
        lines.append("")
        lines.append("## Quiz")
        lines.append(f"- Frage: {stringify(quiz.get('question'))}")
        answer = quiz.get("answer")
        if answer:
            lines.append(f"- Antwort: {stringify(answer)}")
    elif isinstance(quiz, list) and quiz:
        lines.append("")
        lines.append("## Quiz")
        for item in quiz:
            if isinstance(item, dict):
                lines.append(f"- Frage: {stringify(item.get('question'))}")
                answer = item.get("answer")
                if answer:
                    lines.append(f"  - Antwort: {stringify(answer)}")
    return "\n".join(lines).strip() + "\n"


def parse_lesson_document(document: Any) -> list[dict[str, Any]]:
    if not isinstance(document, dict):
        return []
    lessons = document.get("lessons", [])
    if not isinstance(lessons, list):
        return []
    return [lesson for lesson in lessons if isinstance(lesson, dict)]


def render_muscle_roles(value: Any) -> list[str]:
    if not isinstance(value, dict):
        return ["- Keine Angaben"]
    lines: list[str] = []
    for key in ["primary", "secondary", "stabilizers"]:
        items = as_lines(value.get(key, []))
        lines.append(f"- {key.title()}: {', '.join(items) if items else '[]'}")
    return lines


def render_movement_pattern(value: Any) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        primary = stringify(value.get("primary"))
        secondary = as_lines(value.get("secondary"))
        if secondary:
            return f"{primary} | secondary: {', '.join(secondary)}"
        return primary
    return stringify(value)


def render_joint_actions(value: Any) -> list[str]:
    if isinstance(value, list):
        return [f"- {item}" for item in as_lines(value)]
    if not isinstance(value, dict):
        return ["- Keine Angaben"]
    lines: list[str] = []
    for joint_name, joint_data in value.items():
        lines.append(f"- {joint_name}:")
        if isinstance(joint_data, dict):
            for phase in ["eccentric", "concentric", "stabilization"]:
                actions = as_lines(joint_data.get(phase))
                if actions:
                    lines.append(f"  - {phase}: {', '.join(actions)}")
        else:
            lines.append(f"  - {stringify(joint_data)}")
    return lines


def render_region_groups(value: Any) -> list[str]:
    if isinstance(value, list):
        return [f"- {item}" for item in as_lines(value)]
    if not isinstance(value, dict):
        return ["- Keine Angaben"]
    lines: list[str] = []
    for key in ["primary", "secondary", "light"]:
        items = as_lines(value.get(key, []))
        lines.append(f"- {key.title()}: {', '.join(items) if items else '[]'}")
    return lines


def render_variations(value: Any) -> list[str]:
    if isinstance(value, list) and value and all(isinstance(item, dict) for item in value):
        lines: list[str] = []
        for item in value:
            lines.append(f"- {stringify(item.get('variation'))}: {stringify(item.get('lesson'))}")
        return lines
    return [f"- {item}" for item in as_lines(value)]


def as_lines(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item) for item in value if str(item).strip()]


def stringify(value: Any) -> str:
    if value is None:
        return ""
    return str(value)
