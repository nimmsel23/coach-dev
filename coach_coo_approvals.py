"""Commit one explicitly reviewed COO document; never push or stage other work."""
import fcntl
import os
import re
import subprocess
from pathlib import Path

from fastapi import HTTPException


def commit_approval(item, text, root=None):
    root = Path(root or os.environ.get('COACH_CLIENT_ARCHIVE_ROOT', Path.home() / 'vitaltraining')).resolve()
    client = item['context']['clientId']
    if not re.fullmatch(r'[\w-]{1,128}', client) or not re.fullmatch(r'[a-f0-9-]{36}', item['id']):
        raise HTTPException(422, 'Ungültige Klienten- oder Auftragskennung.')

    def git(*args):
        result = subprocess.run(['git', '-C', str(root), *args], capture_output=True, text=True, timeout=30)
        if result.returncode:
            raise RuntimeError('Git-Vorgang fehlgeschlagen. Repository und Git-Identität prüfen.')
        return result.stdout.strip()

    try:
        if not root.is_dir() or Path(git('rev-parse', '--show-toplevel')).resolve() != root:
            raise RuntimeError('Vitaltraining-Repository fehlt.')
        if not re.search(r'[:/]nimmsel23/business-vitaltraining(?:\.git)?$', git('remote', 'get-url', 'origin')):
            raise RuntimeError('Das Ziel ist nicht das bestehende Vitaltraining-Repository.')
        git('symbolic-ref', '--quiet', 'HEAD')
        gitdir = Path(git('rev-parse', '--absolute-git-dir'))
        with (gitdir / 'coach-approval.lock').open('a') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            if any((gitdir / name).exists() for name in ('MERGE_HEAD', 'CHERRY_PICK_HEAD', 'rebase-merge', 'rebase-apply', 'index.lock')):
                raise RuntimeError('Im Ziel-Repository läuft ein anderer Git-Vorgang.')
            relative = f'klienten/freigaben/{client}/{item["createdAt"][:10]}-{item["id"]}.md'
            path = root / relative
            for parent in [path, *path.parents]:
                if parent == root:
                    break
                if parent.is_symlink():
                    raise RuntimeError('Die Zielablage enthält einen Symlink.')
            content = f'<!-- Coach-Auftrag: {item["id"]}; Klient: {client} -->\n\n{text}'
            if path.exists():
                if path.read_text(encoding='utf-8') != content:
                    raise RuntimeError('Das Dokument existiert bereits mit anderem Inhalt.')
                previous = subprocess.run(['git', '-C', str(root), 'show', f'HEAD:{relative}'], capture_output=True, text=True, timeout=10)
                if previous.returncode == 0 and previous.stdout == content:
                    return {'repository': 'business-vitaltraining', 'path': relative, 'commit': git('log', '-1', '--format=%H', '--', relative)}
                raise RuntimeError('Ein noch nicht zugeordneter Entwurf liegt am Ziel. Bitte prüfen.')
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content, encoding='utf-8')
            try:
                git('add', '--', relative)
                git('commit', '--only', '-m', f'coach: approve {client} document {item["id"]}', '--', relative)
            except Exception:
                # A hook/timeout can fail after Git has already committed.
                saved = subprocess.run(['git', '-C', str(root), 'show', f'HEAD:{relative}'], capture_output=True, text=True, timeout=10)
                if saved.returncode == 0 and saved.stdout == content:
                    return {'repository': 'business-vitaltraining', 'path': relative, 'commit': git('log', '-1', '--format=%H', '--', relative)}
                git('reset', '-q', 'HEAD', '--', relative)
                if path.read_text(encoding='utf-8') == content:
                    path.unlink()
                raise
            return {'repository': 'business-vitaltraining', 'path': relative, 'commit': git('rev-parse', 'HEAD')}
    except (OSError, RuntimeError, subprocess.TimeoutExpired) as error:
        raise HTTPException(503, f'Freigabe nicht gespeichert: {error}') from error
