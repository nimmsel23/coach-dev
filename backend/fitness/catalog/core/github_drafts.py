"""GitHub inbox data access through the existing authenticated gh installation."""
import base64
import json
import re
import subprocess
from urllib.parse import quote

REPO = 'nimmsel23/fitness'


def api(path, payload=None):
    cmd = ['gh', 'api', f'repos/{REPO}/{path}']
    if payload is not None:
        cmd += ['--method', 'PUT', '--input', '-']
    try:
        result = subprocess.run(cmd, input=json.dumps(payload) if payload is not None else None,
                                capture_output=True, text=True, timeout=45)
    except (subprocess.TimeoutExpired, OSError) as exc:
        raise RuntimeError('github_catalog_unavailable') from exc
    if result.returncode:
        if '409' in result.stderr or '422' in result.stderr:
            raise ValueError('source_merge_conflict')
        raise RuntimeError('github_catalog_unavailable')
    return json.loads(result.stdout)


def read_draft(item_id):
    if not re.fullmatch(r'gh-[1-9][0-9]*', item_id):
        raise ValueError('invalid_github_item')
    issue = api(f'issues/{item_id[3:]}')
    if issue.get('pull_request') or issue.get('state') != 'open' or not any(label.get('name') == 'inbox' for label in issue.get('labels', [])):
        raise ValueError('not_an_open_inbox_issue')
    match = re.search(r'<!-- inbox-file:(inbox/[A-Za-z0-9_-]+\.ya?ml) -->', issue.get('body') or '')
    if not match:
        raise ValueError('github_draft_path_missing')
    path = match[1]
    file = api(f'contents/{quote(path, safe="/")}')
    return path, base64.b64decode(file['content']).decode(), file['sha']


def write_draft(path, content, sha):
    return api(f'contents/{quote(path, safe="/")}', {
        'message': f'Coach: merge exercise sources in {path}',
        'content': base64.b64encode(content.encode()).decode(), 'sha': sha,
    })
