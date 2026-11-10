from datetime import date
from unittest.mock import MagicMock, Mock, patch

import pytest

from fitness.firestore.coach_bridge import _execute_command, _to_firestore, process_commands


def test_coach_command_routes_to_python_api():
    response = Mock()
    response.json.return_value = {"ok": True, "exercise_id": "bench_press"}
    client = MagicMock()
    client.request.return_value = response
    client.__enter__.return_value = client

    with patch("fitness.firestore.coach_bridge.httpx.Client", return_value=client):
        result = _execute_command({
            "action": "approve", "item_id": "inbox_bench_press", "uid": "client-1",
            "payload": {"current_data": {"display_name": "Bench Press"}},
        })

    assert result == {"ok": True, "exercise_id": "bench_press"}
    client.request.assert_called_once_with(
        "POST", "/fitness/inbox/inbox_bench_press/approve",
        json={
            "current_data": {"display_name": "Bench Press"},
            "uid": "client-1", "doc_id": "inbox_bench_press",
        },
        params=None,
    )


@pytest.mark.parametrize("item_id", ["", "../approve", "foo/bar"])
def test_invalid_command_does_not_hit_local_api(item_id):
    with pytest.raises(ValueError):
        _execute_command({"action": "approve", "item_id": item_id})


def test_command_error_is_reported_not_marked_done():
    ref = Mock()
    doc = Mock(reference=ref)
    doc.to_dict.return_value = {"action": "approve", "item_id": "inbox_test"}
    db = Mock()
    db.collection.return_value.where.return_value.stream.return_value = [doc]

    with patch("fitness.firestore.coach_bridge._execute_command", side_effect=RuntimeError("backend failed")):
        process_commands(db)

    assert ref.update.call_args_list[0].args[0]["status"] == "processing"
    assert ref.update.call_args_list[1].args[0]["status"] == "error"


def test_mutation_snapshot_published_before_done():
    ref = Mock()
    doc = Mock(reference=ref)
    doc.to_dict.return_value = {"action": "link-source", "item_id": "inbox_test"}
    db = Mock()
    db.collection.return_value.where.return_value.stream.return_value = [doc]
    events = []
    ref.update.side_effect = lambda data: events.append(data["status"])

    with patch("fitness.firestore.coach_bridge._execute_command", return_value={"ok": True}), \
         patch("fitness.firestore.coach_bridge.publish_inbox", side_effect=lambda _: events.append("published")):
        process_commands(db)

    assert events == ["processing", "published", "done"]


def test_yaml_dates_are_safe_for_firestore():
    assert _to_firestore({"queued_at": date(2026, 9, 24)}) == {"queued_at": "2026-09-24"}
