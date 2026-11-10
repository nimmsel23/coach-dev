"""CLI-Bridge für Gemini-Vision-Schätzung — vom Node-Server per execFile
aufgerufen (src/server/routes/nutrition/vision.mjs), ersetzt den separaten
FastAPI-Prozess fuel-catalog-server.py (:9050). Der Rest von dessen Endpoints
(Katalog list/get) war ohnehin redundant zu den nativen Node-Routen.

Liest {"image_b64": "...", "mime_type": "image/jpeg"} als JSON von stdin,
schreibt das estimate_vision()-Ergebnis als JSON nach stdout.
"""

from __future__ import annotations

import json
import sys

from .gemini import estimate_vision


def main() -> None:
    payload = json.loads(sys.stdin.read())
    image_b64 = payload["image_b64"]
    mime_type = payload.get("mime_type", "image/jpeg")

    result = estimate_vision(image_b64, mime_type=mime_type)
    print(json.dumps(result))
    if result.get("_error"):
        sys.exit(1)


if __name__ == "__main__":
    main()
