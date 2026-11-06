import json
from pathlib import Path

index_path = Path("/home/alpha/anatomy-kb/muscle-index.json")
data = json.loads(index_path.read_text())

muscles_dir = Path("/home/alpha/anatomy-kb/muscles")

for mid, meta in data.items():
    yml_path = muscles_dir / f"{mid}.yml"
    if not yml_path.exists():
        content = f"""muscle_id: {mid}
wger_id: {meta.get('wger_id', 'null')}
latin: {meta.get('latin', '')}
name_en: '{meta.get('name_en', '')}'
is_front: {str(meta.get('is_front', True)).lower()}
exercises: {{}}
"""
        yml_path.write_text(content)
        print(f"Created {yml_path.name}")
