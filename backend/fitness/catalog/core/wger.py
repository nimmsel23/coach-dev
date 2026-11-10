from __future__ import annotations

import json
import os
from dataclasses import dataclass
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

import yaml

from fitness.catalog.core.loader import backup_existing, catalog_path, load_catalog_yaml
from fitness.catalog.core.paths import runtime_root
from fitness.catalog.core.resolver import candidate_texts, resolve_query


@dataclass
class WgerLine:
    level: str
    message: str


@dataclass
class WgerCheckReport:
    lines: list[WgerLine]

    @property
    def has_failures(self) -> bool:
        return any(line.level == "FAIL" for line in self.lines)

    @property
    def has_warnings(self) -> bool:
        return any(line.level == "WARN" for line in self.lines)


@dataclass
class WgerMatch:
    wger_id: int
    name: str
    confidence: str
    matched_on: str


@dataclass
class WgerLookupResult:
    exercise_id: str
    display_name: str
    wger_enabled: bool
    base_url: str
    token_present: bool
    matches: list[WgerMatch]
    selected_match: WgerMatch | None
    written: bool = False
    mapping_path: str | None = None
    warning: str | None = None


@dataclass
class WgerPlanExercise:
    custom_id: str
    exercise_id: str
    display_name: str
    wger_id: int | None
    wger_name: str | None
    mapping_confidence: str | None
    mapping_status: str


def wger_check() -> WgerCheckReport:
    lines: list[WgerLine] = []
    config = load_runtime_config()
    wger = load_wger_section(config)

    if not wger.get("enabled"):
        lines.append(warn("wger is disabled"))
        return WgerCheckReport(lines)

    base_url = str(wger.get("base_url", "")).strip()
    if not base_url:
        lines.append(fail("wger.base_url is missing"))
        return WgerCheckReport(lines)

    token_env = str(wger.get("api_token_env", "")).strip()
    token = os.environ.get(token_env, "") if token_env else ""
    if token_env and not token:
        lines.append(warn(f"token env {token_env} is not set"))

    reachable = check_wger_api(base_url, token=token or None)
    if reachable:
        lines.append(ok("wger API reachable"))
    else:
        lines.append(fail("wger API not reachable"))

    return WgerCheckReport(lines)


def map_wger(exercise_query: str, *, write: bool = False) -> WgerLookupResult:
    resolution = resolve_query(exercise_query)
    if not resolution.matched or not resolution.canonical_id:
        raise ValueError(f"Unknown exercise: {exercise_query}")

    record = find_exercise_record(resolution.canonical_id)
    if record is None:
        raise ValueError(f"Exercise not found: {resolution.canonical_id}")

    config = load_runtime_config()
    wger = load_wger_section(config)
    if not wger.get("enabled"):
        raise ValueError("wger is disabled")

    base_url = str(wger.get("base_url", "")).strip()
    if not base_url:
        raise ValueError("wger.base_url is missing")

    token_env = str(wger.get("api_token_env", "")).strip()
    token = os.environ.get(token_env, "") if token_env else ""
    if not check_wger_api(base_url, token=token or None):
        raise ValueError("wger API not reachable")

    local_terms = build_local_terms(record)
    remote_matches = search_wger_matches(base_url, local_terms, token=token or None)
    matches = score_matches(record, remote_matches)
    selected_match = matches[0] if matches else None

    result = WgerLookupResult(
        exercise_id=record.exercise_id,
        display_name=record.display_name,
        wger_enabled=True,
        base_url=base_url,
        token_present=bool(token),
        matches=matches,
        selected_match=selected_match,
    )

    if write and selected_match is not None:
        mapping_path = write_wger_mapping(record.exercise_id, selected_match)
        result.written = True
        result.mapping_path = str(mapping_path)

    return result


