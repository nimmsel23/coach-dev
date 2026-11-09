import asyncio
from datetime import datetime, timezone
from pathlib import Path

import pytest

from backend.core.store import SessionStore
from backend.notifier.config import NotifyConfig
from backend.notifier.inbox import Inbox
from backend.notifier.paths import notifier_dir
from backend.notifier.scratchpad import HyprError, request_focus
from backend.notifier.tui import InboxApp
from textual.widgets import Input
from textual.containers import VerticalScroll

SIZE = (120, 36)


def session(day, **extra):
    return {"date": day, "saved_at": f"{day}T10:00:00+00:00", "rev": 1, "sessionMode": "strength", **extra}


def seed(root: Path, items):
    """items: (uid, client, doc_id, session_dict)"""
    store, ib = SessionStore(root), Inbox(notifier_dir(root))
    for uid, client, doc, data in items:
        if data is not None:
            store.write(uid, doc, data)
        ib.record(uid=uid, client=client, doc_id=doc, data=data or session(doc[:10]), action="angelegt",
                  summary=f"{doc[:10]} · Kraft · 1 Übungen")
    return ib


@pytest.fixture
def root(tmp_path):
    return tmp_path


def three(root):
    return seed(root, [
        ("U1", "Matthias", "2026-10-14", session("2026-10-14", exercises=[{"name": "Klimmzug", "setsArray": [{"reps": "8", "weight": "5"}, {"reps": "7"}]}],
                                              notes="Brust <b>&</b> Rücken [red]x[/red]")),
        ("U2", "Simon", "2026-10-13", session("2026-10-13", activity={"type": "climbing", "duration": "60", "notes": "Boulderbar"})),
        ("U1", "Matthias", "2026-10-12", session("2026-10-12")),
    ])


def drive(root, scenario, *, config=None, scratchpad=None, poll=0.1):
    async def main():
        app = InboxApp(root, config or NotifyConfig(auto_seen_seconds=0), scratchpad=scratchpad, poll_interval=poll, view="inbox")
        async with app.run_test(size=SIZE) as pilot:
            await pilot.pause()
            return await scenario(app, pilot)
    return asyncio.run(main())


def test_liste_detail_und_maskierung(root):
    ib = three(root)

    async def scenario(app, pilot):
        assert app.table.row_count == 3
        assert app.current_id() == "U1/2026-10-14"                      # neuestes zuerst
        text = app.last_detail_plain
        assert "Klimmzug" in text and "8 @ 5" in text and "Brust <b>&</b> Rücken [red]x[/red]" in text
        await pilot.press("j")
        await pilot.pause()
        assert "Klettern" in app.last_detail_plain and "Boulderbar" in app.last_detail_plain

    drive(root, scenario)
    assert ib.unseen_count() == 3                                       # auto_seen aus → nichts automatisch gesehen


def test_leertaste_schaltet_gesehen_um(root):
    ib = three(root)

    async def scenario(app, pilot):
        await pilot.press("space"); await pilot.pause()
        assert ib.unseen_count() == 2 and app.current_id() == "U1/2026-10-14"
        await pilot.press("space"); await pilot.pause()
        assert ib.unseen_count() == 3

    drive(root, scenario)


def test_m_markiert_und_springt_zum_naechsten_neuen(root):
    ib = three(root)
    ib.mark_seen(["U2/2026-10-13"])

    async def scenario(app, pilot):
        await pilot.press("m"); await pilot.pause()
        assert app.current_id() == "U1/2026-10-12"                      # U2 übersprungen, schon gesehen
        assert ib.unseen_count() == 1

    drive(root, scenario)


def test_n_springt_zyklisch(root):
    ib = three(root)
    ib.mark_seen(["U1/2026-10-14", "U2/2026-10-13"])

    async def scenario(app, pilot):
        await pilot.press("n"); await pilot.pause()
        assert app.current_id() == "U1/2026-10-12"
        await pilot.press("n"); await pilot.pause()
        assert app.current_id() == "U1/2026-10-12"                      # einziges Neues, bleibt

    drive(root, scenario)


