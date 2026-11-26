"""Read-only Google calendar projection through the existing gog account."""
import hashlib
import json
import os
import shutil
import subprocess
import threading
import time
from pathlib import Path

_lock = threading.Lock()
_cache = None
_cached_at = 0


def read_calendar(refresh=False):
    global _cache, _cached_at
    with _lock:
        if not refresh and _cache is not None and time.monotonic() - _cached_at < 60:
            return _cache
        binary = shutil.which('gog')
        if not binary:
            return {'status': 'unavailable', 'events': [], 'message': 'Google-Kalenderzugriff ist auf diesem Rechner nicht verfügbar.'}
        command = [binary, 'calendar', 'events', os.environ.get('COACH_CALENDAR_ID', 'primary'), '--account', os.environ.get('COACH_GOG_ACCOUNT', 'nimmdaniel@gmail.com'), '--from', 'now', '--days', '7', '--max', '100', '--all-pages', '--json', '--readonly', '--no-input']
        env_file = Path.home() / '.env/gog.env'
        if env_file.is_file():
            # Load credentials without reading, interpolating or logging their values.
            command = ['/usr/bin/zsh', '-c', 'set -a\nsource "$1"\nset +a\nexport GOG_KEYRING_BACKEND="${COACH_GOG_KEYRING_BACKEND:-file}"\nshift\nexec "$@"', 'coo-calendar', str(env_file), *command]
        try:
            result = subprocess.run(command, capture_output=True, text=True, timeout=20, env={**os.environ, 'GOG_KEYRING_BACKEND': os.environ.get('COACH_GOG_KEYRING_BACKEND', 'file')})
            raw = json.loads(result.stdout)
            if result.returncode or isinstance(raw, dict) and raw.get('error'):
                code = (raw.get('error') or {}).get('class') if isinstance(raw, dict) else None
                status = 'auth-required' if code == 'auth_required' or result.returncode == 4 else 'error'
                data = {'status': status, 'events': [], 'message': 'Google-Anmeldung erforderlich. Am Rechner: gog auth add nimmdaniel@gmail.com' if status == 'auth-required' else 'Google-Kalender konnte nicht gelesen werden. Bitte erneut versuchen.'}
            else:
                rows = raw if isinstance(raw, list) else raw.get('events', raw.get('items', []))
                events = []
                for row in rows:
                    if not isinstance(row, dict) or row.get('status') == 'cancelled' or not row.get('id'):
                        continue
                    start, end = row.get('start') or {}, row.get('end') or {}
                    item = {'id': row['id'], 'title': str(row.get('summary') or 'Ohne Titel'), 'start': start.get('dateTime') or start.get('date'), 'end': end.get('dateTime') or end.get('date')}
                    item['revision'] = hashlib.sha256(json.dumps(item, sort_keys=True).encode()).hexdigest()
                    events.append(item)
                data = {'status': 'connected', 'events': sorted(events, key=lambda item: item['start'] or ''), 'message': 'Google-Kalender · nächste 7 Tage. Wähle einen Termin ausdrücklich zum Klienten aus.'}
        except (OSError, ValueError, TypeError, subprocess.TimeoutExpired):
            data = {'status': 'error', 'events': [], 'message': 'Kalenderzugriff fehlgeschlagen. Der Terminstatus ist unbekannt.'}
        _cache, _cached_at = data, time.monotonic()
        return data
