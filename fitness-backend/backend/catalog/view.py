"""Zusammengeführte Katalog-Sicht: lokale Experten-KB zuerst, yuhonas direkt ergänzend.

Grundsätze
* Lokale Daten werden nie durch yuhonas überschrieben oder vereinheitlicht. Beide Quellen bleiben in
  `local` bzw. `yuhonas` sichtbar; `fields` zeigt den wirksamen Wert samt Herkunft, `divergences`
  listet Felder, in denen beide Quellen etwas Verschiedenes sagen.
* Verknüpfung lokal↔yuhonas nur über belastbare Merkmale (yuhonas_id, gleiche ID, exakter Name),
  und jede Verknüpfung nennt ihren Grund (`link.via`).
* Das frühere Bulk-Import-Duplikat (`unreviewed_yuhonas.yml`) wird nicht mehr separat gelistet,
  solange der yuhonas-Klon verfügbar ist — die Daten kommen dann direkt von dort.
"""
from __future__ import annotations

import dataclasses
from typing import Any

from backend.catalog import index, yuhonas as yu
from backend.catalog.yuhonas import YuhonasEntry, YuhonasUnavailable

LEGACY_YUHONAS_FILE = "unreviewed_yuhonas.yml"
_TIER = {"expert": 0, "inbox": 1, "yuhonas": 2, "bulk": 3}


class ExerciseNotFound(LookupError):
    pass


# ── Hilfen ──────────────────────────────────────────────────────────────────────────────────────
def _norm(text: str | None) -> str:
    from fitness.catalog.core.resolver import normalize_text

    return normalize_text(text or "", smart=True)


def _canon(words, *names: str) -> list[str]:
    from fitness.catalog.core.muscle_normalization import normalize_exercise_muscle_list

    return normalize_exercise_muscle_list(list(words or []), *names)


def _is_legacy(rec) -> bool:
    return rec.source_file == LEGACY_YUHONAS_FILE


def _yuhonas_or_none() -> tuple[Any, str | None]:
    try:
        return yu.load(), None
    except YuhonasUnavailable as exc:
        return None, str(exc)


def _local_names(rec) -> set[str]:
    names = [rec.display_name, rec.german, rec.english, *(rec.aliases or []), *(rec.search_aliases or [])]
    return {n for n in (_norm(x) for x in names if x) if n}


# ── Verknüpfung lokal ↔ yuhonas ─────────────────────────────────────────────────────────────────
_links_cache: dict[str, Any] = {}


def _links(local: list, db) -> dict[str, tuple[YuhonasEntry, str]]:
    """lokale exercise_id -> (yuhonas-Eintrag, Grund). Gecacht je KB-Stand und Klon-Stand."""
    fp = index.kb_fingerprint()
    if _links_cache.get("fp") == fp and _links_cache.get("db") is db:
        return _links_cache["links"]

    name_idx: dict[str, list[YuhonasEntry]] = {}
    for e in db.entries:
        name_idx.setdefault(_norm(e.name), []).append(e)
    lower_raw = {e.raw_id.lower(): e for e in db.entries}

    links: dict[str, tuple[YuhonasEntry, str]] = {}
    for rec in local:
        if _is_legacy(rec):
            continue
        entry, via = None, None
        ref = rec.yuhonas_id
        if ref:
            entry = (db.by_raw_id.get(ref) or db.by_exercise_id.get(ref)
                     or db.by_exercise_id.get(yu.exercise_id_for(ref)) or lower_raw.get(ref.lower()))
            via = "yuhonas_id"
        if entry is None and rec.exercise_id in db.by_exercise_id:
            entry, via = db.by_exercise_id[rec.exercise_id], "exercise_id"
        if entry is None:
            hits = {e.exercise_id: e for n in _local_names(rec) for e in name_idx.get(n, [])}
            if len(hits) == 1:                       # nur eindeutige Namenstreffer
                entry, via = next(iter(hits.values())), "name"
        if entry is not None:
            links[rec.exercise_id] = (entry, via)

    _links_cache.clear()
    _links_cache.update(fp=fp, db=db, links=links)
    return links