def test_n_ohne_neues_meldet_nichts_mehr(root):
    ib = three(root)
    ib.mark_all_seen()

    async def scenario(app, pilot):
        before = app.current_id()
        await pilot.press("n"); await pilot.pause()
        assert app.current_id() == before

    drive(root, scenario)


def test_grosses_A_markiert_alle(root):
    ib = three(root)

    async def scenario(app, pilot):
        await pilot.press("A"); await pilot.pause()
        assert ib.unseen_count() == 0

    drive(root, scenario)


def test_filter_nur_neue_und_klient(root):
    ib = three(root)
    ib.mark_seen(["U1/2026-10-14"])

    async def scenario(app, pilot):
        await pilot.press("u"); await pilot.pause()
        assert app.table.row_count == 2
        await pilot.press("u"); await pilot.pause()
        assert app.table.row_count == 3
        await pilot.press("c"); await pilot.pause()
        assert app.client_filter == "Matthias" and app.table.row_count == 2
        await pilot.press("c"); await pilot.pause()
        assert app.client_filter == "Simon" and app.table.row_count == 1
        await pilot.press("c"); await pilot.pause()
        assert app.client_filter is None and app.table.row_count == 3

    drive(root, scenario)


def test_leere_ansicht_zeigt_hinweis(root):
    three(root)
    Inbox(notifier_dir(root)).mark_all_seen()

    async def scenario(app, pilot):
        await pilot.press("u"); await pilot.pause()
        assert app.table.row_count == 0 and "Nichts in dieser Ansicht" in app.last_detail_plain

    drive(root, scenario)


def test_leere_inbox(root):
    async def scenario(app, pilot):
        assert app.table.row_count == 0 and "Keine Workouts" in app.last_detail_plain
        await pilot.press("space", "m", "n", "A", "u", "c"); await pilot.pause()    # darf nichts crashen

    drive(root, scenario)


def test_auto_gesehen_nach_wartezeit(root):
    ib = three(root)

    async def scenario(app, pilot):
        await pilot.pause(0.8)
        assert ib.unseen_count() == 2                                    # nur der angezeigte Eintrag, kein Kaskadieren
        assert [e.id for e in ib.entries() if not e.unseen] == ["U1/2026-10-14"]

    drive(root, scenario, config=NotifyConfig(auto_seen_seconds=0.2))


def test_neuer_eintrag_erscheint_per_polling(root):
    three(root)

    async def scenario(app, pilot):
        assert app.table.row_count == 3
        seed(root, [("U3", "Jakob", "2026-10-15", session("2026-10-15"))])
        await pilot.pause(0.5)
        assert app.table.row_count == 4

    drive(root, scenario)


def test_fokus_anfrage_springt_zum_eintrag_und_loescht_filter(root):
    three(root)

    async def scenario(app, pilot):
        await pilot.press("c"); await pilot.pause()                       # Filter: Matthias
        request_focus(notifier_dir(root), "U2/2026-10-13")                # Simon, im Filter unsichtbar
        await pilot.pause(0.5)
        assert app.client_filter is None and app.current_id() == "U2/2026-10-13"

    drive(root, scenario)


def test_fehlende_session_datei(root):
    seed(root, [("U1", "Matthias", "2026-10-14", None)])

    async def scenario(app, pilot):
        assert "nicht lesbar" in app.last_detail_plain

    drive(root, scenario)


class FakePad:
    def __init__(self, fail=False):
        self.hidden, self.fail = 0, fail

    def hide(self):
        if self.fail:
            raise HyprError("kaputt")
        self.hidden += 1


def test_escape_blendet_scratchpad_aus(root):
    three(root)
    pad = FakePad()

    async def scenario(app, pilot):
        await pilot.press("escape"); await pilot.pause()
        assert pad.hidden == 1

    drive(root, scenario, scratchpad=pad)


