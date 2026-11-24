"""Read human-maintained FUEL.md/NUTRITION.md. Never write a client document."""
from pathlib import Path
import re

from coach_local_plans import plans_module


def read_preferences(root: Path, client: str):
    folder = plans_module.LocalPlans(root).client(client)
    for name in ('FUEL.md', 'NUTRITION.md'):
        path = folder / name
        if not path.is_file():
            continue
        if not path.resolve().is_relative_to(folder.resolve()):
            raise ValueError('Ernährungsdatei liegt außerhalb des Workspaces.')
        if path.stat().st_size > 65536:
            raise ValueError('Ernährungsdatei ist zu groß; relevante Regeln bitte kompakt halten.')
        # Project preference lines only, no profile headings, name, contact or raw files.
        lines = []
        for raw in path.read_text(encoding='utf-8').splitlines():
            line = re.sub(r'^\s*[-*>#]+\s*', '', raw).strip()
            if re.match(r'^(?:kein(?:e[nmrs]?)?\s+|\bohne\s+|^(?:Ausschlüsse|Nicht essen|Vermeiden|Vorlieben|Ernährungsstil|Kochzeit|Budget|Bevorzugt|Unverträglichkeiten|Allergien)\s*:)', line, re.I):
                lines.append(line[:500])
        return {'source': name, 'context': '\n'.join(lines[:30])}
    return {'source': None, 'context': ''}
