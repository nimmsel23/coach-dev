from __future__ import annotations

import curses
import shutil
import sys
import textwrap
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

if __package__ in {None, ""}:
    package_root = Path(__file__).resolve().parent.parent
    if str(package_root) not in sys.path:
        sys.path.insert(0, str(package_root))
    __package__ = "catalog"

from fitness.catalog.bootstrap import bootstrap
from fitness.catalog.coach_sheet import build_coach_sheet, render_coach_sheet_markdown
from fitness.catalog.coverage import calculate_coverage
from fitness.catalog.history import log_training_entry, progress_hint, read_history
from fitness.catalog.agent.obsidian import (
    export_coach_sheet_note,
    export_coverage_note,
    export_exercise_note,
    export_plan_note,
    export_teach_note,
    export_weekly_report_note,
)
from fitness.catalog.planner import build_plan
from fitness.catalog.preview import cleanup_preview_file, preview_file, write_preview_file
from fitness.catalog.core.resolver import build_exercise_index, candidate_texts, normalize_text, resolve_query
from fitness.catalog.agent.teaching import teach_exercise, find_lesson
from fitness.catalog.weekly import build_weekly_coverage
from fitness.catalog.core.wger import build_plan_wger_payload, get_wger_mapping, map_wger, wger_check


SCREEN_ORDER = [
    "dashboard",
    "browser",
    "highlighter",
    "preview",
    "plan",
    "lesson",
    "coach",
    "log",
    "history",
    "report",
    "wger",
]


@dataclass
class ScreenSection:
    title: str
    lines: list[str]


@dataclass
class ScreenModel:
    key: str
    title: str
    subtitle: str
    sections: list[ScreenSection]
    actions: list[str]
    footer: list[str]


@dataclass
class TuiState:
    active_screen: str = "dashboard"
    preview_source_screen: str = "dashboard"
    browser_query: str = "kh schrägbank"
    browser_index: int = 0
    plan_template: str = "push_day"
    plan_goal: str = "hypertrophy"
    lesson_exercise: str = "dips_chest"
    coach_exercise: str = "dips_chest"
    log_exercise: str = "incline_dumbbell_press"
    log_sets: int = 3
    log_reps: int = 10
    log_weight: float = 24.0
    log_rpe: int = 8
    log_workout_id: str = "workout-tui"
    log_notes: str = ""
    log_pain: str = ""
    history_exercise: str = "incline_dumbbell_press"
    report_week: str = "current"
    wger_exercise: str = "incline_dumbbell_press"
    message: str = ""


@dataclass
class ScreenActionResult:
    message: str
    screen_model: ScreenModel | None = None


def run_tui(initial_screen: str = "dashboard") -> None:
    bootstrap()
    if not sys.stdin.isatty() or not sys.stdout.isatty():
        print("TUI requires an interactive terminal.")
        return
    state = TuiState(active_screen=initial_screen if initial_screen in SCREEN_ORDER else "dashboard")
    curses.wrapper(lambda stdscr: curses_main(stdscr, state))


def curses_main(stdscr: Any, state: TuiState) -> None:
    curses.curs_set(0)
    stdscr.nodelay(False)
    stdscr.keypad(True)

    while True:
        stdscr.erase()
        height, width = stdscr.getmaxyx()
        draw_app(stdscr, state, width, height)
        stdscr.refresh()
        key = stdscr.getch()

        if key in {ord("q"), 27}:
            break
        if key in {curses.KEY_DOWN, ord("j"), 9}:
            navigate_vertical(state, 1)
            continue
        if key in {curses.KEY_UP, ord("k"), curses.KEY_BTAB}:
            navigate_vertical(state, -1)
            continue
        if key in {ord("h"), ord("H")}:
            if state.active_screen == "highlighter":
                state.active_screen = "browser"
            else:
                state.active_screen = "highlighter"
            continue
        if key in {ord("b"), ord("B")}:
            if state.active_screen == "highlighter":
                state.active_screen = "browser"
                continue
            if state.active_screen == "preview":
                state.active_screen = state.preview_source_screen if state.preview_source_screen in SCREEN_ORDER else "dashboard"
                continue
        if key in {10, 13}:
            if state.active_screen == "highlighter":
                state.active_screen = "browser"
                continue
            if state.active_screen == "preview":
                result = handle_preview_action(stdscr, state)
                state.message = result.message
                continue
            continue
        if key in {ord("e"), ord("E")}:
            handle_edit_action(stdscr, state)
            continue
        if key == ord("/"):
            handle_search_action(stdscr, state)
            continue
        if key in {ord("o"), ord("O")}:
            result = handle_export_action(state)
            state.message = result.message
            continue
        if key in {ord("v"), ord("V")}:
            result = handle_preview_action(stdscr, state)
            state.message = result.message
            continue
        if key in {ord("l"), ord("L")} and state.active_screen == "log":
            result = handle_log_action(state)
            state.message = result.message
            continue
        if key in {ord("m"), ord("M")} and state.active_screen == "wger":
            result = handle_wger_map_action(state)
            state.message = result.message
            continue
        if key in {ord("p"), ord("P")} and state.active_screen == "plan":
            state.message = "Plan refreshed."
            continue


