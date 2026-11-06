import os
import glob
import re

mapping = {
    "gemini": "catalog.agent.gemini",
    "enricher": "catalog.agent.enricher",
    "enricher_yuhonas": "catalog.agent.enricher_yuhonas",
    "ingestor": "catalog.agent.ingestor",
    "obsidian": "catalog.agent.obsidian",
    "teaching": "catalog.agent.teaching",
    
    "api": "catalog.api.api",
    "push": "catalog.api.push",
    "firestore_push": "catalog.api.firestore_push",
    "sync_gateway": "catalog.api.sync_gateway",
    "watcher": "catalog.api.watcher",
    
    "audit": "catalog.core.audit",
    "auditor": "catalog.core.auditor",
    "wger": "catalog.core.wger",
    "wger_index": "catalog.core.wger_index",
    "resolver": "catalog.core.resolver",
    "loader": "catalog.core.loader",
    "yaml_utils": "catalog.core.yaml_utils",
    "paths": "catalog.core.paths",
    "doctor": "catalog.core.doctor",
    "rich_utils": "catalog.core.rich_utils",

    "app_tui": "catalog.app_tui",
    "bootstrap": "catalog.bootstrap",
    "cli": "catalog.cli",
    "coach_sheet": "catalog.coach_sheet",
    "coverage": "catalog.coverage",
    "history": "catalog.history",
    "importer": "catalog.importer",
    "planner": "catalog.planner",
    "preview": "catalog.preview",
    "tui": "catalog.tui",
    "weekly": "catalog.weekly",
}

def rewrite_file(filepath):
    with open(filepath, "r") as f:
        content = f.read()

    # Rewrite `from .something import` or `from ..something import`
    # We will match `from \.+([A-Za-z0-9_]+) import`
    def replacer(match):
        module = match.group(1)
        if module in mapping:
            return f"from {mapping[module]} import"
        return match.group(0) # fallback

    new_content = re.sub(r"from\s+\.+([A-Za-z0-9_]+)\s+import", replacer, content)

    # Some imports might be `import .something` but usually it's `from . import`
    if new_content != content:
        with open(filepath, "w") as f:
            f.write(new_content)

for ext in ["catalog/**/*.py"]:
    for filepath in glob.glob(ext, recursive=True):
        if os.path.isfile(filepath):
            rewrite_file(filepath)

print("Imports rewritten.")
