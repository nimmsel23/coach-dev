"""
Unit tests for modular fitness.log.clients service, models and cli.
"""
from __future__ import annotations

import json
from unittest.mock import patch

import pytest

from fitness.log.clients.models import ClientFilter, ClientMeta
from fitness.log.clients.service import (
    build_client_timeline,
    calculate_block_rest_gaps,
    compute_client_stats,
    get_clients_registry,
    journal_preview,
    parse_session_item,
)


def test_parse_session_item():
    raw_cardio = {
        "date": "2026-10-20",
        "sessionMode": "cardio",
        "activity": {"type": "crossfit", "duration": "60"},
        "exercises": [],
    }
    item = parse_session_item(raw_cardio)
    assert item.kind == "cardio"
    assert len(item.activities) == 1
    assert item.activities[0]["type"] == "crossfit"

    raw_strength = {
        "date": "2026-10-22",
        "block": "Push",
        "effort": 9,
        "exercises": [
            {
                "name": "Bench Press",
                "done": True,
                "sets": [{"reps": 8, "weight": 80}],
            }
        ],
    }
    item_str = parse_session_item(raw_strength)
    assert item_str.kind == "strength"
    assert item_str.block == "Push"
    assert item_str.effort == 9
    assert len(item_str.exercises) == 1


def test_calculate_block_rest_gaps():
    sessions = [
        {"date": "2026-10-01", "block": "Push", "exercises": [{"name": "Bench", "done": True}]},
        {"date": "2026-10-05", "block": "Pull", "exercises": [{"name": "Row", "done": True}]},
        {"date": "2026-10-10", "block": "Push", "exercises": [{"name": "Incline", "done": True}]},
        {"date": "2026-10-25", "block": "Push", "exercises": [{"name": "Dips", "done": True}]},
    ]
    gaps = calculate_block_rest_gaps(sessions)
    assert "2026-10-01" not in gaps
    assert gaps["2026-10-10"] == 9   # 10.10 minus 01.10 = 9 days
    assert gaps["2026-10-25"] == 15  # 25.10 minus 10.10 = 15 days


def test_journal_preview():
    # Habit block should be filtered out
    habit_text = "<!-- fshr:123 --> Habit done <!-- text:456 --> Great workout today!"
    preview = journal_preview(habit_text)
    assert "Great workout today!" in preview
    assert "Habit done" not in preview


def test_build_client_timeline_filters():
    meta = ClientMeta(uid="U1", uids=["U1"], name="Test User", slug="test-user")
    sessions = [
        {"date": "2026-10-01", "block": "Push", "exercises": [{"name": "Bench", "done": True}]},
        {"date": "2026-10-05", "block": "Pull", "exercises": [{"name": "Row", "done": True}]},
        {"date": "2026-10-15", "block": "Push", "exercises": [{"name": "Dips", "done": True}]},
        {"date": "2026-10-20", "sessionMode": "cardio", "activity": {"type": "running"}, "exercises": []},
    ]
    journals = {"2026-10-15": ["Felt strong"]}

    # Filter block=Push
    f_block = ClientFilter(block="push")
    tl = build_client_timeline(meta, sessions, journals, f_block)
    assert len(tl) == 2
    assert [e.date for e in tl] == ["2026-10-15", "2026-10-01"]

    # Filter workout_type=cardio
    f_cardio = ClientFilter(workout_type="cardio")
    tl_c = build_client_timeline(meta, sessions, journals, f_cardio)
    assert len(tl_c) == 1
    assert tl_c[0].date == "2026-10-20"

    # Filter min_rest=10
    f_rest = ClientFilter(min_rest=10)
    tl_r = build_client_timeline(meta, sessions, journals, f_rest)
    assert len(tl_r) == 1
    assert tl_r[0].date == "2026-10-15"
    assert tl_r[0].rest_days == 14


def test_compute_client_stats():
    meta = ClientMeta(uid="U1", uids=["U1"], name="Test User", slug="test-user")
    sessions = [
        {"date": "2026-10-01", "block": "Push", "effort": 8, "exercises": [{"name": "Bench", "done": True}]},
        {"date": "2026-10-05", "block": "Pull", "effort": 9, "exercises": [{"name": "Row", "done": True}]},
        {"date": "2026-10-10", "sessionMode": "cardio", "activity": {"type": "running"}, "exercises": []},
    ]
    stats = compute_client_stats(meta, sessions, days_window=14)
    assert stats.total_sessions == 3
    assert stats.strength_sessions == 2
    assert stats.cardio_sessions == 1
    assert stats.avg_rpe == 8.5
    assert stats.block_counts == {"Push": 1, "Pull": 1}
