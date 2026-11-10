from __future__ import annotations

import json
import subprocess
from dataclasses import dataclass
from typing import Any

import yaml

from fitness.catalog.core.muscles import iter_muscle_documents


@dataclass
class AgentChatResult:
    provider: str
    response: str


def _catalog_vocab_summary() -> str:
    buckets: list[str] = []
    details: list[str] = []
    try:
        for doc_id, doc in iter_muscle_documents():
            if doc.get("kb_level") == "region":
                buckets.append(doc_id)
            elif doc.get("kb_level") == "muscle":
                details.append(doc_id)
    except Exception:
        return ""

    parts = []
    if buckets:
        parts.append("Region buckets: " + ", ".join(sorted(set(buckets))))
    if details:
        parts.append("Fine muscle ids: " + ", ".join(sorted(set(details))))
    return "\n".join(parts)


def build_exercise_chat_prompt(
    *,
    context_title: str,
    source: str,
    exercise: dict[str, Any],
    question: str,
    history: list[tuple[str, str]] | None = None,
) -> str:
    prior = ""
    if history:
        prior = "\n\nBisheriger Chat:\n" + "\n".join(
            f"Coach: {q}\nAgent: {a}" for q, a in history[-6:]
        )

    vocab = _catalog_vocab_summary()
    vocab_section = f"\n\nAktueller Muscle-Catalog-Auszug:\n{vocab}" if vocab else ""
    exercise_yaml = yaml.dump(exercise, allow_unicode=True, sort_keys=False)

    return f"""Du bist der lokale Fitness-Catalog Review-Agent.
Antworte knapp, fachlich und auf Deutsch. Du beraetst den Coach zu einer einzelnen Exercise.

Regeln:
- Keine Dateien aendern.
- Kein Approval erfinden.
- Nutze die vorhandene Catalog-Sprache und Muscle-IDs.
- Wenn die aktuelle Exercise-Muskelzuordnung zu grob oder falsch wirkt, sag konkret welche Felder du aendern wuerdest.
- Unterscheide primary_muscles, secondary_muscles und stabilizers.
- Wenn du unsicher bist, sage warum und welche Rueckfrage an den Coach sinnvoll ist.

Kontext: {context_title}
Quelle: {source}
Exercise YAML:
{exercise_yaml}{vocab_section}{prior}

Neue Coach-Frage:
{question}
"""


def _run_haiku(prompt: str, timeout: int) -> str | None:
    result = subprocess.run(
        ["claude", "-p", prompt, "--model", "haiku", "--output-format", "text"],
        capture_output=True,
        text=True,
        timeout=timeout,
    )
    return result.stdout.strip() or None


def _run_codex(prompt: str, timeout: int) -> str | None:
    codex_prompt = (
        prompt
        + "\n\nAntworte nur als beratender Fitness-Catalog-Agent. "
        "Keine Tools benutzen, keine Dateien aendern."
    )
    result = subprocess.run(
        ["codex", "exec", "--sandbox", "read-only", "--skip-git-repo-check", "-"],
        input=codex_prompt,
        capture_output=True,
        text=True,
        timeout=timeout,
    )
    return result.stdout.strip() or None


def call_exercise_agent_chat(
    *,
    context_title: str,
    source: str,
    exercise: dict[str, Any],
    question: str,
    history: list[tuple[str, str]] | None = None,
    provider: str = "auto",
    timeout: int = 120,
) -> AgentChatResult:
    prompt = build_exercise_chat_prompt(
        context_title=context_title,
        source=source,
        exercise=exercise,
        question=question,
        history=history,
    )
    providers = ["haiku", "codex"] if provider == "auto" else [provider]
    errors: list[str] = []

    for candidate in providers:
        try:
            if candidate == "haiku":
                response = _run_haiku(prompt, timeout)
            elif candidate == "codex":
                response = _run_codex(prompt, timeout)
            else:
                raise ValueError(f"Unbekannter Agent-Provider: {candidate}")
        except Exception as exc:
            errors.append(f"{candidate}: {exc}")
            continue
        if response:
            return AgentChatResult(provider=candidate, response=response)
        errors.append(f"{candidate}: leere Antwort")

    raise RuntimeError("Kein Agent-Provider verfuegbar: " + "; ".join(errors))


def exercise_to_chat_dict(exercise: Any) -> dict[str, Any]:
    if isinstance(exercise, dict):
        return exercise
    if hasattr(exercise, "__dataclass_fields__"):
        return {
            key: value
            for key, value in exercise.__dict__.items()
            if not key.startswith("_") and value not in (None, "", [], {})
        }
    try:
        return json.loads(json.dumps(exercise, default=str))
    except TypeError:
        return {"value": str(exercise)}
