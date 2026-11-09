import json
from pathlib import Path

import pytest

from backend.pusher import message as msg
from backend.pusher import service
from backend.pusher.message import Message, MessageError, build_data
from backend.pusher.recipients import load_recipients, normalize_tokens, recipient_from_settings
from backend.pusher.templates import BUILTIN, load_templates
from backend.tests._pusher_helpers import COACH, JAKOB, MATTHIAS, REGISTRY, SIMON, FakeSource, default_settings

M = Message("Hallo", "Kurzer Text")


def recipients(source=None, **kw):
    return load_recipients(source or FakeSource(default_settings()), REGISTRY, **kw)


# ── Nachricht ────────────────────────────────────────────────────────────────

def test_nachricht_prueft_titel_text_und_laengen():
    assert Message("", "x").problems() == ["Titel fehlt"]
    assert Message("x", "  ").problems() == ["Text fehlt"]
    assert "Titel zu lang" in Message("x" * 66, "y").problems()[0]
    assert "Text zu lang" in Message("x", "y" * 301).problems()[0]
    assert M.problems() == []


@pytest.mark.parametrize("link,ok", [
    ("", True), ("/", True), ("/#/session", True), ("https://vos-coach.web.app/#/clients", True),
    ("//boese.example", False), ("http://vos-coach.web.app", False), ("https://boese.example/x", False),
    ("javascript:alert(1)", False), ("/mit leer", False), ("https://vos-coach.web.app.boese.example", False),
])
def test_links_nur_in_die_eigenen_apps(link, ok):
    assert (Message("t", "b", link).problems() == []) is ok


def test_zusaetzliche_hosts_per_env(monkeypatch):
    assert Message("t", "b", "https://neu.example/x").problems()
    monkeypatch.setenv("FITNESS_PUSH_HOSTS", "neu.example")
    assert Message("t", "b", "https://neu.example/x").problems() == []


def test_payload_hat_typ_tag_und_getrimmte_texte():
    data = build_data(Message("  Hallo ", " Text  ", ""), now=1000.0)
    assert data == {"type": "coachMessage", "title": "Hallo", "body": "Text", "link": "/", "tag": "coach-message-1000000"}
    assert build_data(M, now=1000.5)["tag"] != data["tag"]
    with pytest.raises(MessageError):
        build_data(Message("", "x"))


# ── Empfänger ────────────────────────────────────────────────────────────────

def test_status_je_empfaenger():
    by_name = {r.name: r for r in recipients()}
    assert by_name["Matthias"].status == "bereit" and by_name["Matthias"].tokens == ["tm1", "tm2"]
    assert by_name["Jakob"].status == "Push aus"
    assert by_name["Simon"].status == "keine Geräte"
    assert by_name["Daniel"].is_coach


def test_nachrichten_im_panel_ausgeschaltet():
    r = recipient_from_settings("U", "X", False, {"enabled": True, "tokens": ["t"], "types": {"coachMessage": False}})
    assert r.status == "Nachrichten aus" and not r.eligible
    assert recipient_from_settings("U", "X", False, {"enabled": True, "tokens": ["t"], "types": {}}).eligible


def test_tokens_werden_dedupliziert_und_gefiltert():
    assert normalize_tokens({"tokens": ["a", "b", "a", "", None], "token": "b"}) == ["a", "b"]
    assert normalize_tokens({}) == []


def test_bereite_zuerst_dann_nach_name_und_unbekannte_uids_werden_entdeckt():
    source = FakeSource({**default_settings(), "UX99999999": {"enabled": True, "tokens": ["tx"]}})
    names = [r.name for r in recipients(source)]
    assert names[:3] == ["Daniel", "Matthias", "UX999999…"]      # bereite zuerst, nach Name
    assert names[3:] == ["Jakob", "Simon"]
    assert "UX999999…" in names
    assert [r.name for r in recipients(source, discover=False)].count("UX999999…") == 0
    assert all(r.eligible for r in recipients(source)[:3])


