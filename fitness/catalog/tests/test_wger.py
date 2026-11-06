from __future__ import annotations

import io
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import yaml

from fitness.catalog.bootstrap import bootstrap
from fitness.catalog.cli import main
from fitness.catalog.planner import build_plan
from fitness.catalog.core.wger import build_plan_wger_payload, map_wger, wger_check


class FakeResponse:
    def __init__(self, payload: dict[str, object] | None = None, status: int = 200) -> None:
        self.payload = payload or {}
        self.status = status

    def __enter__(self) -> "FakeResponse":
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        return None

    def read(self) -> bytes:
        return json.dumps(self.payload).encode("utf-8")

    def getcode(self) -> int:
        return self.status


class WgerTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.TemporaryDirectory()
        self.home = Path(self.tempdir.name)
        self.patcher = mock.patch.dict(os.environ, {"HOME": str(self.home), "WGER_API_TOKEN": "secret-token"}, clear=False)
        self.patcher.start()
        bootstrap()
        config_path = self.home / ".fitness-agent" / "config.yml"
        config = yaml.safe_load(config_path.read_text(encoding="utf-8"))
        config["wger"]["enabled"] = True
        config["wger"]["base_url"] = "https://wger.local"
        config_path.write_text(yaml.safe_dump(config, sort_keys=False, allow_unicode=True), encoding="utf-8")

    def tearDown(self) -> None:
        self.patcher.stop()
        self.tempdir.cleanup()


class WgerPlanExportTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.TemporaryDirectory()
        self.home = Path(self.tempdir.name)
        self.patcher = mock.patch.dict(os.environ, {"HOME": str(self.home), "WGER_API_TOKEN": "secret-token"}, clear=False)
        self.patcher.start()
        bootstrap()
        config_path = self.home / ".fitness-agent" / "config.yml"
        config = yaml.safe_load(config_path.read_text(encoding="utf-8"))
        config["wger"]["enabled"] = True
        config["wger"]["base_url"] = "https://wger.local"
        config_path.write_text(yaml.safe_dump(config, sort_keys=False, allow_unicode=True), encoding="utf-8")
        mapping_path = self.home / ".fitness-agent" / "maps" / "wger_mapping.yml"
        mapping = yaml.safe_load(mapping_path.read_text(encoding="utf-8"))
        mapping["wger_mapping"]["mappings"]["incline_dumbbell_press"] = {
            "exercise_id": "incline_dumbbell_press",
            "wger_id": 101,
            "wger_name": "Schrägbankdrücken mit Kurzhanteln",
            "confidence": "high",
            "matched_on": "schrägbankdrücken mit kurzhanteln",
        }
        mapping_path.write_text(yaml.safe_dump(mapping, sort_keys=False, allow_unicode=True), encoding="utf-8")

    def tearDown(self) -> None:
        self.patcher.stop()
        self.tempdir.cleanup()

    def test_payload_generation_preserves_custom_id_and_warns_on_missing_mapping(self) -> None:
        plan = build_plan(template="push_day", goal="hypertrophy")
        payload = build_plan_wger_payload(plan, export_format="wger-json")

        self.assertEqual(payload["format"], "wger-json")
        self.assertEqual(payload["template"], "push_day")
        self.assertEqual(payload["goal"], "hypertrophy")
        self.assertEqual(payload["exercises"][0]["custom_id"], "incline_dumbbell_press")
        self.assertEqual(payload["exercises"][0]["wger_id"], 101)
        self.assertEqual(payload["exercises"][0]["mapping_status"], "mapped")
        self.assertTrue(any(item["wger_id"] is None for item in payload["exercises"][1:]))
        self.assertTrue(any("Missing wger_id mapping" in warning for warning in payload["warnings"]))

    def test_no_custom_yaml_modification(self) -> None:
        mapping_path = self.home / ".fitness-agent" / "maps" / "wger_mapping.yml"
        before = mapping_path.read_text(encoding="utf-8")
        payload = build_plan_wger_payload(build_plan(template="push_day", goal="hypertrophy"), export_format="wger-json")
        after = mapping_path.read_text(encoding="utf-8")

        self.assertEqual(before, after)
        self.assertTrue(payload["exercises"])

    def test_cli_export_wger_json_outputs_payload(self) -> None:
        buffer = io.StringIO()
        with mock.patch("sys.stdout", buffer):
            code = main(["plan", "--template", "push_day", "--goal", "hypertrophy", "--export", "wger-json"])

        output = buffer.getvalue()
        self.assertEqual(code, 0)
        self.assertIn("format: wger-json", output)
        self.assertIn("custom_id: incline_dumbbell_press", output)
        self.assertIn("warnings:", output)

    def test_cli_export_wger_alias_outputs_payload(self) -> None:
        buffer = io.StringIO()
        with mock.patch("sys.stdout", buffer):
            code = main(["plan", "--template", "push_day", "--goal", "hypertrophy", "--export", "wger"])

        output = buffer.getvalue()
        self.assertEqual(code, 0)
        self.assertIn("format: wger", output)

    def test_wger_check_reports_ok_and_reads_token(self) -> None:
        seen_headers: list[dict[str, str]] = []

        def fake_urlopen(request, timeout=5):
            seen_headers.append(dict(request.headers))
            return FakeResponse({"results": []}, status=200)

        with mock.patch("fitness.catalog.core.wger.urlopen", side_effect=fake_urlopen):
            report = wger_check()

        self.assertFalse(report.has_failures)
        self.assertTrue(any(line.level == "OK" for line in report.lines))
        self.assertTrue(any("wger API reachable" in line.message for line in report.lines))
        self.assertTrue(any(any(key.lower() == "authorization" for key in headers) for headers in seen_headers))

    def test_map_wger_returns_candidates_without_write(self) -> None:
        def fake_urlopen(request, timeout=5):
            url = request.full_url
            if url.endswith("/api/v2/exercise/"):
                return FakeResponse({"results": []}, status=200)
            return FakeResponse({"results": [{"id": 101, "name": "Schrägbankdrücken mit Kurzhanteln"}]}, status=200)

        with mock.patch("fitness.catalog.core.wger.urlopen", side_effect=fake_urlopen):
            result = map_wger("incline_dumbbell_press", write=False)

        self.assertEqual(result.exercise_id, "incline_dumbbell_press")
        self.assertGreaterEqual(len(result.matches), 1)
        self.assertEqual(result.matches[0].wger_id, 101)
        self.assertEqual(result.matches[0].confidence, "high")
        self.assertFalse(result.written)
        self.assertIsNone(result.mapping_path)

    def test_map_wger_write_updates_mapping_and_backup(self) -> None:
        def fake_urlopen(request, timeout=5):
            url = request.full_url
            if url.endswith("/api/v2/exercise/"):
                return FakeResponse({"results": []}, status=200)
            return FakeResponse({"results": [{"id": 101, "name": "Schrägbankdrücken mit Kurzhanteln"}]}, status=200)

        with mock.patch("fitness.catalog.core.wger.urlopen", side_effect=fake_urlopen):
            result = map_wger("incline_dumbbell_press", write=True)

        mapping_path = self.home / ".fitness-agent" / "maps" / "wger_mapping.yml"
        self.assertTrue(result.written)
        self.assertEqual(Path(result.mapping_path), mapping_path)
        content = yaml.safe_load(mapping_path.read_text(encoding="utf-8"))
        self.assertEqual(content["wger_mapping"]["mappings"]["incline_dumbbell_press"]["exercise_id"], "incline_dumbbell_press")
        self.assertEqual(content["wger_mapping"]["mappings"]["incline_dumbbell_press"]["wger_id"], 101)
        self.assertEqual(content["wger_mapping"]["mappings"]["incline_dumbbell_press"]["confidence"], "high")
        backups = list((self.home / ".fitness-agent" / "backups").rglob("wger_mapping.yml"))
        self.assertTrue(backups)

    def test_cli_map_wger_outputs_yaml(self) -> None:
        def fake_urlopen(request, timeout=5):
            url = request.full_url
            if url.endswith("/api/v2/exercise/"):
                return FakeResponse({"results": []}, status=200)
            return FakeResponse({"results": [{"id": 101, "name": "Schrägbankdrücken mit Kurzhanteln"}]}, status=200)

        buffer = io.StringIO()
        with mock.patch("fitness.catalog.core.wger.urlopen", side_effect=fake_urlopen), mock.patch("sys.stdout", buffer):
            code = main(["map-wger", "--exercise", "incline_dumbbell_press"])

        self.assertEqual(code, 0)
        self.assertIn("exercise_id: incline_dumbbell_press", buffer.getvalue())


if __name__ == "__main__":
    unittest.main()