# ── Darstellung ─────────────────────────────────────────────────────────────────────────────────
def _row_local(rec, link) -> dict[str, Any]:
    entry = link[0] if link else None
    return {
        "exercise_id": rec.exercise_id,
        "display_name": rec.display_name or rec.exercise_id,
        "german": rec.german or None,
        "category": rec.category or (entry.category if entry else None) or None,
        "primary_muscles": rec.primary_muscles or (_canon(entry.primary_muscles, rec.display_name) if entry else []),
        "secondary_muscles": rec.secondary_muscles or (_canon(entry.secondary_muscles, rec.display_name) if entry else []),
        "equipment": rec.equipment or ([entry.equipment] if entry and entry.equipment else []),
        "source": rec.source,
        "has_yuhonas": entry is not None,
        "thumb": (entry.image_urls()[0] if entry and entry.images else None),
    }


def _row_yuhonas(e: YuhonasEntry) -> dict[str, Any]:
    return {
        "exercise_id": e.exercise_id,
        "display_name": e.name,
        "german": None,
        "category": e.category,
        "primary_muscles": _canon(e.primary_muscles, e.name),
        "secondary_muscles": _canon(e.secondary_muscles, e.name),
        "equipment": [e.equipment] if e.equipment else [],
        "source": "yuhonas",
        "has_yuhonas": True,
        "thumb": e.image_urls()[0] if e.images else None,
    }


def _visible(local: list, db) -> tuple[list, list[YuhonasEntry], dict]:
    """(sichtbare lokale Records, nicht verknüpfte yuhonas-Einträge, Verknüpfungen)."""
    if db is None:
        return list(local), [], {}
    links = _links(local, db)
    visible = [r for r in local if not _is_legacy(r)]
    seen_ids = {r.exercise_id for r in visible}
    linked = {e.exercise_id for e, _via in links.values()}
    direct = [e for e in db.entries if e.exercise_id not in seen_ids and e.exercise_id not in linked]
    return visible, direct, links


def search(q: str, limit: int = 12) -> dict[str, Any]:
    q_raw = (q or "").strip().lower()
    limit = max(1, min(limit, 50))
    db, error = _yuhonas_or_none()
    out: dict[str, Any] = {"results": [], "total": 0, "yuhonas": {"available": db is not None}}
    if error:
        out["yuhonas"]["error"] = error
    if not q_raw:
        return out

    q_flat = q_raw.replace("_", " ").replace("-", " ")

    def matches(fields) -> int | None:
        """0 = exakt, 1 = Präfix des Namens, 2 = enthält; None = kein Treffer."""
        best = None
        for i, f in enumerate(fields):
            if not f:
                continue
            low = str(f).lower()
            flat = low.replace("_", " ").replace("-", " ")
            if low == q_raw or flat == q_flat:
                return 0
            if i == 0 and (low.startswith(q_raw) or flat.startswith(q_flat)):
                best = 1 if best is None else min(best, 1)
            elif q_raw in low or q_flat in flat:
                best = 2 if best is None else min(best, 2)
        return best

    local = index.get_local_records()
    visible, direct, links = _visible(local, db)

    hits: list[tuple[tuple, dict]] = []
    for rec in visible:
        link = links.get(rec.exercise_id)
        # Verknüpfte Übungen sind auch über den yuhonas-Namen auffindbar ("chin" → Klimmzug).
        y_names = [link[0].name, link[0].raw_id, link[0].exercise_id] if link else []
        quality = matches([rec.display_name, rec.exercise_id, rec.german, rec.english,
                           *(rec.aliases or []), *(rec.search_aliases or []), *(rec.tags or []), *y_names])
        if quality is not None:
            hits.append(((quality, _TIER.get(rec.source, 3), (rec.display_name or "").lower()),
                         _row_local(rec, link)))
    for e in direct:
        quality = matches([e.name, e.exercise_id, e.raw_id, e.category, e.equipment])
        if quality is not None:
            hits.append(((quality, _TIER["yuhonas"], e.name.lower()), _row_yuhonas(e)))

    hits.sort(key=lambda h: h[0])
    out["total"] = len(hits)
    out["results"] = [row for _k, row in hits[:limit]]
    return out


def _nonempty(v) -> bool:
    return bool(v)


def _field(local_value, yuhonas_value) -> dict[str, Any]:
    if _nonempty(local_value):
        return {"value": local_value, "source": "local"}
    if _nonempty(yuhonas_value):
        return {"value": yuhonas_value, "source": "yuhonas"}
    return {"value": local_value if local_value is not None else yuhonas_value, "source": None}


def _same(a, b) -> bool:
    def norm(v):
        return {str(x).strip().lower() for x in v} if isinstance(v, (list, tuple, set)) else str(v or "").strip().lower()
    return norm(a) == norm(b)


