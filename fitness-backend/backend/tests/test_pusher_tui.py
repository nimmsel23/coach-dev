import asyncio

from textual.widgets import DataTable, Input, Static, TextArea

from backend.pusher import service
from backend.pusher.message import Message
from backend.pusher.tui import ConfirmScreen, HelpScreen, HistoryScreen, PushApp, ResultScreen
from backend.tests._pusher_helpers import COACH, JAKOB, MATTHIAS, REGISTRY, SIMON, FakeSource, default_settings

SIZE = (130, 40)
TEMPLATES = {"Gruß": Message("Hallo Welt", "Kurzer Text", "/")}


def make(tmp_path, **kw):
    source = kw.pop("source", None) or FakeSource(default_settings())
    app = PushApp(source, registry=REGISTRY, history=tmp_path / "h.jsonl", templates=TEMPLATES, **kw)
    return app, source


def run(coro):
    return asyncio.run(coro)


async def settle(pilot, app):
    for _ in range(40):                      # Worker-Thread laden lassen
        await pilot.pause(0.05)
        if app.recipients:
            break
    await pilot.pause()


async def fill(pilot, app, title="Hallo", body="Text", link=""):
    app.query_one("#title", Input).value = title
    app.query_one("#body", TextArea).text = body
    app.query_one("#link", Input).value = link
    await pilot.pause()


def table_rows(app):
    t = app.query_one("#recipients", DataTable)
    return [[str(c) for c in t.get_row_at(i)] for i in range(t.row_count)]


def test_empfaenger_werden_geladen_bereite_zuerst(tmp_path):
    async def go():
        app, _ = make(tmp_path)
        async with app.run_test(size=SIZE) as pilot:
            await settle(pilot, app)
            rows = table_rows(app)
            assert [r[1] for r in rows] == ["Daniel (ich)", "Matthias", "Jakob", "Simon"]
            assert [r[3] for r in rows] == ["bereit", "bereit", "Push aus", "keine Geräte"]
            assert str(app.query_one("#summary", Static).render()).startswith("0 ausgewählt")
    run(go())


def test_leertaste_waehlt_nur_bereite_aus(tmp_path):
    async def go():
        app, _ = make(tmp_path)
        async with app.run_test(size=SIZE) as pilot:
            await settle(pilot, app)
            await pilot.press("down", "space")                     # Matthias
            assert app.selected == {MATTHIAS}
            await pilot.press("down", "space")                     # Jakob: Push aus
            assert app.selected == {MATTHIAS}
            await pilot.press("up", "space")                       # Matthias wieder ab
            assert app.selected == set()
    run(go())


def test_a_n_und_s(tmp_path):
    async def go():
        app, _ = make(tmp_path)
        async with app.run_test(size=SIZE) as pilot:
            await settle(pilot, app)
            await pilot.press("a")
            assert app.selected == {COACH, MATTHIAS}               # nur Bereite
            await pilot.press("n")
            assert app.selected == set()
            await pilot.press("s")
            assert app.selected == {COACH}
    run(go())


def test_vorlage_fuellt_die_felder(tmp_path):
    async def go():
        app, _ = make(tmp_path)
        async with app.run_test(size=SIZE) as pilot:
            await settle(pilot, app)
            app.query_one("#template").value = "Gruß"
            await pilot.pause()
            assert app.message() == Message("Hallo Welt", "Kurzer Text", "/")
    run(go())


def test_senden_ohne_auswahl_oder_ungueltig_oeffnet_keine_bestaetigung(tmp_path):
    async def go():
        app, source = make(tmp_path)
        async with app.run_test(size=SIZE) as pilot:
            await settle(pilot, app)
            await fill(pilot, app)
            await pilot.press("ctrl+s")                            # nichts ausgewählt
            assert not isinstance(app.screen, ConfirmScreen)
            await pilot.press("a")
            await fill(pilot, app, title="")                       # Titel fehlt
            await pilot.press("ctrl+s")
            assert not isinstance(app.screen, ConfirmScreen)
            assert source.sent == []
    run(go())


