"""Coach-Sheet-Save darf Lesson-Felder, die das Sheet nicht kennt, nicht wegwerfen."""

from fitness.api.routers.exercise_store import normalize_lesson_payload

EXISTING = {
    "exercise_id": "020",
    "title": "Klimmzug",
    "region": "back",
    "learning_goal": {"short": "alt", "detailed": "alt detail"},
    "movement_pattern": {"primary": "vertical_pull", "secondary": ["scapular_depression"]},
    "trainer_explanation": {"simple": "s", "technical": "t", "client_friendly": "c"},
    "variations_teach": [{"variation": "Chin-Up", "lesson": "mehr Bizeps"}],
    "quiz": [{"question": "q1", "answer": "a1"}, {"question": "q2", "answer": "a2"}],
    "quiz_prompts": [{"question": "legacy", "answer": "x"}],
}


def test_unknown_fields_and_full_quiz_survive_empty_save():
    out = normalize_lesson_payload("020", {}, EXISTING)
    assert out["region"] == "back"
    assert out["quiz_prompts"] == EXISTING["quiz_prompts"]
    assert out["variations_teach"] == EXISTING["variations_teach"]
    assert len(out["quiz"]) == 2
    assert out["movement_pattern"] == EXISTING["movement_pattern"]


def test_nested_text_blocks_are_applied_and_clearable():
    body = {
        "learning_goal": {"short": "neu", "detailed": ""},
        "trainer_explanation": {"simple": "", "technical": "T", "client_friendly": "C"},
    }
    out = normalize_lesson_payload("020", body, EXISTING)
    assert out["learning_goal"] == {"short": "neu", "detailed": ""}
    assert out["trainer_explanation"] == {"simple": "", "technical": "T", "client_friendly": "C"}


def test_flat_legacy_payload_still_works():
    out = normalize_lesson_payload("020", {"learning_goal_short": "flat", "trainer_client_friendly": "hi"}, EXISTING)
    assert out["learning_goal"]["short"] == "flat"
    assert out["trainer_explanation"]["client_friendly"] == "hi"


def test_variations_and_quiz_from_sheet():
    body = {
        "variations_teach": [{"variation": "Neutral", "lesson": "schulterfreundlich"}, {"variation": "", "lesson": ""}],
        "quiz": [{"question": "Warum?", "answer": "Darum."}],
    }
    out = normalize_lesson_payload("020", body, EXISTING)
    assert out["variations_teach"] == [{"variation": "Neutral", "lesson": "schulterfreundlich"}]
    assert out["quiz"] == [{"question": "Warum?", "answer": "Darum."}]
