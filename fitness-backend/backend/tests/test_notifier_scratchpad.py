import json

import pytest

from backend.notifier.config import ScratchpadCfg
from backend.notifier.paths import notifier_dir
from backend.notifier.scratchpad import HyprError, Scratchpad, request_focus, take_focus_request, terminal_argv

WS = "special:S-fitness"


class FakeHypr:
    """Simuliert die benutzten hyprctl-Aufrufe (klassische Dispatcher)."""

    def __init__(self, cfg, *, spawn=True, special_on_launch=True, reply="ok"):
        self.cfg, self.spawn, self.special_on_launch, self.reply = cfg, spawn, special_on_launch, reply
        self.clients, self.visible, self.log = [], False, []

    def __call__(self, args):
        self.log.append(args)
        if args == ["clients", "-j"]:
            return 0, json.dumps(self.clients)
        if args == ["monitors", "-j"]:
            return 0, json.dumps([{"name": "eDP-1", "specialWorkspace": {"name": WS if self.visible else ""}}])
        assert args[0] == "dispatch"
        name, arg = args[1], args[2]
        if self.reply != "ok":
            return 0, self.reply
        if name == "exec":
            if self.spawn:
                self.clients.append({"class": self.cfg.app_id, "workspace": {"name": WS if self.special_on_launch else "2"}})
        elif name == "togglespecialworkspace":
            assert arg == self.cfg.workspace
            self.visible = not self.visible
        elif name == "movetoworkspacesilent":
            assert arg == f"{WS},class:^({self.cfg.app_id})$"
            self.clients[0]["workspace"]["name"] = WS
        return 0, "ok"

    def dispatches(self):
        return [a[1:] for a in self.log if a[0] == "dispatch"]


def make(tmp_path, **kw):
    cfg = ScratchpadCfg()
    fake = FakeHypr(cfg, **kw)
    return Scratchpad(cfg, root=tmp_path, hyprctl=fake, sleep=lambda s: None, repo_root=tmp_path / "repo"), fake


def test_show_startet_die_tui_und_blendet_ein(tmp_path):
    pad, fake = make(tmp_path)
    pad.show()
    d = fake.dispatches()
    assert d[0][0] == "exec" and d[1] == ["togglespecialworkspace", "S-fitness"] and d[2][0] == "focuswindow"
    cmd = d[0][1]
    assert cmd.startswith("[workspace special:S-fitness silent;float;size 70% 80%;center] foot --app-id fitness-inbox -e sh -c ")
    assert "backend.notifier tui --scratchpad --root" in cmd
    assert "cd " not in cmd  # funktioniert auch aus einem installierten Wheel
    assert fake.visible


def test_show_laeuft_bereits_und_ist_sichtbar_blendet_nicht_aus(tmp_path):
    pad, fake = make(tmp_path)
    pad.show()
    fake.log.clear()
    pad.show()
    names = [d[0] for d in fake.dispatches()]
    assert "exec" not in names and "togglespecialworkspace" not in names and fake.visible


def test_toggle_blendet_ein_und_aus(tmp_path):
    pad, fake = make(tmp_path)
    assert pad.toggle() == "shown" and fake.visible
    assert pad.toggle() == "hidden" and not fake.visible
    assert pad.toggle() == "shown" and fake.visible
    assert sum(1 for d in fake.dispatches() if d[0] == "exec") == 1        # nur einmal gestartet


def test_fenster_auf_falschem_workspace_wird_verschoben(tmp_path):
    pad, fake = make(tmp_path, special_on_launch=False)
    pad.show()
    assert "movetoworkspacesilent" in [d[0] for d in fake.dispatches()]


def test_hide_nur_wenn_sichtbar(tmp_path):
    pad, fake = make(tmp_path)
    pad.hide()
    assert fake.dispatches() == []
    pad.show()
    fake.log.clear()
    pad.hide()
    assert fake.dispatches() == [["togglespecialworkspace", "S-fitness"]]


def test_focus_wird_als_anfrage_geschrieben_und_genau_einmal_gelesen(tmp_path):
    pad, _ = make(tmp_path)
    pad.show(focus="U1/2026-10-14")
    assert take_focus_request(notifier_dir(tmp_path)) == "U1/2026-10-14"
    assert take_focus_request(notifier_dir(tmp_path)) is None


def test_kaputte_focus_datei_wird_verworfen(tmp_path):
    d = notifier_dir(tmp_path)
    d.mkdir(parents=True)
    (d / "focus.json").write_text("{kaputt")
    assert take_focus_request(d) is None and not (d / "focus.json").exists()


def test_fenster_erscheint_nie(tmp_path):
    pad, _ = make(tmp_path, spawn=False)
    with pytest.raises(HyprError, match="nicht erschienen"):
        pad.show()


def test_lua_config_gibt_klare_meldung(tmp_path):
    pad, _ = make(tmp_path, reply="Invalid dispatcher")
    with pytest.raises(HyprError, match="hyprlang"):
        pad.show()


def test_hyprctl_fehler(tmp_path):
    cfg = ScratchpadCfg()
    pad = Scratchpad(cfg, root=tmp_path, hyprctl=lambda a: (1, "kaputt"), sleep=lambda s: None)
    with pytest.raises(HyprError, match="fehlgeschlagen"):
        pad.window()


@pytest.mark.parametrize("terminal,expected", [
    ("foot", ["foot", "--app-id", "x", "-e", "cmd"]),
    ("kitty", ["kitty", "--class", "x", "cmd"]),
    ("alacritty", ["alacritty", "--class", "x", "-e", "cmd"]),
])
def test_terminal_varianten(terminal, expected):
    assert terminal_argv(ScratchpadCfg(terminal=terminal, app_id="x"), ["cmd"]) == expected


def test_unbekanntes_terminal():
    with pytest.raises(HyprError):
        terminal_argv(ScratchpadCfg(terminal="xterm"), ["cmd"])


def test_pfade_mit_leerzeichen_werden_gequotet(tmp_path):
    cfg = ScratchpadCfg()
    root = tmp_path / "mit Leerzeichen"
    pad = Scratchpad(cfg, root=root, hyprctl=FakeHypr(cfg), repo_root=tmp_path / "re po")
    cmd = pad.launch_command()
    assert "'" in cmd and "mit Leerzeichen" in cmd