def _kind(local_value, yuhonas_value) -> str:
    l, y = {str(x).strip().lower() for x in local_value}, {str(x).strip().lower() for x in yuhonas_value}
    if y < l:
        return "lokal_erweitert"       # lokale KB nennt mehr als yuhonas
    if l < y:
        return "yuhonas_erweitert"     # yuhonas nennt mehr als die lokale KB
    return "abweichend"                # echte Abweichung in beide Richtungen


def _compose(rec, link, entry: YuhonasEntry | None) -> dict[str, Any]:
    local_block = {k: v for k, v in dataclasses.asdict(rec).items() if v not in (None, [], {}, "")} if rec else None
    name = (rec.display_name if rec else None) or (entry.name if entry else "")
    y_primary = _canon(entry.primary_muscles, name) if entry else []
    y_secondary = _canon(entry.secondary_muscles, name) if entry else []
    y_images = [{"path": p, "url": u} for p, u in zip(entry.images, entry.image_urls())] if entry else []

    l_images = ([{"path": None, "url": u} for u in (rec.image_url, rec.gif_url) if u] if rec else [])
    fields = {
        "category": _field(rec.category if rec else None, entry.category if entry else None),
        "equipment": _field(rec.equipment if rec else None, [entry.equipment] if entry and entry.equipment else []),
        "primary_muscles": _field(rec.primary_muscles if rec else None, y_primary),
        "secondary_muscles": _field(rec.secondary_muscles if rec else None, y_secondary),
        "instructions": _field(rec.instructions if rec else None, list(entry.instructions) if entry else []),
        "images": _field(l_images, y_images),
    }
    divergences = []
    if rec and entry:
        # `category` wird bewusst nicht verglichen: lokal ist es eine Körperregion ("arms"), bei yuhonas
        # eine Trainingsart ("strength") — verschiedene Vokabulare, kein Widerspruch.
        for fname, lv, yv in (("equipment", rec.equipment, [entry.equipment] if entry.equipment else []),
                              ("primary_muscles", rec.primary_muscles, y_primary),
                              ("secondary_muscles", rec.secondary_muscles, y_secondary)):
            if _nonempty(lv) and _nonempty(yv) and not _same(lv, yv):
                divergences.append({"field": fname, "kind": _kind(lv, yv), "local": lv, "yuhonas": yv})

    yuhonas_block = None
    if entry:
        yuhonas_block = {**entry.as_dict(), "primary_muscles_canonical": y_primary,
                         "secondary_muscles_canonical": y_secondary}
    return {
        "exercise_id": rec.exercise_id if rec else entry.exercise_id,
        "display_name": name,
        "source": rec.source if rec else "yuhonas",
        "local": local_block,
        "yuhonas": yuhonas_block,
        "link": ({"via": link[1], "yuhonas_id": link[0].raw_id} if link else None),
        "fields": fields,
        "divergences": divergences,
    }


def get(exercise_id: str) -> dict[str, Any]:
    from fitness.catalog.core.resolver import find_by_id

    exercise_id = (exercise_id or "").strip()
    db, error = _yuhonas_or_none()
    local = index.get_local_records()

    rec = next((r for r in local if r.exercise_id == exercise_id), None) or find_by_id(exercise_id, local)
    if rec is not None and not (_is_legacy(rec) and db is not None):
        link = _links(local, db).get(rec.exercise_id) if db is not None else None
        view = _compose(rec, link, link[0] if link else None)
        if error:
            view["warnings"] = [error]
        return view

    if db is not None:
        entry = db.by_exercise_id.get(exercise_id) or db.by_raw_id.get(exercise_id)
        if entry is None:
            key = exercise_id.lower().replace(" ", "_")
            entry = db.by_exercise_id.get(key) or db.by_exercise_id.get(yu.exercise_id_for(key))
        if entry is not None:
            view = _compose(None, None, entry)
            links = _links(local, db)                                   # einmal holen (Fingerabdruck-Prüfung ist nicht gratis)
            back_id = next((rid for rid, (e, _via) in links.items() if e is entry), None)
            if back_id is not None:
                back = next(r for r in local if r.exercise_id == back_id)
                view["linked_local"] = {"exercise_id": back.exercise_id,
                                        "display_name": back.display_name, "via": links[back_id][1]}
            return view
    hint = f" ({error})" if error and exercise_id.startswith("yuhonas_") else ""
    raise ExerciseNotFound(f"Übung nicht gefunden: {exercise_id}{hint}")
