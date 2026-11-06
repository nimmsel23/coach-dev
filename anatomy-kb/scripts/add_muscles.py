import json
from pathlib import Path

index_path = Path("/home/alpha/anatomy-kb/muscle-index.json")
data = json.loads(index_path.read_text())

new_muscles = {
    "lateral_deltoid": {"latin": "Pars acromialis deltoidei", "en": "Lateral deltoid", "de": "Mittlerer Deltamuskel", "slugs": ["shoulder-side"], "front": True},
    "posterior_deltoid": {"latin": "Pars spinalis deltoidei", "en": "Rear deltoid", "de": "Hinterer Deltamuskel", "slugs": ["deltoid-rear"], "front": False},
    "gluteus_medius": {"latin": "Gluteus medius", "en": "Gluteus medius", "de": "Mittlerer Gesäßmuskel", "slugs": ["gluteus-medius"], "front": False},
    "tibialis_anterior": {"latin": "Tibialis anterior", "en": "Tibialis anterior", "de": "Vorderer Schienbeinmuskel", "slugs": ["tibialis-anterior"], "front": True},
    "adductors": {"latin": "Adductores", "en": "Adductors", "de": "Adduktoren", "slugs": ["adductors"], "front": True},
    "forearm_flexors": {"latin": "Musculi flexores antebrachii", "en": "Forearm flexors", "de": "Unterarmbeuger", "slugs": ["forearm-flexors", "forearm"], "front": True},
    "forearm_extensors": {"latin": "Musculi extensores antebrachii", "en": "Forearm extensors", "de": "Unterarmstrecker", "slugs": ["forearm-extensors"], "front": False},
    "quadratus_lumborum": {"latin": "Quadratus lumborum", "en": "Quadratus lumborum", "de": "Quadratischer Lendenmuskel", "slugs": ["lower-back-ql"], "front": False}
}

for k, v in new_muscles.items():
    if k not in data:
        data[k] = {
            "muscle_id": k,
            "wger_id": None,
            "latin": v["latin"],
            "name_en": v["en"],
            "name_de": v["de"],
            "is_front": v["front"],
            "rbh_slug": v["slugs"][0],
            "file": f"muscles/{k}.yml"
        }

index_path.write_text(json.dumps(data, indent=2, ensure_ascii=False))
print("Added missing muscles to index.")