def test_escape_fehler_wird_angezeigt_statt_zu_crashen(root):
    three(root)

    async def scenario(app, pilot):
        await pilot.press("escape"); await pilot.pause()
        assert app.is_running

    drive(root, scenario, scratchpad=FakePad(fail=True))


def test_q_beendet(root):
    three(root)

    async def scenario(app, pilot):
        await pilot.press("q"); await pilot.pause()

    drive(root, scenario)


def test_m_im_neu_filter_ueberspringt_keinen_eintrag(root):
    ib = three(root)

    async def scenario(app, pilot):
        await pilot.press("u", "m")
        await pilot.pause()
        assert app.current_id() == "U2/2026-10-13"
        assert app.table.row_count == 2 and ib.unseen_count() == 2
        await pilot.press("m")
        await pilot.pause()
        assert app.current_id() == "U1/2026-10-12"

    drive(root, scenario)


def test_suche_und_escape(root):
    three(root)

    async def scenario(app, pilot):
        await pilot.press("slash")
        await pilot.press(*list("Simon"))
        await pilot.pause()
        assert app.table.row_count == 1 and app.current_id() == "U2/2026-10-13"
        await pilot.press("escape")
        await pilot.pause()
        assert app.is_running and app.table.row_count == 3
        assert app.focused is app.table

    drive(root, scenario)


def test_A_markiert_nur_suchergebnisse_auch_bei_gleichem_namen(root):
    ib = seed(root, [
        ("U1", "Alex", "2026-10-14", session("2026-10-14")),
        ("U2", "Alex", "2026-10-13", session("2026-10-13")),
        ("U3", "Simon", "2026-10-12", session("2026-10-12")),
    ])

    async def scenario(app, pilot):
        await pilot.press("c", "A")
        await pilot.pause()
        assert [e.uid for e in ib.entries(unseen_only=True)] == ["U3"]
        await pilot.press("c", "slash", *list("kein Treffer"), "enter", "A")
        await pilot.pause()
        assert ib.unseen_count() == 1

    drive(root, scenario)


def test_waehrend_anzeige_eingegangene_revision_bleibt_neu(root):
    ib = three(root)

    async def scenario(app, pilot):
        shown = app._entry(app.current_id())
        seed(root, [("U1", "Matthias", "2026-10-14",
                     session("2026-10-14", rev=2, saved_at="2026-10-14T12:00:00+00:00"))])
        app._auto_seen(shown.id, shown.marker)
        assert ib.get(shown.id).unseen

    drive(root, scenario, poll=60)


def test_fehlende_details_werden_nicht_automatisch_gesehen(root):
    ib = seed(root, [("U1", "Matthias", "2026-10-14", None)])

    async def scenario(app, pilot):
        await pilot.pause(0.3)
        assert ib.unseen_count() == 1

    drive(root, scenario, config=NotifyConfig(auto_seen_seconds=0.1))


def test_details_hilfe_und_kleine_terminalgroesse(root):
    three(root)

    async def scenario(app, pilot):
        await pilot.resize_terminal(80, 24)
        await pilot.pause()
        assert app.screen.has_class("compact")
        assert app.table.size.height > 0
        await pilot.press("d")
        await pilot.pause()
        assert app.screen.has_class("details-only")
        assert isinstance(app.focused, VerticalScroll)
        await pilot.press("escape", "question_mark")
        await pilot.pause()
        assert app.screen.__class__.__name__ == "HelpScreen"
        seed(root, [("U4", "Demo", "2026-10-15", session("2026-10-15"))])
        await pilot.pause(0.3)
        assert app.table.row_count == 4  # Polling läuft auch mit offener Hilfe
        await pilot.press("escape")
        await pilot.pause()
        assert app.current_id() == "U1/2026-10-14"

    drive(root, scenario)


def test_escape_im_normalen_terminal_beendet(root):
    three(root)

    async def scenario(app, pilot):
        await pilot.press("escape")
        await pilot.pause()
        assert not app.is_running

    drive(root, scenario)