# ── Senden ───────────────────────────────────────────────────────────────────

def test_dry_run_sendet_nichts_und_raeumt_nichts_auf(tmp_path):
    source = FakeSource(default_settings(), dead=["tm2"])
    report = service.send(source, recipients(source), M, dry_run=True, history=tmp_path / "h.jsonl")
    assert source.sent == [] and source.removed == []
    assert report.dry_run and report.sent == 3        # Daniel 1 + Matthias 2
    assert {r.name: r.skipped for r in report.rows if r.skipped} == {"Jakob": "Push aus", "Simon": "keine Geräte"}


def test_echter_versand_nur_an_bereite_und_mit_payload(tmp_path):
    source = FakeSource(default_settings())
    report = service.send(source, recipients(source), M, dry_run=False, history=tmp_path / "h.jsonl", now=5.0)
    assert sorted(t for tokens, _ in source.sent for t in tokens) == ["tc1", "tm1", "tm2"]
    assert all(data["title"] == "Hallo" and data["type"] == "coachMessage" for _, data in source.sent)
    assert report.sent == 3 and report.failed == 0 and report.reached == 2


def test_nur_ausgewaehlte_empfaenger(tmp_path):
    source = FakeSource(default_settings())
    chosen = [r for r in recipients(source) if r.uid == MATTHIAS]
    report = service.send(source, chosen, M, dry_run=False, history=tmp_path / "h.jsonl")
    assert [tokens for tokens, _ in source.sent] == [["tm1", "tm2"]] and report.sent == 2


def test_tote_tokens_werden_gezaehlt_und_entfernt(tmp_path):
    source = FakeSource(default_settings(), dead=["tm2"])
    report = service.send(source, recipients(source), M, dry_run=False, history=tmp_path / "h.jsonl")
    matthias = next(r for r in report.rows if r.uid == MATTHIAS)
    assert (matthias.sent, matthias.failed, matthias.removed) == (1, 1, 1)
    assert source.removed == [(MATTHIAS, ["tm2"])]


def test_fehler_bei_einem_empfaenger_stoppt_die_anderen_nicht(tmp_path):
    settings = default_settings()
    settings[MATTHIAS]["tokens"] = ["boom"]
    settings[MATTHIAS].pop("token")
    source = FakeSource(settings)
    report = service.send(source, recipients(source), M, dry_run=False, history=tmp_path / "h.jsonl")
    matthias = next(r for r in report.rows if r.uid == MATTHIAS)
    assert matthias.skipped.startswith("Fehler") and matthias.failed == 1
    assert next(r for r in report.rows if r.uid == COACH).sent == 1


def test_ungueltige_nachricht_wird_nicht_gesendet(tmp_path):
    source = FakeSource(default_settings())
    with pytest.raises(MessageError):
        service.send(source, recipients(source), Message("", "x"), dry_run=False, history=tmp_path / "h.jsonl")
    assert source.sent == [] and not (tmp_path / "h.jsonl").exists()


# ── Verlauf ──────────────────────────────────────────────────────────────────

def test_verlauf_enthaelt_text_und_empfaenger_aber_keine_tokens(tmp_path):
    h = tmp_path / "pusher" / "h.jsonl"
    source = FakeSource(default_settings())
    service.send(source, recipients(source), M, dry_run=False, history=h, now=1000.0)
    raw = h.read_text()
    assert "tm1" not in raw and "tc1" not in raw
    entry = service.read_history(h)[0]
    assert entry["title"] == "Hallo" and entry["dry_run"] is False
    assert {r["name"] for r in entry["rows"]} == {"Daniel", "Matthias", "Jakob", "Simon"}


