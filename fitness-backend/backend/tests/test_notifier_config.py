from datetime import time

import pytest
import yaml

from backend.notifier import config as cfgmod
from backend.notifier.config import ClientRule, ConfigError, NotifyConfig, QuietHours, load_config, parse, write_default


def test_default_yaml_entspricht_den_defaults():
    assert parse(yaml.safe_load(cfgmod.DEFAULT_YAML)) == NotifyConfig()


def test_fehlende_datei_ist_none(tmp_path):
    assert load_config(tmp_path / "nix.yaml") is None


def test_regel_ueber_slug_name_oder_uid_ohne_gross_kleinschreibung():
    cfg = parse({"clients": {"matthias-mayer": {"urgency": "critical"}, "Simon": {"mute": True}, "UID-9": {"ignore": True}}})
    assert cfg.rule_for("matthias-mayer", "Matthias Mayer", "U1") == ClientRule(urgency="critical")
    assert cfg.rule_for(None, "simon", "U2").mute
    assert cfg.rule_for(None, None, "uid-9").ignore
    assert cfg.rule_for("x", "y", "z") == ClientRule()


def test_ruhezeit_ueber_mitternacht_und_am_tag():
    night = QuietHours(start="22:00", end="07:00")
    assert night.contains(time(23, 0)) and night.contains(time(3, 0)) and night.contains(time(22, 0))
    assert not night.contains(time(7, 0)) and not night.contains(time(12, 0))
    day = QuietHours(start="13:00", end="15:00")
    assert day.contains(time(14, 0)) and not day.contains(time(15, 0)) and not day.contains(time(12, 59))


@pytest.mark.parametrize("data", [
    {"urgency": "laut"}, {"max_individual": 0}, {"max_age_days": -1}, {"urgent_effort": 0},
    {"timeout_ms": "schnell"}, {"auto_seen_seconds": -1}, {"quiet_hours": {"start": "25:00"}},
    {"quiet_hours": {"mode": "leise"}}, {"clients": {"a": {"urgency": "x"}}}, {"scratchpad": {"terminal": "xterm"}},
    {"scratchpad": {"width_pct": 5}}, {"clients": ["a"]}, {"scratchpad": "foot"},
])
def test_ungueltige_werte_geben_configerror(data):
    with pytest.raises(ConfigError):
        parse(data)


def test_unbekannter_schluessel_bricht_nicht_ab():
    assert parse({"quatsch": 1, "scratchpad": {"foo": 2}}) == NotifyConfig()


def test_kaputtes_yaml(tmp_path):
    p = tmp_path / "n.yaml"
    p.write_text("a: [1, 2")
    with pytest.raises(ConfigError):
        load_config(p)


def test_write_default_ueberschreibt_nicht_ohne_force(tmp_path):
    p = tmp_path / "sub" / "n.yaml"
    write_default(p)
    assert load_config(p) == NotifyConfig()
    with pytest.raises(FileExistsError):
        write_default(p)
    write_default(p, force=True)


def test_quiet_hours_aus_yaml(tmp_path):
    cfg = parse({"quiet_hours": {"start": "21:30", "end": "06:00", "mode": "silent"}})
    assert cfg.quiet_hours == QuietHours("21:30", "06:00", "silent")