def draw_app(stdscr: Any, state: TuiState, width: int, height: int) -> None:
    sidebar_width = min(32, max(24, width // 4))
    content_width = max(40, width - sidebar_width - 2)

    draw_sidebar(stdscr, state, 0, 0, sidebar_width, height)
    model = build_screen_model(state.active_screen, state)
    content_text = render_screen_model(model, width=content_width)
    draw_content(stdscr, content_text, sidebar_width + 1, 0, content_width, height)
    draw_footer(stdscr, state, 0, max(0, height - 1), width)


def draw_sidebar(stdscr: Any, state: TuiState, x: int, y: int, width: int, height: int) -> None:
    stdscr.addnstr(y, x, " Vitaltrainer ", width - 1, curses.A_REVERSE)
    stdscr.addnstr(y + 1, x, " Screens", width - 1, curses.A_BOLD)
    for index, key in enumerate(SCREEN_ORDER, start=2):
        label = screen_label(key)
        attr = curses.A_REVERSE if key == state.active_screen else curses.A_NORMAL
        if index < height - 2:
            stdscr.addnstr(y + index, x, f" {label}", width - 1, attr)
    footer_start = min(height - 8, len(SCREEN_ORDER) + 3)
    if footer_start > 2:
        current = current_focus_line(state)
        if current:
            stdscr.addnstr(y + footer_start, x, " Current", width - 1, curses.A_BOLD)
            stdscr.addnstr(y + footer_start + 1, x, f" {current}", width - 1)
            footer_start += 2
        stdscr.addnstr(y + footer_start, x, " Keys", width - 1, curses.A_BOLD)
        for offset, line in enumerate(sidebar_hints(state.active_screen), start=footer_start + 1):
            if offset < height - 1:
                stdscr.addnstr(y + offset, x, f" {line}", width - 1)


def draw_content(stdscr: Any, text: str, x: int, y: int, width: int, height: int) -> None:
    lines = text.splitlines() or [""]
    max_lines = max(1, height - 2)
    for index, line in enumerate(lines[:max_lines]):
        stdscr.addnstr(y + index, x, line.ljust(width), width)


def draw_footer(stdscr: Any, state: TuiState, x: int, y: int, width: int) -> None:
    footer = state.message or "q=quit  j/k=nav  e=edit  o=export  v=preview  l=log  m=map"
    stdscr.addnstr(y, x, footer.ljust(width - 1), width - 1, curses.A_REVERSE)


def build_screen_model(screen_key: str, state: TuiState) -> ScreenModel:
    builders: dict[str, Callable[[TuiState], ScreenModel]] = {
        "dashboard": build_dashboard_model,
        "browser": build_browser_model,
        "highlighter": build_highlighter_model,
        "preview": build_preview_model,
        "plan": build_plan_model,
        "lesson": build_lesson_model,
        "coach": build_coach_model,
        "log": build_log_model,
        "history": build_history_model,
        "report": build_report_model,
        "wger": build_wger_model,
    }
    builder = builders.get(screen_key, build_dashboard_model)
    return builder(state)


def build_dashboard_model(state: TuiState) -> ScreenModel:
    plan_result = safe_call(lambda: build_plan(template=state.plan_template, goal=state.plan_goal))
    weekly_result = safe_call(lambda: build_weekly_coverage(state.report_week))
    lesson = find_lesson(state.lesson_exercise)
    recent_logs = safe_call(lambda: read_history(state.history_exercise, limit=3))

    sections = [
        ScreenSection("Heute", [f"Plan: {state.plan_template} / {state.plan_goal}"] + summarize_plan(plan_result)),
        ScreenSection("Lernfokus", [lesson_summary(lesson)]),
        ScreenSection("Coverage", summarize_weekly_coverage(weekly_result)),
        ScreenSection("Letzte Logs", summarize_history_entries(recent_logs)),
        ScreenSection("Schnellaktionen", [
            "Plan anzeigen",
            "Exercise Browser oeffnen",
            "Coach Sheet exportieren",
            "Wochenreport oeffnen",
        ]),
    ]
    return ScreenModel(
        key="dashboard",
        title="Dashboard",
        subtitle="Was steht heute an?",
        sections=sections,
        actions=["Plan anzeigen", "Exercise Browser öffnen", "Coach Sheet exportieren", "Wochenreport öffnen"],
        footer=["e edit defaults", "o export current focus", "Enter refresh"],
    )


def build_browser_model(state: TuiState) -> ScreenModel:
    results = browser_results(state.browser_query)
    selected_index = clamp(state.browser_index, 0, max(0, len(results) - 1))
    selected_record = results[selected_index] if results else None
    resolution = safe_call(lambda: resolve_query(state.browser_query))
    record = find_exercise_record(getattr(resolution, "canonical_id", None))

    sections = [
        ScreenSection("Aufloesung", summarize_resolution(resolution)),
        ScreenSection("Treffer", summarize_browser_results(results, selected_index)),
        ScreenSection("Uebung", summarize_exercise_record(selected_record or record)),
        ScreenSection("Alias / Vorschlaege", summarize_suggestions(getattr(resolution, "suggestions", []))),
        ScreenSection("Naechste Schritte", [
            "Warum diese Uebung?",
            "Anatomie lernen",
            "Mit anderer Uebung vergleichen",
            "Zum Plan hinzufuegen",
            "Coach Sheet erstellen",
        ]),
    ]
    return ScreenModel(
        key="browser",
        title="Exercise Browser",
        subtitle=f"Query: {state.browser_query}",
        sections=sections,
        actions=["Treffer mit j/k waehlen", "h Body Highlighter", "o export exercise note"],
        footer=["/ search", "e query edit", "o export exercise note", "h highlighter"],
    )


def build_highlighter_model(state: TuiState) -> ScreenModel:
    selected = browser_selected_record(state)
    exercise_id = selected.exercise_id if selected is not None else state.log_exercise
    coverage = safe_call(lambda: calculate_coverage(exercise_id, state.log_sets, state.log_rpe))
    sections = [
        ScreenSection("Coverage", summarize_highlighter(coverage)),
        ScreenSection("Interpretation", [
            "High = stark belastet",
            "Medium = mitarbeitend",
            "Low / missing = Luecke oder wenig Aktivierung",
        ]),
    ]
    return ScreenModel(
        key="highlighter",
        title="Body Highlighter",
        subtitle=exercise_id,
        sections=sections,
        actions=["Browser-Auswahl nutzen", "Coverage lesen", "b/h/Enter zurueck"],
        footer=["b back", "h toggle", "Enter back", "o export exercise note"],
    )


def build_preview_model(state: TuiState) -> ScreenModel:
    source_key = state.preview_source_screen if state.preview_source_screen in SCREEN_ORDER else "dashboard"
    source_model = build_screen_model(source_key, state)
    markdown = render_screen_model(source_model, width=88).splitlines()
    sections = [
        ScreenSection("Quelle", [
            f"Screen: {screen_label(source_key)}",
            f"Preview source: {source_key}",
            "v oder Enter: glow oeffnen",
            "b: zurueck zur Quelle",
        ]),
        ScreenSection("Markdown", markdown[:40] + (["..."] if len(markdown) > 40 else [])),
    ]
    return ScreenModel(
        key="preview",
        title="Markdown Preview",
        subtitle=screen_label(source_key),
        sections=sections,
        actions=["Markdown in glow öffnen", "Zur Quelle zurück", "Preview erneut öffnen"],
        footer=["v open glow", "Enter open glow", "b back to source", "o export source"],
    )


def build_plan_model(state: TuiState) -> ScreenModel:
    plan_result = safe_call(lambda: build_plan(template=state.plan_template, goal=state.plan_goal))
    sections = [
        ScreenSection("Plan", summarize_plan(plan_result, include_slots=True)),
        ScreenSection("Coverage Summary", summarize_coverage_summary(getattr(plan_result, "coverage_summary", {}))),
    ]
    return ScreenModel(
        key="plan",
        title="Plan Builder",
        subtitle=f"{state.plan_template} / {state.plan_goal}",
        sections=sections,
        actions=["Template/Ziel aendern", "Plan neu berechnen", "Plan exportieren"],
        footer=["e template/goal edit", "o export plan note", "Enter refresh", "p recompute"],
    )


def build_lesson_model(state: TuiState) -> ScreenModel:
    lesson_text = safe_call(lambda: teach_exercise(state.lesson_exercise, mode="trainer"))
    lines = lesson_text.splitlines() if isinstance(lesson_text, str) else [str(lesson_text)]
    return ScreenModel(
        key="lesson",
        title="Anatomy Lesson",
        subtitle=state.lesson_exercise,
        sections=[ScreenSection("Lesson", lines)],
        actions=["Exercise aendern", "Lesson exportieren", "Trainer-Mode lesen"],
        footer=["e exercise edit", "o export lesson note", "Enter refresh"],
    )


def build_coach_model(state: TuiState) -> ScreenModel:
    sheet = safe_call(lambda: build_coach_sheet(state.coach_exercise))
    markdown = render_coach_sheet_markdown(sheet) if isinstance(sheet, dict) else str(sheet)
    return ScreenModel(
        key="coach",
        title="Coach Sheet",
        subtitle=state.coach_exercise,
        sections=[ScreenSection("Coach Sheet", markdown.splitlines())],
        actions=["Exercise aendern", "Coach Sheet exportieren", "Checkliste lesen"],
        footer=["e exercise edit", "o export coach sheet", "Enter refresh"],
    )


def build_log_model(state: TuiState) -> ScreenModel:
    recent = safe_call(lambda: read_history(state.log_exercise, limit=5))
    hint = safe_call(lambda: progress_hint(state.log_exercise))
    sections = [
        ScreenSection("Log Entry", [
            f"Exercise: {state.log_exercise}",
            f"Sets/Reps: {state.log_sets} x {state.log_reps}",
            f"Weight: {state.log_weight}",
            f"RPE: {state.log_rpe}",
            f"Workout ID: {state.log_workout_id}",
            f"Notes: {state.log_notes or '[]'}",
            f"Pain: {state.log_pain or '[]'}",
        ]),
        ScreenSection("Progress Hint", summarize_hint(hint)),
        ScreenSection("Recent Logs", summarize_history_entries(recent)),
    ]
    return ScreenModel(
        key="log",
        title="Training Log",
        subtitle=state.log_exercise,
        sections=sections,
        actions=["Log schreiben", "Eintrag bearbeiten", "Progress-Hint lesen"],
        footer=["l log current entry", "e edit entry fields", "Enter refresh"],
    )


def build_history_model(state: TuiState) -> ScreenModel:
    entries = safe_call(lambda: read_history(state.history_exercise, limit=10))
    hint = safe_call(lambda: progress_hint(state.history_exercise))
    sections = [
        ScreenSection("History", summarize_history_entries(entries)),
        ScreenSection("Progress", summarize_hint(hint)),
    ]
    return ScreenModel(
        key="history",
        title="History",
        subtitle=state.history_exercise,
        sections=sections,
        actions=["Exercise aendern", "Progress lesen"],
        footer=["e exercise edit", "Enter refresh"],
    )


def build_report_model(state: TuiState) -> ScreenModel:
    report = safe_call(lambda: build_weekly_coverage(state.report_week))
    sections = [
        ScreenSection("Weekly Coverage", summarize_weekly_coverage(report, include_details=True)),
    ]
    return ScreenModel(
        key="report",
        title="Weekly Review",
        subtitle=state.report_week,
        sections=sections,
        actions=["Woche aendern", "Wochenreport exportieren"],
        footer=["e week edit", "o export weekly report", "Enter refresh"],
    )


def build_wger_model(state: TuiState) -> ScreenModel:
    check = safe_call(wger_check)
    mapping = safe_call(lambda: get_wger_mapping(resolve_query(state.wger_exercise).canonical_id or state.wger_exercise))
    sections = [
        ScreenSection("Check", summarize_wger_check(check)),
        ScreenSection("Mapping", summarize_mapping(mapping)),
        ScreenSection("Lookup", [
            f"Exercise: {state.wger_exercise}",
            "Press m to run a live mapping search if wger is reachable.",
        ]),
    ]
    return ScreenModel(
        key="wger",
        title="Wger Bridge",
        subtitle=state.wger_exercise,
        sections=sections,
        actions=["Exercise aendern", "Wger mapping suchen", "API check"],
        footer=["e exercise edit", "m map exercise", "Enter refresh"],
    )


def handle_edit_action(stdscr: Any, state: TuiState) -> None:
    prompt_map = {
        "dashboard": ("plan template + goal + lesson exercise", f"{state.plan_template} {state.plan_goal} {state.lesson_exercise}"),
        "browser": ("exercise query", state.browser_query),
        "plan": ("template goal", f"{state.plan_template} {state.plan_goal}"),
        "lesson": ("exercise id", state.lesson_exercise),
        "coach": ("exercise id", state.coach_exercise),
        "log": ("exercise sets reps weight rpe [notes]", f"{state.log_exercise} {state.log_sets} {state.log_reps} {state.log_weight} {state.log_rpe}"),
        "history": ("exercise id", state.history_exercise),
        "report": ("week selector", state.report_week),
        "wger": ("exercise id", state.wger_exercise),
        "preview": ("source screen", state.preview_source_screen),
    }
    prompt, default = prompt_map.get(state.active_screen, ("value", ""))
    value = prompt_input(stdscr, prompt, default)
    if value is None:
        state.message = "Edit cancelled."
        return

    apply_edit(state, value)
    state.message = f"Updated {state.active_screen}."


def handle_search_action(stdscr: Any, state: TuiState) -> None:
    if state.active_screen != "browser":
        state.message = "Search is available on the browser screen."
        return
    value = prompt_input(stdscr, "search exercise", state.browser_query)
    if value is None:
        state.message = "Search cancelled."
        return
    state.browser_query = value
    state.browser_index = 0
    state.message = f"Search set to {state.browser_query}."


def handle_export_action(state: TuiState) -> ScreenActionResult:
    try:
        if state.active_screen == "browser":
            result = export_exercise_note(state.browser_query, force=False)
            return ScreenActionResult(f"Exported exercise note to {result.path}")
        if state.active_screen == "plan":
            plan = build_plan(template=state.plan_template, goal=state.plan_goal)
            result = export_plan_note(plan, force=False)
            return ScreenActionResult(f"Exported plan note to {result.path}")
        if state.active_screen == "lesson":
            result = export_teach_note(state.lesson_exercise, mode="trainer", force=False)
            return ScreenActionResult(f"Exported lesson note to {result.path}")
        if state.active_screen == "coach":
            result = export_coach_sheet_note(state.coach_exercise, force=False)
            return ScreenActionResult(f"Exported coach sheet to {result.path}")
        if state.active_screen == "report":
            _, result = export_weekly_report_note(state.report_week, force=False)
            return ScreenActionResult(f"Exported weekly report to {result.path}")
        if state.active_screen == "log":
            return ScreenActionResult("Log screen does not export.")
        return ScreenActionResult("No export available on this screen.")
    except Exception as exc:
        return ScreenActionResult(f"FAIL: {exc}")


def handle_preview_action(stdscr: Any, state: TuiState) -> ScreenActionResult:
    if state.active_screen != "preview":
        state.preview_source_screen = state.active_screen
        state.active_screen = "preview"
        return ScreenActionResult(f"Preview opened for {screen_label(state.preview_source_screen)}.")

    source_key = state.preview_source_screen if state.preview_source_screen in SCREEN_ORDER else "dashboard"
    model = build_screen_model(source_key, state)
    markdown = render_screen_model(model)
    path = write_preview_file(markdown)
    try:
        if not shutil.which("glow"):
            return ScreenActionResult("glow is not installed.")
        curses.def_prog_mode()
        curses.endwin()
        try:
            result = preview_file(path, require_tty=False)
        finally:
            curses.reset_prog_mode()
            stdscr.refresh()
        return ScreenActionResult(f"{result.message} Source preview stays on {screen_label(source_key)}.")
    except Exception as exc:
        return ScreenActionResult(f"FAIL: {exc}")
    finally:
        cleanup_preview_file(path)


def handle_log_action(state: TuiState) -> ScreenActionResult:
    try:
        result = log_training_entry(
            state.log_exercise,
            sets=state.log_sets,
            reps=state.log_reps,
            weight=state.log_weight,
            rpe=state.log_rpe,
            workout_id=state.log_workout_id,
            notes=state.log_notes,
            pain=state.log_pain,
        )
        return ScreenActionResult(f"Logged {result.exercise_id} to {result.workout_id} (row {result.row_id})")
    except Exception as exc:
        return ScreenActionResult(f"FAIL: {exc}")


def handle_wger_map_action(state: TuiState) -> ScreenActionResult:
    try:
        result = map_wger(state.wger_exercise, write=False)
        if result.selected_match is None:
            return ScreenActionResult("No wger match found.")
        return ScreenActionResult(f"Best wger match: {result.selected_match.name} ({result.selected_match.wger_id})")
    except Exception as exc:
        return ScreenActionResult(f"FAIL: {exc}")


def apply_edit(state: TuiState, value: str) -> None:
    text = value.strip()
    if state.active_screen == "browser":
        state.browser_query = text
        state.browser_index = 0
        return
    if state.active_screen == "plan":
        parts = text.split()
        if parts:
            state.plan_template = parts[0]
        if len(parts) > 1:
            state.plan_goal = " ".join(parts[1:])
        return
    if state.active_screen == "lesson":
        state.lesson_exercise = text
        return
    if state.active_screen == "coach":
        state.coach_exercise = text
        return
    if state.active_screen == "log":
        parse_log_edit(state, text)
        return
    if state.active_screen == "history":
        state.history_exercise = text
        return
    if state.active_screen == "report":
        state.report_week = text or "current"
        return
    if state.active_screen == "wger":
        state.wger_exercise = text
        return
    if state.active_screen == "preview":
        state.preview_source_screen = text or state.preview_source_screen
        return
    if state.active_screen == "dashboard":
        state.plan_template = text or state.plan_template


def parse_log_edit(state: TuiState, text: str) -> None:
    parts = text.split()
    if len(parts) >= 5:
        state.log_exercise = parts[0]
        state.log_sets = parse_int(parts[1], state.log_sets)
        state.log_reps = parse_int(parts[2], state.log_reps)
        state.log_weight = parse_float(parts[3], state.log_weight)
        state.log_rpe = parse_int(parts[4], state.log_rpe)
        remainder = " ".join(parts[5:]).strip()
        if remainder:
            state.log_notes = remainder


def prompt_input(stdscr: Any, prompt: str, default: str = "") -> str | None:
    curses.echo()
    try:
        height, width = stdscr.getmaxyx()
        message = f"{prompt} [{default}]: " if default else f"{prompt}: "
        stdscr.addnstr(height - 1, 0, " " * (width - 1), width - 1)
        stdscr.addnstr(height - 1, 0, message, width - 1)
        stdscr.refresh()
        raw = stdscr.getstr(height - 1, len(message), max(1, width - len(message) - 1))
        if not raw:
            return default
        value = raw.decode("utf-8", errors="ignore").strip()
        return value or default
    finally:
        curses.noecho()


def next_screen(active: str) -> str:
    index = SCREEN_ORDER.index(active) if active in SCREEN_ORDER else 0
    return SCREEN_ORDER[(index + 1) % len(SCREEN_ORDER)]


def previous_screen(active: str) -> str:
    index = SCREEN_ORDER.index(active) if active in SCREEN_ORDER else 0
    return SCREEN_ORDER[(index - 1) % len(SCREEN_ORDER)]


def render_screen_model(model: ScreenModel, *, width: int = 88) -> str:
    lines: list[str] = []
    lines.append(f"{model.title}")
    if model.subtitle:
        lines.append(f"{model.subtitle}")
    lines.append("")
    if model.actions:
        lines.append("## Main Actions")
        for action in model.actions:
            lines.append(f"- {action}")
        lines.append("")
    for section in model.sections:
        lines.append(f"## {section.title}")
        for line in section.lines:
            wrapped = wrap_line(line, width=width)
            lines.extend(wrapped or [""])
        lines.append("")
    if model.footer:
        lines.append("Actions:")
        for item in model.footer:
            lines.append(f"- {item}")
    return "\n".join(lines).rstrip() + "\n"


def wrap_line(line: str, *, width: int) -> list[str]:
    text = str(line).strip()
    if not text:
        return [""]
    return textwrap.wrap(text, width=width, break_long_words=False, break_on_hyphens=False) or [text]


def summarize_plan(plan_result: Any, *, include_slots: bool = False) -> list[str] | str:
    if isinstance(plan_result, Exception):
        return [f"FAIL: {plan_result}"]
    if not hasattr(plan_result, "slots"):
        return [str(plan_result)]
    lines = [
        f"Template: {getattr(plan_result, 'template', '')}",
        f"Goal: {getattr(plan_result, 'goal', '')}",
    ]
    if include_slots:
        slots = getattr(plan_result, "slots", [])
        for slot in slots:
            if isinstance(slot, dict):
                name = slot.get("name", "")
                exercise = slot.get("selected_exercise") or "-"
                lines.append(f"- {name}: {exercise}")
    return lines


def summarize_coverage_summary(summary: Any) -> list[str]:
    if not isinstance(summary, dict):
        return [str(summary)]
    lines = [
        f"Sets: {summary.get('sets', '')}",
        f"RPE: {summary.get('rpe', '')}",
        f"Selected exercises: {len(summary.get('selected_exercises', []))}",
    ]
    lines.extend(f"{key}: {value}" for key, value in summary.get("muscle_scores", {}).items())
    if summary.get("body_region_scores"):
        lines.append("Body regions:")
        lines.extend(f"- {key}: {value}" for key, value in summary["body_region_scores"].items())
    if summary.get("unmapped_muscles"):
        lines.append(f"Unmapped: {', '.join(summary['unmapped_muscles'])}")
    return lines


def summarize_weekly_coverage(weekly_result: Any, *, include_details: bool = False) -> list[str] | str:
    if not isinstance(weekly_result, dict):
        return [str(weekly_result)]
    lines = [
        f"Week: {weekly_result.get('week', '')}",
        f"Entries: {weekly_result.get('entries_count', 0)}",
        f"Missing regions: {format_list(weekly_result.get('missing_regions', []))}",
        f"Low regions: {format_list(weekly_result.get('low_regions', []))}",
        f"High regions: {format_list(weekly_result.get('high_regions', []))}",
    ]
    if include_details:
        lines.append("Body region scores:")
        lines.extend(f"- {key}: {value}" for key, value in weekly_result.get("body_region_scores", {}).items())
        lines.append("Recommendations:")
        lines.extend(f"- {item}" for item in weekly_result.get("recommendations", []))
    return lines


def summarize_exercise_record(record: Any) -> list[str]:
    if record is None:
        return ["No exercise found."]
    orig_desc = getattr(record, 'original_description', None) or getattr(record, 'instructions', None)
    if isinstance(orig_desc, list):
        orig_desc_str = " | ".join(orig_desc)
    else:
        orig_desc_str = str(orig_desc) if orig_desc else "—"

    return [
        f"Canonical ID: {record.exercise_id}",
        f"wger ID: {getattr(record, 'wger_id', None) or '—'}",
        f"yuhonas ID: {getattr(record, 'yuhonas_id', None) or '—'}",
        f"German: {getattr(record, 'german', '')}",
        f"Display name: {record.display_name}",
        f"Category: {record.source_file.removesuffix('.yml')}",
        f"Movement pattern: {getattr(record, 'movement_pattern', '')}",
        f"Equipment: {format_list(getattr(record, 'equipment', []) or [])}",
        f"Primary muscles: {format_list(getattr(record, 'primary_muscles', []) or [])}",
        f"Secondary muscles: {format_list(getattr(record, 'secondary_muscles', []) or [])}",
        f"Stabilizers: {format_list(getattr(record, 'stabilizers', []) or [])}",
        f"Variations: {format_list(getattr(record, 'variations', []) or [])}",
        f"Coaching notes (KI/Expert): {format_list(getattr(record, 'coaching_notes', []) or [])}",
        f"Original Description (wger/yuhonas): {orig_desc_str}",
        f"Geloggt von (UID): {getattr(record, 'logged_by_uid', None) or '—'}",
        f"Common errors: {format_list(getattr(record, 'common_errors', []) or [])}",
        f"Tags: {format_list(getattr(record, 'tags', []) or [])}",
    ]


def summarize_resolution(resolution: Any) -> list[str]:
    if not hasattr(resolution, "matched"):
        return [str(resolution)]
    lines = [
        f"Query: {getattr(resolution, 'query', '')}",
        f"Matched: {getattr(resolution, 'matched', False)}",
        f"Canonical ID: {getattr(resolution, 'canonical_id', '')}",
        f"Display name: {getattr(resolution, 'display_name', '')}",
        f"Source: {getattr(resolution, 'source', '')}",
        f"Confidence: {getattr(resolution, 'confidence', '')}",
    ]
    return lines


def summarize_suggestions(suggestions: Any) -> list[str]:
    if not isinstance(suggestions, list) or not suggestions:
        return ["No suggestions."]
    lines: list[str] = []
    for item in suggestions[:5]:
        if isinstance(item, dict):
            lines.append(f"- {item.get('canonical_id', '')}: {item.get('display_name', '')}")
        else:
            lines.append(str(item))
    return lines


def summarize_browser_results(results: list[Any], selected_index: int) -> list[str]:
    if not results:
        return ["No results."]
    lines: list[str] = []
    for index, record in enumerate(results[:8]):
        prefix = ">" if index == selected_index else " "
        aliases = format_list(getattr(record, "aliases", []) or [])
        lines.append(f"{prefix} {record.exercise_id} | {record.display_name} | {aliases}")
    return lines


def summarize_history_entries(entries: Any) -> list[str]:
    if not isinstance(entries, list) or not entries:
        return ["No history yet."]
    lines: list[str] = []
    for entry in entries[:5]:
        if isinstance(entry, dict):
            lines.append(
                f"- {entry.get('date', '')} | {entry.get('exercise_id', '')} | "
                f"{entry.get('sets', '')}x{entry.get('reps', '')} @ {entry.get('weight', '')} RPE {entry.get('rpe', '')}"
            )
        else:
            lines.append(str(entry))
    return lines


def summarize_hint(hint: Any) -> list[str]:
    if not isinstance(hint, dict):
        return [str(hint)]
    return [
        f"Suggestion: {hint.get('suggestion', '')}",
        f"Reason: {hint.get('reason', '')}",
    ]


def summarize_wger_check(check: Any) -> list[str]:
    if not hasattr(check, "lines"):
        return [str(check)]
    lines: list[str] = []
    for line in check.lines:
        lines.append(f"[{line.level}] {line.message}")
    if getattr(check, "has_failures", False):
        lines.append("Status: FAIL")
    elif getattr(check, "has_warnings", False):
        lines.append("Status: WARN")
    else:
        lines.append("Status: OK")
    return lines


def summarize_highlighter(coverage: Any) -> list[str]:
    if not isinstance(coverage, dict):
        return [str(coverage)]
    lines: list[str] = [
        f"Exercise: {coverage.get('exercise_id', '')}",
        f"Sets: {coverage.get('sets', '')}",
        f"RPE: {coverage.get('rpe', '')}",
        "",
        "Body Regions",
    ]
    body_regions = coverage.get("body_region_scores", {})
    if isinstance(body_regions, dict):
        for region, score in body_regions.items():
            lines.append(f"- {region}: {bar(score)} {score}")
    unmapped = coverage.get("unmapped_muscles", [])
    if unmapped:
        lines.extend(["", "Unmapped Muscles"])
        for item in unmapped:
            lines.append(f"- {item}")
    return lines


def summarize_mapping(mapping: Any) -> list[str]:
    if not isinstance(mapping, dict) or not mapping:
        return ["No mapping stored."]
    return [f"- {key}: {value}" for key, value in mapping.items()]


def format_list(values: list[Any]) -> str:
    if not values:
        return "[]"
    return ", ".join(str(value) for value in values)


def bar(value: Any) -> str:
    try:
        score = float(value)
    except (TypeError, ValueError):
        score = 0.0
    filled = max(0, min(10, int(round(score))))
    return "[" + ("#" * filled) + ("." * (10 - filled)) + "]"


def lesson_summary(lesson: Any) -> str:
    if not isinstance(lesson, dict):
        return "No lesson available."
    goal = lesson.get("learning_goal", {})
    if isinstance(goal, dict):
        short = goal.get("short", "")
        detailed = goal.get("detailed", "")
        return f"{short} / {detailed}"
    return str(lesson)


def browser_results(query: str) -> list[Any]:
    resolution = resolve_query(query)
    records = build_exercise_index()
    if getattr(resolution, "matched", False) and getattr(resolution, "canonical_id", None):
        selected = [record for record in records if record.exercise_id == resolution.canonical_id]
        if selected:
            extras = [record for record in records if record.exercise_id != resolution.canonical_id and match_query(query, record)]
            return selected + extras[:7]
    matched = [record for record in records if match_query(query, record)]
    if matched:
        return matched[:8]
    suggestions = [item.get("canonical_id") for item in getattr(resolution, "suggestions", []) if isinstance(item, dict)]
    suggested = [record for record in records if record.exercise_id in suggestions]
    if suggested:
        return suggested[:8]
    return records[:8]


def browser_selected_record(state: TuiState) -> Any:
    results = browser_results(state.browser_query)
    if not results:
        return None
    index = clamp(state.browser_index, 0, len(results) - 1)
    return results[index]


def match_query(query: str, record: Any) -> bool:
    normalized_query = normalize_text(query)
    if not normalized_query:
        return True
    for candidate in candidate_texts(record):
        if normalized_query in normalize_text(candidate):
            return True
    return False


def clamp(value: int, minimum: int, maximum: int) -> int:
    return max(minimum, min(maximum, value))


def move_browser_selection(state: TuiState, delta: int) -> None:
    results = browser_results(state.browser_query)
    if not results:
        state.browser_index = 0
        return
    state.browser_index = clamp(state.browser_index + delta, 0, len(results) - 1)


def navigate_vertical(state: TuiState, delta: int) -> None:
    if state.active_screen != "browser":
        state.active_screen = next_screen(state.active_screen) if delta > 0 else previous_screen(state.active_screen)
        return

    results = browser_results(state.browser_query)
    if not results:
        state.active_screen = next_screen(state.active_screen) if delta > 0 else previous_screen(state.active_screen)
        return

    if delta > 0:
        if state.browser_index >= len(results) - 1:
            state.active_screen = next_screen(state.active_screen)
        else:
            move_browser_selection(state, 1)
        return

    if state.browser_index <= 0:
        state.active_screen = previous_screen(state.active_screen)
    else:
        move_browser_selection(state, -1)


def current_focus_line(state: TuiState) -> str:
    if state.active_screen == "browser":
        return f"search: {state.browser_query}"
    if state.active_screen == "highlighter":
        selected = browser_selected_record(state)
        return selected.exercise_id if selected is not None else state.log_exercise
    if state.active_screen == "preview":
        return f"source: {screen_label(state.preview_source_screen)}"
    if state.active_screen == "plan":
        return f"{state.plan_template} / {state.plan_goal}"
    if state.active_screen == "lesson":
        return state.lesson_exercise
    if state.active_screen == "coach":
        return state.coach_exercise
    if state.active_screen == "log":
        return f"{state.log_exercise} {state.log_sets}x{state.log_reps} @ {state.log_weight}"
    if state.active_screen == "history":
        return state.history_exercise
    if state.active_screen == "report":
        return state.report_week
    if state.active_screen == "wger":
        return state.wger_exercise
    return f"{state.plan_template} / {state.plan_goal}"


def find_exercise_record(exercise_id: str | None) -> Any:
    if not exercise_id:
        return None
    for record in build_exercise_index():
        if record.exercise_id == exercise_id:
            return record
    return None


def safe_call(func: Callable[[], Any]) -> Any:
    try:
        return func()
    except Exception as exc:
        return exc


def screen_label(key: str) -> str:
    labels = {
        "dashboard": "Dashboard",
        "browser": "Exercise Browser",
        "plan": "Plan Builder",
        "lesson": "Anatomy Lesson",
        "coach": "Coach Sheet",
        "log": "Training Log",
        "history": "History",
        "report": "Weekly Review",
        "wger": "Wger Bridge",
        "preview": "Markdown Preview",
    }
    return labels.get(key, key)


def sidebar_hints(active: str) -> list[str]:
    hints = ["j/k nav", "e edit", "o export", "v preview"]
    if active == "browser":
        hints.insert(1, "/ search")
        hints.append("h highlighter")
    if active == "highlighter":
        hints.append("b back")
    if active == "preview":
        hints.append("b source")
    if active == "log":
        hints.append("l log")
    if active == "wger":
        hints.append("m map")
    return hints


def parse_int(value: str, fallback: int) -> int:
    try:
        return int(value)
    except ValueError:
        return fallback


def parse_float(value: str, fallback: float) -> float:
    try:
        return float(value)
    except ValueError:
        return fallback


if __name__ == "__main__":
    run_tui()
