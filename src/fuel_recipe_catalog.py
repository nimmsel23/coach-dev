"""Global Fuel recipe backup. No client profiles, intake logs or nutrition goals."""
from __future__ import annotations
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import sys
from datetime import datetime, timezone


def catalog_path():
    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
    from fuel.catalog_lookup import FUEL_DATA_DIR
    return Path(os.environ.get('FUEL_RECIPE_CATALOG', FUEL_DATA_DIR / 'catalog' / 'recipes.sqlite3')).expanduser()


def _connection(path):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(path, timeout=15)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA journal_mode=WAL')
    db.execute('''CREATE TABLE IF NOT EXISTS recipes (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, recipe_json TEXT NOT NULL,
        model TEXT NOT NULL, nutrient_basis TEXT NOT NULL,
        first_seen TEXT NOT NULL, last_seen TEXT NOT NULL, seen_count INTEGER NOT NULL DEFAULT 1)''')
    return db


def save_recipe(value, path=None):
    recipe = value.get('recipe')
    if not isinstance(recipe, dict) or not isinstance(recipe.get('name'), str) or not recipe['name'].strip():
        raise ValueError('Gerichtsname fehlt.')
    allowed = ('name', 'ingredients', 'steps', 'components', 'estimates', 'minutes', 'servings')
    recipe = {key: recipe[key] for key in allowed if key in recipe}
    for key in ('ingredients', 'steps'):
        if not isinstance(recipe.get(key), list) or not recipe[key] or len(recipe[key]) > 30 or any(not isinstance(item, str) or len(item) > 2000 for item in recipe[key]):
            raise ValueError(f'Ungültige Rezeptliste: {key}.')
    if recipe.get('servings') != 1 or not isinstance(recipe.get('minutes'), (int, float)) or not 1 <= recipe['minutes'] <= 240:
        raise ValueError('Portion oder Zubereitungszeit ungültig.')
    recipe['name'] = recipe['name'].strip()[:200]
    if 'components' in recipe:
        if not isinstance(recipe['components'], list) or len(recipe['components']) > 30:
            raise ValueError('Ungültige Rezeptkomponenten.')
        cleaned = []
        for component in recipe['components']:
            if not isinstance(component, dict): raise ValueError('Ungültige Zutat.')
            item = {key: component[key] for key in ('name', 'grams', 'state') if key in component}
            if isinstance(component.get('per100'), dict):
                item['per100'] = {key: component['per100'][key] for key in ('kcal', 'protein', 'fat', 'carbs') if key in component['per100']}
            cleaned.append(item)
        recipe['components'] = cleaned
    if 'estimates' in recipe:
        if not isinstance(recipe['estimates'], dict): raise ValueError('Ungültige Nährwertschätzung.')
        recipe['estimates'] = {key: recipe['estimates'][key] for key in ('kcal', 'protein', 'fat', 'carbs') if key in recipe['estimates']}
    encoded = json.dumps(recipe, sort_keys=True, ensure_ascii=False, allow_nan=False)
    if len(encoded.encode()) > 65536:
        raise ValueError('Rezept ist zu groß.')
    identifier = hashlib.sha256(encoded.encode()).hexdigest()
    now = datetime.now(timezone.utc).isoformat()
    model = str(value.get('model') or 'unknown')[:100]
    db = _connection(path or catalog_path())
    try:
        with db:
            db.execute('BEGIN IMMEDIATE')
            existing = db.execute('SELECT id FROM recipes WHERE id=?', (identifier,)).fetchone()
            db.execute('''INSERT INTO recipes(id,name,recipe_json,model,nutrient_basis,first_seen,last_seen)
                VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET last_seen=excluded.last_seen,seen_count=recipes.seen_count+1''',
                (identifier, recipe['name'][:200], encoded, model, 'model-estimate', now, now))
        return {'id': identifier, 'created': not bool(existing), 'name': recipe['name'], 'nutrientBasis': 'model-estimate'}
    finally:
        db.close()


def list_recipes(query='', path=None, limit=50):
    db = _connection(path or catalog_path())
    try:
        rows = db.execute('SELECT * FROM recipes WHERE name LIKE ? ORDER BY last_seen DESC LIMIT ?',
                          ('%' + str(query)[:200] + '%', max(1, min(int(limit), 100)))).fetchall()
        return [{'id': row['id'], 'recipe': json.loads(row['recipe_json']), 'model': row['model'],
                 'nutrientBasis': row['nutrient_basis'], 'firstSeen': row['first_seen'],
                 'lastSeen': row['last_seen'], 'seenCount': row['seen_count']} for row in rows]
    finally:
        db.close()