def test_echt_senden_mit_bestaetigung_und_ergebnis(tmp_path):
    async def go():
        app, source = make(tmp_path)
        async with app.run_test(size=SIZE) as pilot:
            await settle(pilot, app)
            await pilot.press("a")
            await fill(pilot, app, title="Hallo", body="Text")
            await pilot.press("ctrl+s")
            assert isinstance(app.screen, ConfirmScreen) and not app.screen.dry_run
            assert source.sent == []                               # erst nach Bestätigung
            await pilot.press("y")
            for _ in range(40):
                await pilot.pause(0.05)
                if isinstance(app.screen, ResultScreen):
                    break
            assert isinstance(app.screen, ResultScreen)
            assert sorted(t for tokens, _ in source.sent for t in tokens) == ["tc1", "tm1", "tm2"]
            assert all(d["title"] == "Hallo" for _, d in source.sent)
    run(go())


def test_abbrechen_sendet_nichts(tmp_path):
    async def go():
        app, source = make(tmp_path)
        async with app.run_test(size=SIZE) as pilot:
            await settle(pilot, app)
            await pilot.press("a")
            await fill(pilot, app)
            await pilot.press("ctrl+s", "n")
            await pilot.pause(0.2)
            assert not isinstance(app.screen, ConfirmScreen) and source.sent == []
    run(go())


def test_trockenlauf_sendet_nichts_und_steht_im_verlauf(tmp_path):
    async def go():
        app, source = make(tmp_path, dry_run=True)
        async with app.run_test(size=SIZE) as pilot:
            await settle(pilot, app)
            assert app.sub_title == "TROCKENLAUF"
            await pilot.press("a")
            await fill(pilot, app)
            await pilot.press("ctrl+s")
            assert app.screen.dry_run
            await pilot.press("y")
            for _ in range(40):
                await pilot.pause(0.05)
                if isinstance(app.screen, ResultScreen):
                    break
            assert source.sent == []
            assert service.read_history(tmp_path / "h.jsonl")[0]["dry_run"] is True
    run(go())


def test_modus_umschalten(tmp_path):
    async def go():
        app, _ = make(tmp_path)
        async with app.run_test(size=SIZE) as pilot:
            await settle(pilot, app)
            assert app.sub_title == "ECHT"
            await pilot.press("ctrl+d")
            assert app.sub_title == "TROCKENLAUF" and app.dry_run
    run(go())


def test_tote_tokens_nach_dem_senden_neu_geladen(tmp_path):
    async def go():
        source = FakeSource(default_settings(), dead=["tm2"])
        app, _ = make(tmp_path, source=source)
        async with app.run_test(size=SIZE) as pilot:
            await settle(pilot, app)
            await pilot.press("a")
            await fill(pilot, app)
            await pilot.press("ctrl+s", "y")
            for _ in range(40):
                await pilot.pause(0.05)
                if isinstance(app.screen, ResultScreen):
                    break
            assert source.removed == [(MATTHIAS, ["tm2"])]
    run(go())


def test_verlauf_hilfe_und_ladefehler(tmp_path):
    async def go():
        app, _ = make(tmp_path)
        async with app.run_test(size=SIZE) as pilot:
            await settle(pilot, app)
            await pilot.press("h")
            assert isinstance(app.screen, HistoryScreen)
            await pilot.press("escape", "question_mark")
            assert isinstance(app.screen, HelpScreen)
            await pilot.press("escape")

        class Kaputt(FakeSource):
            def settings(self, uid):
                raise RuntimeError("Credentials fehlen")

        app2, _ = make(tmp_path, source=Kaputt({}))
        async with app2.run_test(size=SIZE) as pilot:
            for _ in range(20):
                await pilot.pause(0.05)
                if app2.load_error:
                    break
            assert "Credentials fehlen" in app2.load_error
            assert "Credentials fehlen" in str(app2.query_one("#summary", Static).render())
    run(go())
