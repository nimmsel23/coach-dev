import json
import yaml
from pathlib import Path

# Correct TA mappings
ta_corrections = {
    "anterior_deltoid": "Musculus deltoideus, Pars clavicularis",
    "lateral_deltoid": "Musculus deltoideus, Pars acromialis",
    "posterior_deltoid": "Musculus deltoideus, Pars spinalis",
    "biceps_brachii": "Musculus biceps brachii",
    "brachialis": "Musculus brachialis",
    "triceps_brachii": "Musculus triceps brachii",
    "forearm_flexors": "Musculi flexores antebrachii",
    "forearm_extensors": "Musculi extensores antebrachii",
    "pectoralis_major": "Musculus pectoralis major",
    "serratus_anterior": "Musculus serratus anterior",
    "rectus_abdominis": "Musculus rectus abdominis",
    "obliquus_externus_abdominis": "Musculus obliquus externus abdominis",
    "quadratus_lumborum": "Musculus quadratus lumborum",
    "erector_spinae": "Musculus erector spinae",
    "latissimus_dorsi": "Musculus latissimus dorsi",
    "trapezius": "Musculus trapezius",
    "gluteus_maximus": "Musculus gluteus maximus",
    "gluteus_medius": "Musculus gluteus medius",
    "quadriceps_femoris": "Musculus quadriceps femoris",
    "biceps_femoris": "Musculus biceps femoris",
    "adductors": "Musculi adductores",
    "gastrocnemius": "Musculus gastrocnemius",
    "soleus": "Musculus soleus",
    "tibialis_anterior": "Musculus tibialis anterior"
}

index_path = Path("/home/alpha/anatomy-kb/muscle-index.json")
data = json.loads(index_path.read_text())

muscles_dir = Path("/home/alpha/anatomy-kb/muscles")

updated = 0
for mid, ta_name in ta_corrections.items():
    # Update index
    if mid in data:
        data[mid]["latin"] = ta_name
    
    # Update YAML
    yml_path = muscles_dir / f"{mid}.yml"
    if yml_path.exists():
        doc = yaml.safe_load(yml_path.read_text(encoding="utf-8"))
        if doc and doc.get("latin") != ta_name:
            doc["latin"] = ta_name
            yml_path.write_text(yaml.dump(doc, allow_unicode=True, default_flow_style=False, sort_keys=False))
            updated += 1

index_path.write_text(json.dumps(data, indent=2, ensure_ascii=False))
print(f"Updated {updated} muscle files with correct TA names.")
