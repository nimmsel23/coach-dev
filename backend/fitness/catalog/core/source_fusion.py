"""Explicit contact-style source merges. Raw source records are never mutated."""
from copy import deepcopy

SOURCES = ('wger', 'yuhonas')
FIELDS = ('description', 'instructions', 'coaching_notes', 'equipment', 'primary_muscles', 'secondary_muscles', 'images')


def source_choices(ex):
    out = {}
    for source in SOURCES:
        if source in (ex.get('source_selection') or {}):
            value = ex['source_selection'][source]
        else:
            refs = (ex.get('external_ids') or {}).get(source) or (ex.get('origin') or {}).get('source_refs', {}).get(source) or []
            value = ex.get(f'{source}_id') or (refs[0] if refs else None)
        out[source] = str(value) if value is not None else None
    return out


def _unique(values):
    out = []
    for value in values:
        if value not in out:
            out.append(deepcopy(value))
    return out


def merge_sources(ex, selection, rejections, field_choices, lookup):
    from fitness.catalog.core.source_selection import apply_source_selection
    if not isinstance(selection, dict) or set(selection) != set(SOURCES):
        raise ValueError('both_source_choices_required')
    if not isinstance(rejections, dict) or set(rejections) - set(SOURCES):
        raise ValueError('invalid_rejections')
    if not isinstance(field_choices, dict) or set(field_choices) - set(FIELDS):
        raise ValueError('invalid_field_choices')
    entries, choices, rejected = {}, {}, {}
    for source in SOURCES:
        value = selection[source]
        if value is not None and (not isinstance(value, (str, int)) or isinstance(value, bool) or not str(value).strip()):
            raise ValueError('invalid_source_id')
        if source == 'wger' and value is not None:
            if not str(value).isdigit() or int(value) <= 0:
                raise ValueError('invalid_source_id')
            value = int(value)
        choices[source] = value
        if value is not None:
            entry = lookup(source, str(value))
            if not entry:
                raise ValueError(f'source_not_found:{source}:{value}')
            entries[source] = deepcopy(entry)
        denied = rejections.get(source, [])
        if not isinstance(denied, list) or len(denied) > 100 or any(not isinstance(v, (str, int)) or isinstance(v, bool) or not str(v).strip() for v in denied):
            raise ValueError('invalid_rejections')
        rejected[source] = _unique([str(v) for v in denied if str(v) != str(value)])
    normalized = {source: str(value) if value is not None else None for source, value in choices.items()}
    if source_choices(ex) == normalized and all(value == 'keep' for value in field_choices.values()):
        unchanged = deepcopy(ex)
        unchanged['source_rejections'] = rejected
        return unchanged
    merged = apply_source_selection(ex, choices)
    merged['source_rejections'] = rejected
    merged['source_snapshot'] = deepcopy(entries)
    for source, entry in entries.items():
        merged['origin'][source] = deepcopy(entry)
    if entries.get('wger', {}).get('wger_muscle_ids'):
        merged['wger_muscle_ids'] = deepcopy(entries['wger']['wger_muscle_ids'])
    for field in FIELDS:
        choice = field_choices.get(field, 'keep')
        if choice not in ('keep', 'combine', *SOURCES):
            raise ValueError('invalid_field_choice')
        if choice == 'keep' and ex.get(field):
            continue
        def content(entry):
            value = entry.get(field)
            if field == 'description':
                value = value or entry.get('original_description')
            if value is None:
                return []
            return value if isinstance(value, list) else [value]
        if choice in SOURCES:
            if choice not in entries:
                raise ValueError('field_source_not_selected')
            values = content(entries[choice])
        else:
            values = _unique([item for entry in entries.values() for item in content(entry)])
        merged[field] = '\n\n'.join(map(str, values)) if field == 'description' else values
    if source_choices(ex) != source_choices(merged) or any(v != 'keep' for v in field_choices.values()):
        merged['source_review_required'] = True
    return merged
