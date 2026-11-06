import json
from pathlib import Path

index_path = Path("/home/alpha/anatomy-kb/muscle-index.json")
data = json.loads(index_path.read_text())

# Mapping from internal muscle_id to a LIST of base body-muscles slugs
slug_mapping = {
    "biceps_brachii": ["biceps"],
    "anterior_deltoid": ["shoulder-front"],
    "lateral_deltoid": ["shoulder-side"],
    "posterior_deltoid": ["deltoid-rear"],
    "serratus_anterior": ["serratus-anterior"],
    "pectoralis_major": ["chest-lower", "chest-upper"],
    "triceps_brachii": ["triceps-lateral", "triceps-long"],
    "rectus_abdominis": ["abs-lower", "abs-upper"],
    "gastrocnemius": ["calves-gastroc-lateral", "calves-gastroc-medial"],
    "soleus": ["calves-soleus"],
    "gluteus_maximus": ["gluteus-maximus"],
    "gluteus_medius": ["gluteus-medius"],
    "trapezius": ["traps-lower", "traps-mid", "traps-upper", "nape"],
    "quadriceps_femoris": ["quads"],
    "biceps_femoris": ["hamstrings-lateral", "hamstrings-medial"],
    "latissimus_dorsi": ["lats-lower", "lats-mid", "lats-upper"],
    "brachialis": ["biceps"], # brachialis can share the biceps highlight or forearm
    "obliquus_externus_abdominis": ["obliques"],
    "erector_spinae": ["lower-back-erectors", "spine"],
    "tibialis_anterior": ["tibialis-anterior"],
    "adductors": ["adductors"],
    "forearm_flexors": ["forearm-flexors", "forearm"],
    "forearm_extensors": ["forearm-extensors", "forearm"],
    "quadratus_lumborum": ["lower-back-ql"]
}

for k, v in data.items():
    if k in slug_mapping:
        v["rbh_slugs"] = slug_mapping[k]
        v.pop("rbh_slug", None) # remove old singular slug

index_path.write_text(json.dumps(data, indent=2, ensure_ascii=False))
print("Updated index with array of base slugs.")
