"""Coach-confirmed source choices override inference, including an explicit no-link."""
from copy import deepcopy


def apply_source_selection(exercise, selection=None):
    ex = deepcopy(exercise or {})
    choices = deepcopy(selection if selection is not None else ex.get('source_selection') or {})
    if not choices:
        return ex
    ex['source_selection'] = choices
    external = deepcopy(ex.get('external_ids') or {})
    origin = deepcopy(ex.get('origin') or {})
    refs = deepcopy(origin.get('source_refs') or {})
    for source, selected in choices.items():
        if source not in {'wger', 'yuhonas'}:
            continue
        old = external.pop(source, [])
        scalar = ex.pop(f'{source}_id', None)
        if scalar is not None:
            old = [*old, scalar]
        if source == 'wger':
            ex.pop('wger_muscle_ids', None)
        origin.pop(source, None)
        refs.pop(source, None)
        snapshot = ex.get('source_snapshot')
        if isinstance(snapshot, dict):
            snapshot.pop(source, None)
        removed = {str(v).casefold() for v in old} | {f'{source}_{v}'.casefold() for v in old}
        for key in ('aliases', 'search_aliases'):
            if isinstance(ex.get(key), list):
                ex[key] = [v for v in ex[key] if str(v).casefold() not in removed]
        if selected is not None:
            value = int(selected) if source == 'wger' else str(selected)
            ex[f'{source}_id'] = value
            external[source] = [value]
            refs[source] = [str(value)]
    ex['external_ids'] = external
    origin['source_refs'] = refs
    origin['type'] = 'merged_external' if len(refs) > 1 else 'external' if refs else 'manual'
    ex['origin'] = origin
    return ex