def build_plan_wger_payload(plan: Any, *, export_format: str = "wger-json") -> dict[str, Any]:
    template = plan_value(plan, "template")
    goal = plan_value(plan, "goal")
    split = plan_value(plan, "split")
    day = plan_value(plan, "day")
    slots = plan_value(plan, "slots", [])
    coverage_summary = plan_value(plan, "coverage_summary", {})

    exercises: list[dict[str, Any]] = []
    warnings: list[str] = []

    if not isinstance(slots, list):
        slots = []

    for slot in slots:
        if not isinstance(slot, dict):
            continue
        exercise_id = slot.get("selected_exercise")
        if not isinstance(exercise_id, str) or not exercise_id.strip():
            warnings.append(f"Slot {slot.get('name', 'unknown')} has no selected exercise")
            continue
        exercise_id = exercise_id.strip()
        record = find_exercise_record(exercise_id)
        if record is None:
            warnings.append(f"Exercise missing from index: {exercise_id}")
            continue
        mapping = get_wger_mapping(exercise_id)
        wger_id = mapping.get("wger_id") if isinstance(mapping, dict) else None
        if not isinstance(wger_id, int):
            warnings.append(f"Missing wger_id mapping for {exercise_id}")
            wger_id = None
        exercises.append(
            {
                "custom_id": record.exercise_id,
                "exercise_id": record.exercise_id,
                "display_name": record.display_name,
                "wger_id": wger_id,
                "wger_name": mapping.get("wger_name") if isinstance(mapping, dict) else None,
                "mapping_confidence": mapping.get("confidence") if isinstance(mapping, dict) else None,
                "mapping_status": "mapped" if wger_id is not None else "missing",
            }
        )

    return {
        "format": export_format,
        "template": template,
        "goal": goal,
        "split": split,
        "day": day,
        "coverage_summary": coverage_summary,
        "exercises": exercises,
        "warnings": warnings,
    }


def load_runtime_config() -> dict[str, Any]:
    config = load_catalog_yaml("config.yml")
    if not isinstance(config, dict):
        raise ValueError("config.yml is invalid")
    return config


def load_wger_section(config: dict[str, Any]) -> dict[str, Any]:
    section = config.get("wger", {})
    return section if isinstance(section, dict) else {}


def get_wger_mapping(exercise_id: str) -> dict[str, Any]:
    try:
        document = load_catalog_yaml("registry/wger_mapping.yml")
    except FileNotFoundError:
        return {}
    if not isinstance(document, dict):
        return {}
    section = document.get("wger_mapping", {})
    if not isinstance(section, dict):
        return {}
    mappings = section.get("mappings", {})
    if not isinstance(mappings, dict):
        return {}
    mapping = mappings.get(exercise_id, {})
    return mapping if isinstance(mapping, dict) else {}


def check_wger_api(base_url: str, *, token: str | None = None) -> bool:
    url = join_api_url(base_url, "api/v2/exercise/")
    try:
        request = Request(url, headers={"Accept": "application/json"})
        if token:
            request.add_header("Authorization", f"Token {token}")
        with urlopen(request, timeout=5) as response:
            status = getattr(response, "status", response.getcode())
            return status < 500
    except HTTPError as exc:
        if exc.code in {401, 403} and token:
            return False
        return exc.code < 500
    except (URLError, OSError, ValueError):
        return False


def search_wger_matches(base_url: str, terms: list[str], *, token: str | None = None) -> list[dict[str, Any]]:
    seen: dict[int, dict[str, Any]] = {}
    for term in terms:
        if not term.strip():
            continue
        payload = fetch_wger_exercises(base_url, term, token=token)
        for item in payload:
            wger_id = item.get("id")
            name = str(item.get("name", "")).strip()
            if isinstance(wger_id, int) and name and wger_id not in seen:
                seen[wger_id] = item
    return list(seen.values())


def fetch_wger_exercises(base_url: str, term: str, *, token: str | None = None) -> list[dict[str, Any]]:
    query = urlencode({"search": term, "limit": 10})
    url = join_api_url(base_url, f"api/v2/exercise/?{query}")
    request = Request(url, headers={"Accept": "application/json"})
    if token:
        request.add_header("Authorization", f"Token {token}")
    try:
        with urlopen(request, timeout=5) as response:
            data = json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        if exc.code in {401, 403}:
            raise ValueError("wger API unauthorized; check api token env") from exc
        raise ValueError(f"wger API search failed with status {exc.code}") from exc
    except (URLError, OSError, ValueError) as exc:
        raise ValueError("wger API search failed") from exc
    results = data.get("results", [])
    return results if isinstance(results, list) else []


