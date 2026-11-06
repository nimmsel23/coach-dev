"""index command — Build a frontend-optimized knowledge index (JSON)."""
from __future__ import annotations

import json
from pathlib import Path
from datetime import datetime

import typer
from rich.panel import Panel

from ._helpers import console, _gum_log
from anatomy_kb import db as _db

INDEX_FILE = Path(__file__).parent.parent.parent / "catalog-index.json"

def command():
    """
    [bold]RBH-Optimized Index Build — Generiert catalog-index.json[/bold]

    Erstellt eine zentrale JSON-Datei, die direkt auf die Bedürfnisse des
    Frontends (react-muscle-highlighter) zugeschnitten ist.
    
    Struktur:
    - slugs: { [rbh_slug]: { muscles: [], origin: "...", exercises: [] } }
    - exercises: { [id]: { rbh_slugs: [], ... } }
    """
    with console.status("[dim]Baue RBH-optimierten Index...[/dim]"):
        try:
            conn = _db.connect()
            _db.sync_all() 
            
            # 1. Map: internal_muscle_id -> metadata
            muscles_raw = {}
            rows = conn.execute("SELECT * FROM muscles").fetchall()
            for r in rows:
                muscles_raw[r["muscle_id"]] = dict(r)

            # 2. Build Slugs Registry (The Primary View for RBH)
            slugs = {}
            for mid, mdata in muscles_raw.items():
                slug = mdata["rbh_slug"]
                if not slug: continue
                
                if slug not in slugs:
                    slugs[slug] = {
                        "slug": slug,
                        "display_name": mdata["name_de"] or mdata["name_en"] or slug.capitalize(),
                        "name_de": mdata["name_de"],
                        "name_en": mdata["name_en"],
                        "latin_name": mdata["latin"],
                        "origin": mdata["origin"],
                        "insertion": mdata["insertion"],
                        "innervation": mdata["innervation"],
                        "function": mdata["function"],
                        "internal_muscles": [mid],
                        "exercises": []
                    }
                else:
                    # Merge logic for multi-muscle slugs (e.g. 'chest')
                    s = slugs[slug]
                    s["internal_muscles"].append(mid)
                    for field in ["origin", "insertion", "innervation", "function"]:
                        if mdata[field] and mdata[field] not in s[field]:
                            s[field] += f"\n\n---\n\n{mdata[field]}"
                    for field in ["name_de", "name_en", "latin_name"]:
                        val = mdata.get(field if field != "latin_name" else "latin")
                        if val and val not in (s.get(field) or ""):
                            s[field] = f"{s.get(field) or ''} / {val}".strip(" / ")

            # 3. Build Exercises Registry
            exercises = {}
            ex_rows = conn.execute("SELECT * FROM exercises").fetchall()
            for r in ex_rows:
                eid = r["exercise_id"]
                # Get muscles and their roles
                m_rows = conn.execute("SELECT muscle_id, role FROM exercise_muscles WHERE exercise_id = ?", (eid,)).fetchall()
                
                ex_slugs = set()
                role_map = {"primary": [], "secondary": [], "stabilizer": []}
                
                for m in m_rows:
                    mid = m["muscle_id"]
                    role = m["role"]
                    if mid in muscles_raw:
                        slug = muscles_raw[mid]["rbh_slug"]
                        if slug:
                            ex_slugs.add(slug)
                            # Link exercise back to slug
                            if eid not in slugs[slug]["exercises"]:
                                slugs[slug]["exercises"].append(eid)
                    
                    if role in role_map:
                        role_map[role].append(mid)

                exercises[eid] = {
                    "id": eid,
                    "name": r["name"],
                    "display_name": r["display_name"],
                    "category": r["category"],
                    "rbh_slugs": list(ex_slugs),
                    "muscles": role_map,
                    "unreviewed": bool(r["unreviewed"])
                }

            # Final Index Structure
            catalog_index = {
                "version": "1.1",
                "generated_at": datetime.now().isoformat(),
                "slugs": slugs,
                "exercises": exercises
            }

            INDEX_FILE.write_text(json.dumps(catalog_index, indent=2, ensure_ascii=False))
            
            _gum_log("info", f"RBH-Index erstellt: {INDEX_FILE.name}")
            console.print(Panel(
                f"RBH-Slugs: {len(slugs)}\nÜbungen: {len(exercises)}",
                title="[bold green]Success[/bold green]",
                border_style="green"
            ))

        except Exception as e:
            _gum_log("error", f"Index Build fehlgeschlagen: {e}")
            raise typer.Exit(1)
