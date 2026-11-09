import asyncio
from datetime import date

from backend.core.clients import Client
from backend.core.store import SessionStore
from backend.notifier.chronicle import Chronicle
from backend.notifier.config import NotifyConfig
from backend.notifier.inbox import Inbox
from backend.notifier.paths import notifier_dir
from backend.notifier.tui import InboxApp


def write(root, day, *, uid='U1', doc=None, **extra):
    data = {'date': day, 'saved_at': f'{day}T10:00:00+00:00', 'rev': 1,
            'sessionMode': 'strength', 'exercises': [{'name': 'Klimmzug', 'reps': 8}], **extra}
    SessionStore(root).write(uid, doc or day, data)
    return data


def chronicle(root, *, clock=lambda: date(2026, 10, 15)):
    return Chronicle(root, clock=clock, clients={'U1': Client('U1', 'Demo', 'demo', False)})


def test_fuenf_kalendertage_inklusive_heute_und_sortierung(tmp_path):
    for day in ['2026-10-10', '2026-10-11', '2026-10-14', '2026-10-15', '2026-10-16']:
        write(tmp_path, day)
    entries = chronicle(tmp_path).entries()
    assert [e.date for e in entries] == ['2026-10-15', '2026-10-14', '2026-10-11']
    assert all(e.client == 'Demo' and not e.unseen and e.action == 'chronik' for e in entries)
    assert not notifier_dir(tmp_path).exists()


def test_mehrere_sessions_pro_tag_und_personen_bleiben_erhalten(tmp_path):
    write(tmp_path, '2026-10-14', doc='2026-10-14__abend')
    write(tmp_path, '2026-10-14', doc='2026-10-14__morgen')
    write(tmp_path, '2026-10-14', uid='U2')
    c = chronicle(tmp_path)
    assert len(c.entries()) == 3
    assert len(c.entries(uid='U1')) == 2
    assert c.entries(uid='U2')[0].client == 'U2'


def test_workout_datum_zaehlt_und_fehlendes_datum_faellt_auf_dateinamen_zurueck(tmp_path):
    write(tmp_path, '2026-10-01', saved_at='2026-10-15T12:00:00+00:00')
    write(tmp_path, '2026-10-14', date=None)
    assert [e.date for e in chronicle(tmp_path).entries()] == ['2026-10-14']


def test_defekte_session_wird_ohne_quarantaene_uebersprungen(tmp_path):
    write(tmp_path, '2026-10-14')
    p = SessionStore(tmp_path).path('U1', '2026-10-14')
    p.write_text('{kaputt')
    c = chronicle(tmp_path)
    assert c.entries() == [] and c.skipped == 1
    assert p.read_text() == '{kaputt'


def test_signatur_erkennt_updates_loeschung_und_neuen_kalendertag(tmp_path):
    today = [date(2026, 10, 15)]
    c = chronicle(tmp_path, clock=lambda: today[0])
    first = c.signature()
    write(tmp_path, '2026-10-11')
    second = c.signature()
    assert first != second
    write(tmp_path, '2026-10-11', rev=2)
    assert c.signature() != second
    today[0] = date(2026, 10, 16)
    assert c.entries() == []
    before = c.signature()
    SessionStore(tmp_path).path('U1', '2026-10-11').unlink()
    assert c.signature() != before


def test_tui_startet_mit_chronik_ohne_inbox_oder_lesemarkierungen(tmp_path):
    write(tmp_path, '2026-10-14')

    async def main():
        app = InboxApp(tmp_path, NotifyConfig(auto_seen_seconds=0.1), chronicle=chronicle(tmp_path))
        async with app.run_test(size=(120, 36)) as pilot:
            await pilot.pause(0.3)
            assert app.view == 'chronicle' and app.table.row_count == 1
            assert 'Klimmzug' in app.last_detail_plain and 'Workout-Chronik' in app.last_detail_plain
            await pilot.press('space', 'A', 'm', 'u')
            await pilot.pause()
            assert app.table.row_count == 1 and not app.only_unseen
            assert not notifier_dir(tmp_path).exists()
            await pilot.press('i')
            await pilot.pause()
            assert app.view == 'inbox' and app.table.row_count == 0
            await pilot.press('h')
            await pilot.pause()
            assert app.view == 'chronicle' and app.table.row_count == 1
    asyncio.run(main())


def test_chronik_polt_session_store_ohne_notifier_eintrag(tmp_path):
    async def main():
        app = InboxApp(tmp_path, chronicle=chronicle(tmp_path), poll_interval=0.05)
        async with app.run_test() as pilot:
            await pilot.pause()
            assert app.table.row_count == 0
            write(tmp_path, '2026-10-14', notes='Neue Session')
            await pilot.pause(0.2)
            assert app.table.row_count == 1 and 'Neue Session' in app.last_detail_plain
            write(tmp_path, '2026-10-14', rev=2, notes='Korrigiert')
            await pilot.pause(0.2)
            assert 'Korrigiert' in app.last_detail_plain
            assert not notifier_dir(tmp_path).exists()
    asyncio.run(main())
