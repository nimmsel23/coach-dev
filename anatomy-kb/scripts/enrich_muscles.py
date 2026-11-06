#!/usr/bin/env python3
"""
Füllt alle muscles/*.yml ohne origin/insertion via Gemini auf.
Läuft ohne Bestätigung durch — einmalig für die Grundbefüllung.

Usage:
  python3 scripts/enrich_muscles.py
  python3 scripts/enrich_muscles.py --dry-run
  python3 scripts/enrich_muscles.py --muscle latissimus_dorsi
"""
import sys
import argparse
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import yaml
from anatomy_kb import gemini as _gemini, muscle_store as _store

MUSCLE_PROMPT = """\
Du bist Anatomie-Experte (Diplom Präventiver Vitaltrainer, FlexyFit Wien).

Muskel: {latin} (muscle_id: {muscle_id})

Gib die vollständigen anatomischen Grunddaten an.
Sprache: Deutsch. Fachterminologie auf Latein in Klammern.

Antworte NUR mit diesem YAML-Block:

```yaml
origin: "Ursprung (Origo) — präzise Knochenstruktur und Knochenmarken"
insertion: "Ansatz (Insertio) — präzise Knochenstruktur und Knochenmarken"
innervation: "Nerv (Segmente)"
function: "Allgemeine Funktion des Muskels (1-2 Sätze)"
```
"""


def enrich_muscle(muscle_id: str, api_key: str, model: str, dry_run: bool = False) -> bool:
    doc = _store.load_muscle(muscle_id)
    if not doc:
        print(f"  ✗ {muscle_id}: nicht gefunden")
        return False

    latin = doc.get("latin", muscle_id)
    prompt = MUSCLE_PROMPT.format(latin=latin, muscle_id=muscle_id)

    print(f"  → {muscle_id} ({latin})...", end=" ", flush=True)

    try:
        response = _gemini.call_with_fallback(prompt, api_key, model)
    except Exception as e:
        print(f"FEHLER: {e}")
        return False

    if response is None:
        print("kein Modell verfügbar")
        return False

    yaml_str = _gemini.extract_yaml_block(response)
    try:
        parsed = yaml.safe_load(yaml_str)
    except yaml.YAMLError as e:
        print(f"YAML-Fehler: {e}")
        return False

    if not isinstance(parsed, dict) or not parsed.get("origin"):
        print("kein verwertbares Ergebnis")
        return False

    if dry_run:
        print(f"[dry] origin: {parsed['origin'][:60]}...")
        return True

    doc["origin"] = parsed.get("origin")
    doc["insertion"] = parsed.get("insertion")
    doc["innervation"] = parsed.get("innervation")
    doc["function"] = parsed.get("function")
    _store.save_muscle(muscle_id, doc)
    print(f"✓ gespeichert")
    return True


def main():
    parser = argparse.ArgumentParser(description="Muscles ohne Anatomy via Gemini befüllen")
    parser.add_argument("--dry-run", "-n", action="store_true")
    parser.add_argument("--muscle", "-m", help="Nur diesen Muskel (muscle_id)")
    parser.add_argument("--force", "-f", action="store_true", help="Auch bereits befüllte überschreiben")
    args = parser.parse_args()

    api_key, model = _gemini.load_env()
    if not api_key:
        print("✗ GEMINI_API_KEY fehlt in ~/.env/gemini.env")
        sys.exit(1)

    if args.muscle:
        targets = [args.muscle]
    else:
        targets = [
            mid for mid in _store.list_muscles()
            if args.force or not (_store.load_muscle(mid) or {}).get("origin")
        ]

    if not targets:
        print("Alle Muskeln bereits befüllt.")
        return

    print(f"Befülle {len(targets)} Muskeln via Gemini [{model}]...\n")
    ok = fail = 0
    for mid in targets:
        if enrich_muscle(mid, api_key, model, dry_run=args.dry_run):
            ok += 1
        else:
            fail += 1

    print(f"\n{'[dry] ' if args.dry_run else ''}Fertig: {ok} ok, {fail} fehlgeschlagen")


if __name__ == "__main__":
    main()
