"""coach_ai.py — Zwei-KI-Analyse für Klienten-Logs.

KI 1 (Gemini) entwirft/analysiert, KI 2 (Claude Haiku) prüft gegen — gleiches
Muster wie call_gemini()/review_with_haiku() im Exercise-Enrichment
(fitness/catalog/agent/gemini.py), hier angewendet auf zwei Aufgaben:

- check_training_gap(): Trainingslücke plausibel durch Journal erklärt
  (Urlaub, Auslandseinsatz, Krankheit) oder echte Auffälligkeit?
- draft_session_feedback(): Coach-Feedback-Entwurf zu einem geloggten Workout.

Beide best-effort: liefern None statt zu crashen, wenn Gemini/Haiku fehlen
oder fehlschlagen (kein API-Key, Rate-Limit, Timeout).
"""
from __future__ import annotations

import json
from datetime import date
from typing import Any

from fitness.catalog.agent.gemini import _call, _call_haiku_cli, load_gemini_key

GAP_THRESHOLD_DAYS = 6

PROMPT_GAP_CHECK = """
Du bist ein aufmerksamer Personal Trainer, der die Trainingshistorie eines Klienten prüft.

Klient: {client_name}
Letzte geloggte Trainingseinheit: {last_session_date} ({days_gap} Tage her)

Journal-Einträge seit der Lücke (falls vorhanden):
{journal_text}

Frage: Erklärt der Journal-Text die Trainingspause plausibel (z.B. Urlaub,
Auslandseinsatz, Krankheit, Verletzung, bewusste Deload-Woche)? Antworte NUR
mit einem JSON-Objekt:
{{"explained": true, "reason": "Kurze Begruendung auf Deutsch, 1 Satz"}}
"""

PROMPT_GAP_REVIEW = """
Ein anderes Modell hat folgende Einschaetzung zu einer Trainingsluecke abgegeben:
{draft_json}

Klient: {client_name}, Luecke: {days_gap} Tage
Journal-Text: {journal_text}

Pruefe kurz gegen: ist "explained" korrekt eingeschaetzt? Gib das ggf.
korrigierte JSON zurueck (gleiche Struktur: explained, reason). Antworte NUR
mit dem JSON-Objekt, kein Markdown.
"""

PROMPT_FEEDBACK_DRAFT = """
Du bist ein erfahrener Personal Trainer. Schreibe ein kurzes, konkretes
Feedback (2-3 Saetze, Deutsch, direkte Ansprache "Du") zu folgendem geloggten
Workout eines Klienten:

{session_json}

Fokussiere auf: Anerkennung + einen konkreten, umsetzbaren Hinweis (Form,
Progression, Regeneration). Kein generisches Geschwafel. Antworte NUR mit dem
Feedback-Text, kein JSON, keine Anfuehrungszeichen.
"""

PROMPT_FEEDBACK_REVIEW = """
Ein anderes Modell hat folgendes Coach-Feedback zu einem Workout entworfen:
"{draft}"

Workout-Daten: {session_json}

Pruefe: ist es spezifisch (nicht generisch), korrekt bezogen auf die Uebungen,
angemessen im Ton? Gib den ggf. verbesserten Feedback-Text zurueck (nur Text,
keine Anfuehrungszeichen, kein JSON). Falls bereits gut, unveraendert
zurueckgeben.
"""


def _extract_json(text: str | None) -> dict | None:
    if not text:
        return None
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1:
        return None
    try:
        return json.loads(text[start : end + 1])
    except Exception:
        return None


def check_training_gap(
    client_name: str,
    last_session_date: str | None,
    journal_text: str,
    api_key: str | None = None,
) -> dict[str, Any] | None:
    """Gibt {"explained": bool, "reason": str, "days_gap": int} zurueck, oder
    None wenn keine Luecke ueber der Schwelle liegt."""
    api_key = api_key or load_gemini_key()

    days_gap: int | None = None
    if last_session_date:
        try:
            days_gap = (date.today() - date.fromisoformat(last_session_date)).days
        except Exception:
            days_gap = None

    if days_gap is None or days_gap < GAP_THRESHOLD_DAYS:
        return None

    prompt = PROMPT_GAP_CHECK.format(
        client_name=client_name,
        last_session_date=last_session_date,
        days_gap=days_gap,
        journal_text=journal_text or "(keine Eintraege)",
    )
    text = _call(prompt, api_key) if api_key else None
    draft = _extract_json(text)
    if not draft:
        return {"explained": False, "reason": "KI nicht verfuegbar", "days_gap": days_gap}

    review_text = _call_haiku_cli(
        PROMPT_GAP_REVIEW.format(
            draft_json=json.dumps(draft, ensure_ascii=False),
            client_name=client_name,
            days_gap=days_gap,
            journal_text=journal_text or "(keine Eintraege)",
        )
    )
    reviewed = _extract_json(review_text)
    result = reviewed or draft
    result["days_gap"] = days_gap
    return result


def draft_session_feedback(session: dict[str, Any], api_key: str | None = None) -> str | None:
    """Zwei-KI-Feedback-Entwurf zu einem Workout. None bei Fehler."""
    api_key = api_key or load_gemini_key()
    session_json = json.dumps(session, ensure_ascii=False, indent=2)[:3000]

    draft = _call(PROMPT_FEEDBACK_DRAFT.format(session_json=session_json), api_key) if api_key else None
    if not draft:
        return None
    draft = draft.strip()

    reviewed = _call_haiku_cli(PROMPT_FEEDBACK_REVIEW.format(draft=draft, session_json=session_json))
    return (reviewed or draft).strip()