def score_matches(record: Any, remote_matches: list[dict[str, Any]]) -> list[WgerMatch]:
    local_terms = [normalize_text(value) for value in build_local_terms(record)]
    scored: list[WgerMatch] = []
    for item in remote_matches:
        wger_id = item.get("id")
        name = str(item.get("name", "")).strip()
        if not isinstance(wger_id, int) or not name:
            continue
        remote_name = normalize_text(name)
        best_score = 0.0
        best_term = ""
        for term in local_terms:
            score = SequenceMatcher(None, term, remote_name).ratio()
            if term == remote_name:
                score = 1.0
            if score > best_score:
                best_score = score
                best_term = term
        confidence = confidence_for_score(best_score)
        scored.append(WgerMatch(wger_id=wger_id, name=name, confidence=confidence, matched_on=best_term or remote_name))
    scored.sort(key=lambda match: (-confidence_rank(match.confidence), normalize_text(match.name)))
    return scored[:5]


def confidence_for_score(score: float) -> str:
    if score >= 0.95:
        return "high"
    if score >= 0.75:
        return "medium"
    return "low"


def confidence_rank(confidence: str) -> int:
    return {"high": 3, "medium": 2, "low": 1}.get(confidence, 0)


def build_local_terms(record: Any) -> list[str]:
    terms = [record.exercise_id, record.display_name]
    if getattr(record, "german", ""):
        terms.append(record.german)
    if getattr(record, "aliases", None):
        terms.extend(record.aliases or [])
    return unique_texts(terms)


def unique_texts(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        text = value.strip()
        if not text:
            continue
        normalized = normalize_text(text)
        if normalized not in seen:
            seen.add(normalized)
            result.append(text)
    return result


def normalize_text(text: str) -> str:
    import re
    import unicodedata

    normalized = unicodedata.normalize("NFKD", text)
    stripped = "".join(char for char in normalized if not unicodedata.combining(char))
    collapsed = re.sub(r"[^a-zA-Z0-9]+", " ", stripped.casefold())
    return " ".join(collapsed.split())


def join_api_url(base_url: str, path: str) -> str:
    return base_url.rstrip("/") + "/" + path.lstrip("/")


def write_wger_mapping(exercise_id: str, selected_match: WgerMatch) -> Path:
    mapping_path = catalog_path("registry/wger_mapping.yml")
    if mapping_path.exists():
        backup_existing(mapping_path)

    document = {}
    if mapping_path.exists():
        try:
            loaded = load_catalog_yaml("registry/wger_mapping.yml")
            if isinstance(loaded, dict):
                document = loaded
        except Exception:
            document = {}

    mapping_section = document.get("wger_mapping", {})
    if not isinstance(mapping_section, dict):
        mapping_section = {}
    mappings = mapping_section.get("mappings", {})
    if not isinstance(mappings, dict):
        mappings = {}
    mappings[exercise_id] = {
        "exercise_id": exercise_id,
        "wger_id": selected_match.wger_id,
        "wger_name": selected_match.name,
        "confidence": selected_match.confidence,
        "matched_on": selected_match.matched_on,
    }
    mapping_section["mappings"] = mappings
    document["wger_mapping"] = mapping_section

    temp_path = mapping_path.parent / f".{mapping_path.name}.tmp"
    with temp_path.open("w", encoding="utf-8") as handle:
        yaml.safe_dump(document, handle, sort_keys=False, allow_unicode=True)
    temp_path.replace(mapping_path)
    return mapping_path


def find_exercise_record(exercise_id: str):
    from fitness.catalog.core.resolver import build_exercise_index

    for record in build_exercise_index():
        if record.exercise_id == exercise_id:
            return record
    return None


def plan_value(plan: Any, field_name: str, default: Any = None) -> Any:
    if isinstance(plan, dict):
        return plan.get(field_name, default)
    return getattr(plan, field_name, default)


def ok(message: str) -> WgerLine:
    return WgerLine("OK", message)


def warn(message: str) -> WgerLine:
    return WgerLine("WARN", message)


def fail(message: str) -> WgerLine:
    return WgerLine("FAIL", message)