def test_verlauf_neueste_zuerst_und_kaputte_zeilen_werden_uebersprungen(tmp_path):
    h = tmp_path / "h.jsonl"
    h.write_text(json.dumps({"at": "a", "title": "alt"}) + "\n{halbe zeile\n" + json.dumps({"at": "b", "title": "neu"}) + "\n")
    assert [e["title"] for e in service.read_history(h)] == ["neu", "alt"]
    assert service.read_history(tmp_path / "gibt-es-nicht.jsonl") == []


def test_doppelversand_innerhalb_von_zehn_minuten_wird_erkannt(tmp_path):
    h = tmp_path / "h.jsonl"
    source = FakeSource(default_settings())
    service.send(source, recipients(source), M, dry_run=False, history=h, now=1000.0)
    assert service.recent_duplicate(M, h, now=1000.0 + 300)
    assert not service.recent_duplicate(M, h, now=1000.0 + 601)
    assert not service.recent_duplicate(Message("Hallo", "Anderer Text"), h, now=1000.0 + 10)


def test_dry_run_zaehlt_nicht_als_doppelversand(tmp_path):
    h = tmp_path / "h.jsonl"
    source = FakeSource(default_settings())
    service.send(source, recipients(source), M, dry_run=True, history=h, now=1000.0)
    assert not service.recent_duplicate(M, h, now=1001.0)


# ── Vorlagen ─────────────────────────────────────────────────────────────────

def test_eigene_vorlagen_ergaenzen_und_ueberschreiben(tmp_path):
    p = tmp_path / "t.yaml"
    p.write_text("Eigene:\n  title: Hi\n  body: Text\nCheck-in:\n  title: Neu\n  body: Überschrieben\n"
                 "Kaputt:\n  title: ''\n  body: x\nLink:\n  title: a\n  body: b\n  link: https://boese.example\n")
    t = load_templates(p)
    assert t["Eigene"].title == "Hi" and t["Eigene"].link == "/"
    assert t["Check-in"].body == "Überschrieben"
    assert "Kaputt" not in t and "Link" not in t
    assert set(BUILTIN) <= set(t)


def test_vorlagen_ohne_datei_oder_mit_muell_fallen_auf_eingebaute_zurueck(tmp_path):
    assert load_templates(tmp_path / "nix.yaml") == BUILTIN
    p = tmp_path / "t.yaml"
    p.write_text("- das\n- ist eine liste\n")
    assert load_templates(p) == BUILTIN
    p.write_text(": : kein yaml [")
    assert load_templates(p) == BUILTIN


def test_alle_eingebauten_vorlagen_sind_gueltig():
    for name, template in BUILTIN.items():
        assert template.problems() == [], name


def test_unbekannte_uids_ohne_push_werden_ausgeblendet():
    source = FakeSource({**default_settings(), "test_junk_1": {}, "test_junk_2": {"enabled": False, "tokens": ["x"]}})
    assert not any(r.uid.startswith("test_junk") for r in recipients(source))
    shown = load_recipients(source, REGISTRY, show_inactive_unknown=True)
    assert {r.uid for r in shown if r.uid.startswith("test_junk")} == {"test_junk_1", "test_junk_2"}
    # Registry-Klienten bleiben auch ohne Push sichtbar (Jakob: Push aus)
    assert "Jakob" in [r.name for r in recipients(source)]


def test_pausierte_geraete_bekommen_nichts():
    data = {"enabled": True, "tokens": ["a", "b", "c"], "token": "a",
            "devices": [{"token": "b", "paused": True}, {"token": "c", "paused": False}]}
    assert normalize_tokens(data) == ["a", "c"]
    assert normalize_tokens(data, include_paused=True) == ["a", "b", "c"]
    r = recipient_from_settings("U", "X", False, data)
    assert r.tokens == ["a", "c"] and r.paused == 1 and r.eligible


def test_alle_geraete_pausiert_ist_nicht_bereit():
    data = {"enabled": True, "tokens": ["a"], "devices": [{"token": "a", "paused": True}]}
    r = recipient_from_settings("U", "X", False, data)
    assert r.status == "Geräte pausiert" and not r.eligible and r.tokens == []
