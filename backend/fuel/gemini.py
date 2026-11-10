"""Unified Gemini client for fuel nutrition estimation.

Eine Funktion `estimate_nutrition(description)` ruft Gemini EINMAL und
liefert macros + micros + component-breakdown in einem Response zurück.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
from typing import Any

from loguru import logger

from pathlib import Path

from .omega3 import OMEGA3_RULES, OMEGA3_KEYS, normalize_omega3
from .constants.nutrients import MICRO_KEYS as NUTRIENT_KEYS
from . import claude_cli
from . import vibe_cli
from . import log as _log  # configures loguru
from . import paths as _paths

_log.setup()


def _read_env_file(path: Path) -> dict[str, str]:
    out: dict[str, str] = {}
    try:
        for line in path.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            out[k.strip()] = v.strip().strip('"').strip("'")
    except OSError:
        pass
    return out


def _load_all_credentials() -> list[dict]:
    """Sammelt alle verfügbaren Gemini-Keys aus ~/.env/*.env für Fallback."""
    candidates = ["gemini.env", "fuel.env", "fitness.env", "relax.env"]
    env_dir = Path.home() / ".env"
    seen_keys: set[str] = set()
    creds: list[dict] = []
    # Process-env zuerst (falls explizit gesetzt)
    proc_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if proc_key:
        creds.append({
            "key": proc_key,
            "model": os.environ.get("GEMINI_MODEL", "gemini-flash-latest"),
            "source": "env",
        })
        seen_keys.add(proc_key)
    for name in candidates:
        data = _read_env_file(env_dir / name)
        k = (data.get("GEMINI_API_KEY") or "").strip()
        if not k or k in seen_keys:
            continue
        creds.append({
            "key": k,
            "model": data.get("GEMINI_MODEL", "gemini-flash-latest"),
            "source": name,
        })
        seen_keys.add(k)
    return creds


GEMINI_CREDENTIALS = _load_all_credentials()
GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models"
# Backwards-compat module-level constants (used by external scripts)
GEMINI_API_KEY = GEMINI_CREDENTIALS[0]["key"] if GEMINI_CREDENTIALS else ""
GEMINI_MODEL = GEMINI_CREDENTIALS[0]["model"] if GEMINI_CREDENTIALS else "gemini-flash-latest"
GEMINI_API_URL = f"{GEMINI_API_BASE}/{GEMINI_MODEL}:generateContent"

MACRO_KEYS = ("kcal", "protein", "carbs", "fat")
MICRO_KEYS = tuple(NUTRIENT_KEYS)

PROMPT_TEMPLATE = """Schätze die Nährwerte (Makro- + Mikronährstoffe) für folgende Beschreibung:
"{description}"

WICHTIGE REGELN:
1. Explizite Mengen (z.B. "250g", "500ml", "2 Stück", "1 Portion") EXAKT für diese Menge schätzen — NICHT pro 100g, NICHT pro Standardportion.
2. Auf Zusatzangaben zur Größe/Menge achten ("klein", "groß", "ein bisschen", "viel", "halbe", "doppelte Portion") und entsprechend skalieren.
3. Bei mehreren Komponenten: Summe der Werte über alle Komponenten in den angegebenen Mengen.
4. Wenn keine Menge/Größenangabe vorhanden ist: realistische durchschnittliche Portion annehmen.
5. Markenangaben (z.B. "Hubers", "Clever", "Billa") nutzen wenn Etikettwerte bekannt sind.
6. Trockenwaren (Reis, Nudeln, Pasta, Couscous, Bulgur, Quinoa, Getreide, Mehl, Haferflocken, Hülsenfrüchte/Linsen/Bohnen/Kichererbsen) IMMER als Rohgewicht interpretieren, AUSSER es steht explizit "gekocht", "cooked" oder "zubereitet" dabei. Roher Reis ≈ 350 kcal/100g, gekochter ≈ 130 kcal/100g — das macht einen Faktor ~2,7 aus. Im components-Feld immer dazuschreiben, ob roh oder gekocht interpretiert wurde.
7. Eier ohne Haltungs-/Herkunftsangabe IMMER als Freilandei annehmen (Standard für diesen Nutzer). Ein Ei Größe M = ~50 g Ei-Inhalt ≈ 68 kcal / 6,3 g Protein / 5,0 g Fett. Freilandeier haben etwas mehr Omega-3 und Vitamin D als Bodenhaltung.

Antworte NUR mit JSON (keine Erklärungen, keine Markdown-Codeblöcke):
{{
  "macros": {{
    "kcal": <Zahl>, "protein": <Zahl>, "carbs": <Zahl>, "fat": <Zahl>
  }},
  "micros": {{
    "vitamin_a_ug": <Zahl>, "vitamin_d_ug": <Zahl>, "vitamin_e_mg": <Zahl>, "vitamin_k_ug": <Zahl>,
    "vitamin_c_mg": <Zahl>, "vitamin_b1_mg": <Zahl>, "vitamin_b2_mg": <Zahl>, "vitamin_b3_mg": <Zahl>,
    "vitamin_b5_mg": <Zahl>, "vitamin_b6_mg": <Zahl>, "vitamin_b7_ug": <Zahl>, "folate_ug": <Zahl>,
    "vitamin_b12_ug": <Zahl>, "calcium_mg": <Zahl>, "phosphorus_mg": <Zahl>, "magnesium_mg": <Zahl>,
    "iron_mg": <Zahl>, "zinc_mg": <Zahl>, "selenium_ug": <Zahl>, "iodine_ug": <Zahl>,
    "potassium_mg": <Zahl>, "sodium_mg": <Zahl>, "boron_mg": <Zahl>, "omega3_mg": <Zahl>
  }},
  "components": [
    {{"name": "<komponente>", "qty": "<wie interpretiert>", "kcal": <Zahl>, "protein": <Zahl>, "carbs": <Zahl>, "fat": <Zahl>}}
  ]
}}
"""


def _extract_json(text: str) -> dict | None:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text, flags=re.DOTALL)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if match:
            try:
                return json.loads(match.group())
            except json.JSONDecodeError:
                return None
    return None


def _empty_response(error: str) -> dict:
    return {
        "macros": dict.fromkeys(MACRO_KEYS, 0),
        "micros": dict.fromkeys(MICRO_KEYS, 0),
        "components": [],
        "_error": error,
    }


def _normalize_macros(raw: dict) -> dict:
    return {
        "kcal": int(raw.get("kcal", 0) or 0),
        "protein": round(float(raw.get("protein", 0) or 0) * 10) / 10,
        "carbs": round(float(raw.get("carbs", 0) or 0) * 10) / 10,
        "fat": round(float(raw.get("fat", 0) or 0) * 10) / 10,
    }


def _normalize_micros(raw: dict) -> dict:
    out = {k: float(raw.get(k, 0) or 0) for k in MICRO_KEYS if k not in OMEGA3_KEYS}
    out.update({k: v for k, v in normalize_omega3(raw).items() if k in OMEGA3_KEYS})
    return out


def _call_one_credential(cred: dict, prompt: str, *, image_b64: str | None = None, mime_type: str = "image/jpeg", retries: int, timeout: int, log_label: str) -> dict:
    """Single-credential call with backoff retry. Returns {ok, text, error, retry_other?}."""
    url = f"{GEMINI_API_BASE}/{cred['model']}:generateContent"
    parts = []
    if image_b64:
        parts.append({"inline_data": {"mime_type": mime_type, "data": image_b64}})
    parts.append({"text": prompt})
    payload = {"contents": [{"parts": parts}]}
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")

    last_err = "unknown"
    for attempt in range(retries + 1):
        try:
            req = urllib.request.Request(
                url,
                data=data,
                headers={"Content-Type": "application/json", "X-goog-api-key": cred["key"]},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                result = json.loads(resp.read())
        except urllib.error.HTTPError as e:
            last_err = f"HTTP {e.code}"
            # 400/429/403 (bad request / quota / key invalid) → sofort anderen Key probieren
            if e.code in (400, 403, 429):
                logger.warning(f"{log_label} [{cred['source']}/{cred['model']}] {last_err} — switching key")
                return {"ok": False, "error": last_err, "retry_other": True}
            # 503/500 (server busy) → backoff
            if e.code in (500, 502, 503) and attempt < retries:
                backoff = 2 ** attempt * 2
                logger.warning(f"{log_label} [{cred['source']}] {last_err} (attempt {attempt+1}/{retries+1}) — retry in {backoff}s")
                time.sleep(backoff)
                continue
            logger.error(f"{log_label} [{cred['source']}] failed: {last_err}")
            return {"ok": False, "error": last_err}
        except Exception as e:
            last_err = str(e)
            if attempt < retries:
                backoff = 2 ** attempt * 2
                logger.warning(f"{log_label} [{cred['source']}] '{last_err}' (attempt {attempt+1}/{retries+1}) — retry in {backoff}s")
                time.sleep(backoff)
                continue
            logger.error(f"{log_label} [{cred['source']}] failed: {last_err}")
            return {"ok": False, "error": last_err, "retry_other": True}  # network → try other key

        candidates = result.get("candidates") or []
        if not candidates:
            # Empty response can mean quota soft-block or content filter — try next key
            logger.warning(f"{log_label} [{cred['source']}] no candidates — switching key")
            return {"ok": False, "error": "no candidates", "retry_other": True}
        text = candidates[0]["content"]["parts"][0]["text"]
        logger.info(f"{log_label} ok via [{cred['source']}/{cred['model']}]")
        return {"ok": True, "text": text}

    return {"ok": False, "error": last_err}


def call_gemini(prompt: str, *, image_b64: str | None = None, mime_type: str = "image/jpeg", retries: int = 2, timeout: int = 30, log_label: str = "Gemini") -> dict:
    """Multi-key Gemini call. Iteriert über alle verfügbaren Keys bei 429/403/network.

    Returns {ok, text, error}.
    """
    if not GEMINI_CREDENTIALS:
        logger.error("Kein GEMINI_API_KEY in ~/.env/{gemini,fuel,fitness,relax}.env gefunden")
        return {"ok": False, "error": "no credentials"}

    logger.info(f"{log_label} call: prompt={prompt[:60]!r}… ({len(GEMINI_CREDENTIALS)} keys verfügbar, image={'yes' if image_b64 else 'no'})")
    last_err = "unknown"
    for cred in GEMINI_CREDENTIALS:
        res = _call_one_credential(cred, prompt, image_b64=image_b64, mime_type=mime_type, retries=retries, timeout=timeout, log_label=log_label)
        if res["ok"]:
            return res
        last_err = res["error"]
        if not res.get("retry_other"):
            return res  # harter Fehler (z.B. 400 bad request) → keine Key-Rotation
    logger.error(f"{log_label} alle {len(GEMINI_CREDENTIALS)} Keys ausgeschöpft: {last_err}")
    return {"ok": False, "error": f"all keys exhausted: {last_err}"}


CLAUDE_PROMPT_SUFFIX = """
Wenn eine Marke/ein Produktname genannt ist (z.B. "Wertvoll", "Hubers", "Billa"),
nutze WebSearch um die offizielle Nährwerttabelle des Herstellers zu finden und
rechne die Werte exakt auf die angegebene Menge um, statt zu schätzen. Wenn keine
Marke erkennbar ist oder nichts gefunden wird, schätze wie gewohnt.
"""


VERIFY_PROMPT = """Prüfe eine Nährwert-Schätzung auf Plausibilität.
Mahlzeit: {description}
Schätzung (gesamte Portion): kcal={kcal}, Protein={protein} g, Kohlenhydrate={carbs} g, Fett={fat} g
{reference}
Rechne die Mahlzeit nach (Mengen, Nährwerte pro 100 g). Open-Food-Facts-Werte oben sind Messdaten
von Produktetiketten und gehen deiner Erinnerung vor. Ist die Schätzung
plausibel (kcal innerhalb ca. 15 %, Makros passend), antworte nur mit {{"ok": true}}.
Sonst antworte nur mit {{"ok": false, "macros": {{"kcal": 0, "protein": 0, "carbs": 0, "fat": 0}}, "reason": "kurz"}}
und korrigierten Werten für die gesamte Portion. Kein Fließtext, nur JSON."""


_GRAMS = re.compile(r"(\d+(?:[.,]\d+)?)\s*g\b")


def _off_reference(components: list[dict]) -> list[dict]:
    """Open Food Facts je Komponente mit Grammangabe: Top-Treffer pro 100 g, auf die Menge hochgerechnet."""
    from .sources import off

    out: list[dict] = []
    for comp in components or []:
        name = str(comp.get("name") or "").strip()
        grams = _GRAMS.findall(str(comp.get("qty") or ""))
        if not name or not grams:
            continue
        g = float(grams[-1].replace(",", "."))  # "4 Stück (gesamt 220g)" -> 220
        # Hintergrund-Prozess: großzügiges Timeout + ein Retry, OFF-Suche ist oft träge (503/Timeout)
        hit = off.search_ingredient(name, limit=5, timeout=20)
        if not hit:
            time.sleep(3)
            hit = off.search_ingredient(name, limit=5, timeout=20)
        if not hit:
            continue
        f = g / 100
        out.append({
            "name": name, "grams": g, "off_name": hit["name"], "brand": hit["brand"],
            "kcal": round(hit["energy_kcal"] * f), "protein": round(hit["protein"] * f, 1),
            "carbs": round(hit["carbs"] * f, 1), "fat": round(hit["fat"] * f, 1),
        })
    return out


def _reference_text(ref: list[dict]) -> str:
    if not ref:
        return ""
    lines = [
        f"- {r['name']} {r['grams']:g} g (OFF: {r['off_name']}): {r['kcal']} kcal, "
        f"{r['protein']} EW, {r['carbs']} KH, {r['fat']} F" for r in ref
    ]
    return "\nOpen Food Facts (auf die Menge gerechnet):\n" + "\n".join(lines) + "\n"


def _haiku_verdict(description: str, macros: dict, reference: str = "") -> dict | None:
    """Haiku prüft die Gemini-Makros. {ok, macros?, reason?} oder None (CLI nicht nutzbar / kein JSON)."""
    if not claude_cli.available():
        return None
    prompt = VERIFY_PROMPT.format(description=description, reference=reference, **macros)
    res = claude_cli.call_claude(prompt, timeout=45, log_label="verify_nutrition")
    if not res["ok"]:
        logger.warning(f"Haiku-Check übersprungen ({res['error']})")
        return None
    return claude_cli._extract_json(res["text"])


def _vibe_verdict(description: str, macros: dict, reference: str = "") -> dict | None:
    """Vibe (Mistral) prüft dieselben Makros als zweite Meinung. Gleiche Form wie _haiku_verdict."""
    if not vibe_cli.available():
        return None
    prompt = VERIFY_PROMPT.format(description=description, reference=reference, **macros)
    res = vibe_cli.call_vibe(prompt, timeout=60, log_label="verify_nutrition:vibe")
    if not res["ok"]:
        logger.warning(f"Vibe-Check übersprungen ({res['error']})")
        return None
    return claude_cli._extract_json(res["text"])


def verify_cli() -> None:
    """Hintergrund-Prozess: OFF-Referenz holen, Haiku prüft die Schätzung, Ergebnis per Desktop-Benachrichtigung.

    Aufruf: python -c "from fuel.gemini import verify_cli; verify_cli()" <beschreibung> <macros-json> [<components-json>]
    Schreibt nichts um — die Entscheidung bleibt beim Nutzer.
    """
    description, macros = sys.argv[1], json.loads(sys.argv[2])
    components = json.loads(sys.argv[3]) if len(sys.argv) > 3 else []
    ref = _off_reference(components)
    reftext = _reference_text(ref)
    active = [(n, v) for n, v in (
        ("Haiku", _haiku_verdict(description, macros, reftext)),
        ("Vibe", _vibe_verdict(description, macros, reftext)),
    ) if v]
    if not active and not ref:
        return

    off_line = ""
    if ref:
        tot = {k: sum(r[k] for r in ref) for k in ("kcal", "protein", "carbs", "fat")}
        off_line = f"\nOFF:    {tot['kcal']} kcal · {tot['protein']:.1f} EW · {tot['carbs']:.1f} KH · {tot['fat']:.1f} F ({len(ref)}/{len(components)} Zutaten)"
    gemini_line = f"Gemini: {macros['kcal']} kcal · {macros['protein']} EW · {macros['carbs']} KH · {macros['fat']} F"

    doubters = [(n, v) for n, v in active if v.get("ok") is False]
    if doubters:
        title, urgency = f"Fuel: {' + '.join(n for n, _ in doubters)} zweifelt", "normal"
        body = f"{description}\n{gemini_line}"
        for n, v in doubters:
            fixed = _normalize_macros(v.get("macros") or {})
            body += f"\n{n + ':':<8}{fixed['kcal']} kcal · {fixed['protein']} EW · {fixed['carbs']} KH · {fixed['fat']} F"
        body += off_line
        for n, v in doubters:
            body += f"\n{n}: {v.get('reason', '')}"
    elif active:
        title, urgency = "Fuel: Check ok", "low"
        body = f"{description}\n{gemini_line}{off_line}\ngeprüft: {', '.join(n for n, _ in active)}"
    else:  # keine CLI erreichbar, OFF-Referenz gibt es trotzdem
        title, urgency = "Fuel: OFF-Vergleich", "low"
        body = f"{description}\n{gemini_line}{off_line}"
    # Voller Text zusätzlich in Datei: Notifications verschwinden zu schnell. Bei Zweifel
    # poppt ein pyprland-Scratchpad (fuelcheck) mit dem vollen Ergebnis auf, bis eine Taste gedrückt wird.
    cache = Path.home() / ".cache" / "fuel"
    cache.mkdir(parents=True, exist_ok=True)
    (cache / "last-verify.txt").write_text(f"{title}\n\n{body}\n")
    timeout_ms = "60000" if doubters else "20000"
    subprocess.run(["notify-send", "-a", "fuel", "-u", urgency, "-t", timeout_ms, title, body], check=False)
    if doubters:
        try:
            subprocess.run(["pypr", "show", "fuelcheck"], check=False, timeout=10,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except (OSError, subprocess.TimeoutExpired):
            pass


def _spawn_verify(description: str, macros: dict, components: list[dict]) -> None:
    """Haiku-Check entkoppelt im Hintergrund starten; der Aufrufer wartet nicht darauf."""
    env = {**os.environ, "PYTHONPATH": os.pathsep.join(filter(None, [str(_paths.REPO_DIR), os.environ.get("PYTHONPATH", "")]))}
    try:
        subprocess.Popen(
            [sys.executable, "-c", "from fuel.gemini import verify_cli; verify_cli()", description, json.dumps(macros), json.dumps(components)],
            env=env, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            start_new_session=True,
        )
    except OSError as e:
        logger.warning(f"Haiku-Check nicht gestartet: {e}")


def estimate_nutrition(description: str, *, retries: int = 2, timeout: int = 30, verify: bool = False) -> dict:
    """One-shot estimation: macros + micros + components.

    Gemini (2–5 s). Mit ``verify=True`` startet danach ein Hintergrund-Prozess, in dem Haiku die
    Makros prüft und das Ergebnis per notify-send meldet (kein Warten, keine automatische Korrektur).
    """
    prompt = PROMPT_TEMPLATE.format(description=description) + "\n" + OMEGA3_RULES

    res = call_gemini(prompt, retries=retries, timeout=timeout, log_label="estimate_nutrition")
    if not res["ok"]:
        return _empty_response(res["error"])
    parsed = _extract_json(res["text"])
    if not parsed:
        logger.error(f"JSON parse failed: {res['text'][:200]!r}")
        return _empty_response("json parse failed")

    macros = _normalize_macros(parsed.get("macros") or {})
    if verify:
        _spawn_verify(description, macros, parsed.get("components") or [])

    logger.debug(f"estimate_nutrition success: {macros}")
    return {
        "macros": macros,
        "micros": _normalize_micros(parsed.get("micros") or {}),
        "components": parsed.get("components") or [],
    }


def estimate_vision(image_b64: str, mime_type: str = "image/jpeg", *, retries: int = 2, timeout: int = 30) -> dict:
    """Multimodal one-shot estimation: extracts macros/micros/components/grams from photo or receipt."""
    # 'grams' explizit anfordern: ohne diese Angabe war das Gewicht-Feld im
    # Frontend rein kosmetisch (nur Katalog-Metadaten), Korrekturen auf die
    # echte Packungsangabe veränderten die Makros nicht mit (2026-07-30
    # gemeldet, gleicher Fix auch im Vertex-Pfad in ScannerModal.jsx).
    prompt = (
        "Dies ist ein Foto von Essen, einem Barcode oder einer Einkaufsquittung. "
        "Identifiziere die Mahlzeit oder Zutaten und schätze die Nährwerte (Makros und Mikros) "
        "so genau wie möglich ab. Gib zusätzlich als 'grams' an, auf welches Gewicht (in Gramm) "
        "sich diese Makros beziehen — von einer erkannten Verpackungsangabe oder sonst deiner "
        "besten Schätzung der abgebildeten Portionsgröße. Nutze das übliche JSON Format."
    )
    res = call_gemini(prompt + "\n" + OMEGA3_RULES, image_b64=image_b64, mime_type=mime_type, retries=retries, timeout=timeout, log_label="estimate_vision")
    if not res["ok"]:
        return _empty_response(res["error"])

    parsed = _extract_json(res["text"])
    if not parsed:
        logger.error(f"JSON parse failed: {res['text'][:200]!r}")
        return _empty_response("json parse failed")

    logger.debug(f"estimate_vision success: {parsed.get('macros')}")
    return {
        "macros": _normalize_macros(parsed.get("macros") or {}),
        "micros": _normalize_micros(parsed.get("micros") or {}),
        "components": parsed.get("components") or [],
        "name": parsed.get("name", "Gescannte Mahlzeit"), # Fallback falls nicht in JSON
        "grams": parsed.get("grams"),
    }


def estimate_macros_only(description: str) -> dict:
    """Flat {kcal, protein, carbs, fat[, _error]} — for legacy gemini-estimate."""
    result = estimate_nutrition(description)
    out: dict[str, Any] = dict(result["macros"])
    if "_error" in result:
        out["_error"] = result["_error"]
    return out


def estimate_micros_only(description: str) -> dict:
    """Flat micros dict (empty on error) — for legacy gemini-micros."""
    result = estimate_nutrition(description)
    if "_error" in result:
        return {}
    return result["micros"]


# ── Components: Gemini decompose a meal description into ingredients + qty ─────

_DECOMPOSE_PROMPT = """Zerlege diese Mahlzeit in Zutaten mit Mengen in Gramm:
"{description}"

Antworte NUR mit JSON-Array (keine Erklärungen):
[{{"name": "<Zutat>", "quantity_g": <Menge>}}, ...]

Beispiel "Wiener Schnitzel mit Kartoffeln":
[{{"name": "Schnitzel", "quantity_g": 150}}, {{"name": "Kartoffeln", "quantity_g": 200}}, {{"name": "Öl zum Braten", "quantity_g": 20}}]
"""


def decompose_components(description: str) -> list[dict]:
    """Returns [{name, quantity_g}, ...] — leer bei Fehler."""
    res = call_gemini(_DECOMPOSE_PROMPT.format(description=description), log_label="decompose")
    if not res["ok"]:
        return []
    text = res["text"].strip()
    parsed = None
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        m = re.search(r"\[.*\]", text, re.DOTALL)
        if m:
            try:
                parsed = json.loads(m.group())
            except json.JSONDecodeError:
                pass
    if isinstance(parsed, list):
        return [c for c in parsed if isinstance(c, dict) and "name" in c]
    logger.warning(f"decompose: unparseable response: {text[:200]!r}")
    return []


# ── Discovery: classify input as supplement or meal + auto-fill catalog ────────

_DISCOVERY_PROMPT = """Analysiere die Eingabe: "{query}"
Handelt es sich um ein Supplement (Pille, Pulver, Kapsel, Vitamin, Mineralstoff) oder eine Mahlzeit/Lebensmittel?

Gib NUR ein JSON-Objekt zurück:
{{
  "type": "supplement" | "meal",
  "catalog_entry": {{
    // Wenn Supplement:
    "id": "eindeutige_id_kleingeschrieben",
    "name": "Anzeigename",
    "unit": "mg" | "g" | "µg" | "ml" | "IU",
    "default_dose": <Zahl>,
    "default_time_of_day": "morning" | "midday" | "evening" | "night" | "any",
    "notes": "Kurze Info"
  }} | {{
    // Wenn Mahlzeit:
    "name": "Name des Gerichts",
    "kcal": <Zahl>,
    "protein": <Zahl>,
    "carbs": <Zahl>,
    "fat": <Zahl>,
    "micros": {{
       {micro_keys_example}
    }}
  }}
}}

Mikro-Keys für Mahlzeiten: {micro_keys}
"""


def discover_item(query: str) -> dict:
    """Klassifiziert query als 'supplement' oder 'meal' + Catalog-Entry.

    Returns {type, catalog_entry} oder {error}.
    """
    micro_keys_csv = ", ".join(MICRO_KEYS)
    micro_keys_example = ", ".join(f'"{k}": 0' for k in MICRO_KEYS[:3]) + ", ..."
    prompt = _DISCOVERY_PROMPT.format(
        query=query,
        micro_keys=micro_keys_csv,
        micro_keys_example=micro_keys_example,
    )
    res = call_gemini(prompt, timeout=20, log_label="discover")
    if not res["ok"]:
        return {"error": res["error"]}
    parsed = _extract_json(res["text"])
    if not parsed:
        logger.error(f"discover: JSON parse failed: {res['text'][:200]!r}")
        return {"error": "json parse failed"}
    return parsed
