"""
fitness.log.cli — Typer CLI App (fitness log).

Direkter Dateizugriff auf Session-JSONs — kein Server nötig.

Subcommands:
  ls [--days N]         Sessions der letzten N Tage auflisten
  show [DATE]           Detail-Ansicht (heute / gestern / YYYY-MM-DD)
  week                  7-Tage Wochenübersicht
  history ÜBUNG         Set-Verlauf aus SQLite
  stats [--days N]      Aggregate (Split, Cardio, Muskel-Coverage)
  sync-status           Firestore ↔ lokal Sync-Status + Klienten-Registry
  clients [NAME]         Alle Klienten-Sessions chronologisch (--journal für Freitext,
                         --block/-b, --min-rest, --cardio-only, --strength-only als Filter;
                         zeigt pro Kraft-Session die Rest-Days seit dem letzten Block
                         gleicher Art, z.B. "(15d rest)")
  console                Live-TUI: Klienten-Logs + Zwei-KI-Analyse (siehe log/console/)
  drafts [--client NAME]  Persistierte KI-Entwuerfe aus der Console anzeigen
"""
from __future__ import annotations

import json
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Optional

import typer

from ..constants import ACTIVITY_EMOJI, ACTIVITY_LABEL, WEEKDAYS_DE, block_ansi_color
from ..muscles import muscle_to_group, muscle_group_label
from ..data import (
    classify,
    activity_minutes,
    load_client_registry,
    load_sessions,
    load_training_days,
    load_training_day_for_date,
    performed_exercises,
    rollup_training_days,
    session_activities,
    sqlite_exercise_history,
    sync_info,
)
from ..paths import AOS_USERS, KLIENTEN_DIR, KLIENTEN_SKIP, sessions_dir, sqlite_db
from ..render import c, fmt_date, gum_table, header, one_line, render_detail

app = typer.Typer(
    name="fitness-log",
    help=__doc__,
    no_args_is_help=True,
    add_completion=False,
)


# ── ls ────────────────────────────────────────────────────────────────────────

@app.command(name="ls", help="Sessions der letzten N Tage auflisten")
def cmd_ls(
    days: int  = typer.Option(14, "--days", "-d", help="Anzahl Tage"),
    all_: bool = typer.Option(False, "--all", "-a", help="Alle gespeicherten Sessions"),
) -> None:
    n = 9999 if all_ else days
    sessions = load_training_days(n)
    if not sessions:
        print(c("muted", "  Keine Sessions gefunden."))
        raise typer.Exit()

    sdir = sessions_dir()
    header(f"Trainingstage — {'alle' if all_ else f'letzte {n} Tage'}  ({len(sessions)} Tage)")
    print(c("dim", f"  Quelle: {sdir}\n"))
    for s in sessions:
        print(one_line(s))
    print()


# ── show ──────────────────────────────────────────────────────────────────────

@app.command(name="show", help="Detail-Ansicht einer Session")
def cmd_show(
    date_arg: Optional[str] = typer.Argument(
        None, help="YYYY-MM-DD | heute | gestern"
    ),
) -> None:
    today_s = date.today().isoformat()
    yest_s  = (date.today() - timedelta(days=1)).isoformat()

    if not date_arg or date_arg in ("heute", "today"):
        target = today_s
    elif date_arg in ("gestern", "yesterday"):
        target = yest_s
    else:
        target = date_arg

    sessions = load_training_day_for_date(target)
    if not sessions:
        print(c("red", f"  Keine Session für {target} gefunden."))
        raise typer.Exit(1)

    if len(sessions) > 1:
        print(c("accent", f"  {len(sessions)} Trainingstag am {target}:\n"))
    for s in sessions:
        render_detail(s)


# ── week ──────────────────────────────────────────────────────────────────────

@app.command(name="week", help="Wochenübersicht letzte 7 Tage")
def cmd_week() -> None:
    all_sessions = load_training_days(7)
    by_date: dict[str, list[dict]] = {}
    for s in all_sessions:
        by_date.setdefault(s["date"], []).append(s)

    header("Woche — letzte 7 Tage")
    today = date.today()
    strength_count = cardio_count = total_ex = cardio_min = 0

    for i in range(6, -1, -1):
        d       = (today - timedelta(days=i)).isoformat()
        weekday = datetime.strptime(d, "%Y-%m-%d").strftime("%a %d.%m")
        day_s   = by_date.get(d, [])

        if not day_s:
            print(f"  {c('muted', weekday)}  {c('dim', '·  Ruhetag')}")
            continue

        parts = []
        for s in day_s:
            kind  = classify(s)
            acts  = session_activities(s)
            act   = acts[0] if acts else (s.get("activity") or {})
            exs   = performed_exercises(s)
            block = s.get("block", "")

            if kind == "cardio":
                atype = act.get("type", "?")
                emoji = ACTIVITY_EMOJI.get(atype, "🏃")
                label = ACTIVITY_LABEL.get(atype, atype)
                adur  = activity_minutes(s)
                cardio_min += adur
                cardio_count += 1
                labels = " + ".join(
                    f"{ACTIVITY_EMOJI.get(a.get('type', '?'), '🏃')} {ACTIVITY_LABEL.get(a.get('type', '?'), a.get('type', '?'))}"
                    for a in acts or [act]
                )
                parts.append(
                    f"{c('orange', labels or (emoji + ' ' + label))}"
                    + (f" {c('muted', str(adur) + 'min')}" if adur else "")
                )
            else:
                bc = block_ansi_color(block)
                strength_count += 1
                total_ex += len(exs)
                addon = ""
                if kind == "strength+addon":
                    total = activity_minutes(s)
                    icons = "".join(ACTIVITY_EMOJI.get(a.get("type", "?"), "⚡") for a in acts)
                    addon = f" {c('orange', icons or '⚡')}" + (f"{c('muted', '+' + str(total) + 'min')}" if total else "")
                exnames  = ", ".join(e.get("name", "?") for e in exs[:3])
                ellipsis = "…" if len(exs) > 3 else ""
                parts.append(
                    f"{c(bc, '●')} {c('bold', block or '?')}"
                    f"  {c('muted', exnames + ellipsis)}{addon}"
                )

        print(f"  {c('muted', weekday)}  " + f"  {c('dim', '│')}  ".join(parts))

    print()
    print(
        f"  {c('muted', 'Kraft:')} {c('white', str(strength_count) + 'x')}"
        f"  {c('muted', 'Übungen:')} {c('white', str(total_ex))}"
        f"  {c('muted', 'Ausdauer:')} {c('orange', str(cardio_count) + 'x')}"
        + (f"  {c('muted', str(cardio_min) + 'min')}" if cardio_min else "")
    )
    print()


# ── history ───────────────────────────────────────────────────────────────────

@app.command(name="history", help="Übungs-Verlauf aus SQLite")
def cmd_history(
    exercise: str = typer.Argument(..., help="Name oder ID (Substring-Suche)"),
    limit: int    = typer.Option(10, "--limit", "-n", help="Max. Einträge"),
) -> None:
    if not sqlite_db().exists():
        print(c("red", "  training_history.sqlite nicht gefunden."))
        raise typer.Exit(1)

    rows = sqlite_exercise_history(exercise, limit)
    if not rows:
        print(c("muted", f"  Keine Daten für '{exercise}'."))
        raise typer.Exit()

    header(f"Verlauf — {rows[0]['display_name']}")
    table_rows = []
    for r in rows:
        w = f"{r['weight']:.1f}kg" if r["weight"] else "—"
        table_rows.append([
            r["date"],
            str(r["sets"] or "—"),
            str(r["reps"] or "—"),
            w,
            str(r["rpe"] or "—"),
            (r["notes"] or "")[:30],
        ])
    gum_table(
        ["Datum", "Sets", "Wdh", "Gewicht", "RPE", "Notiz"],
        table_rows,
        [12, 5, 5, 10, 5, 32],
    )
    print()


# ── stats ─────────────────────────────────────────────────────────────────────

@app.command(name="stats", help="Aggregate-Statistiken")
def cmd_stats(
    days: int = typer.Option(28, "--days", "-d", help="Zeitraum in Tagen"),
) -> None:
    sessions = load_training_days(days)
    if not sessions:
        print(c("muted", "  Keine Sessions."))
        raise typer.Exit()

    header(f"Stats — letzte {days} Tage  ({len(sessions)} Trainingstage)")

    strength = [s for s in sessions if classify(s) != "cardio"]
    cardio   = [s for s in sessions if classify(s) == "cardio"]
    total_ex = sum(
        len(performed_exercises(s))
        for s in strength
    )
    cardio_min = 0
    for s in cardio:
        try:
            cardio_min += activity_minutes(s)
        except Exception:
            pass

    block_dist: dict[str, int] = {}
    muscle_freq: dict[str, int] = {}
    for s in strength:
        bl = (s.get("block") or "?").strip()
        block_dist[bl] = block_dist.get(bl, 0) + 1
        for ex in (s.get("exercises") or []):
            if ex.get("done"):
                for m in (ex.get("primaryMuscles") or []):
                    group = muscle_to_group(m)
                    if group:
                        muscle_freq[group] = muscle_freq.get(group, 0) + 2
                for m in (ex.get("secondaryMuscles") or []):
                    group = muscle_to_group(m)
                    if group:
                        muscle_freq[group] = muscle_freq.get(group, 0) + 1

    cardio_dist: dict[str, int] = {}
    for s in cardio:
        for act in session_activities(s):
            atype = act.get("type", "?")
            cardio_dist[atype] = cardio_dist.get(atype, 0) + 1

    print(f"\n  {c('bold', 'Sessions')}")
    print(
        f"  Krafttage: {c('accent', str(len(strength)) + 'x')}"
        f"  ·  {c('muted', str(total_ex) + ' Übungen gesamt')}"
    )
    print(
        f"  Cardio-Tage: {c('orange', str(len(cardio)) + 'x')}"
        + (f"  ·  {c('muted', str(cardio_min) + ' min gesamt')}" if cardio_min else "")
    )

    if block_dist:
        print(f"\n  {c('bold', 'Split')}")
        mx = max(block_dist.values())
        for bl, cnt in sorted(block_dist.items(), key=lambda x: -x[1]):
            bc     = block_ansi_color(bl)
            filled = round(cnt / mx * 12)
            bar    = c(bc, "━" * filled) + c("dim", "╌" * (12 - filled))
            print(f"  {c(bc, f'{bl:<12}')}  {bar}  {c('muted', str(cnt) + 'x')}")

    if cardio_dist:
        print(f"\n  {c('bold', 'Ausdauer')}")
        for atype, cnt in sorted(cardio_dist.items(), key=lambda x: -x[1]):
            emoji = ACTIVITY_EMOJI.get(atype, "🏃")
            label = ACTIVITY_LABEL.get(atype, atype)
            print(f"  {emoji} {c('orange', f'{label:<14}')} {c('muted', str(cnt) + 'x')}")

    if muscle_freq:
        print(f"\n  {c('bold', 'Muskel-Coverage')}")
        total = sum(muscle_freq.values())
        mx    = max(muscle_freq.values())
        for m, cnt in sorted(muscle_freq.items(), key=lambda x: -x[1])[:8]:
            label  = muscle_group_label(m)
            pct    = round(cnt / total * 100)
            filled = round(cnt / mx * 14)
            bar    = c("accent", "━" * filled) + c("dim", "╌" * (14 - filled))
            print(f"  {c('white', f'{label:<14}')}  {bar}  {c('muted', str(pct) + '%')}")
    print()


# ── sync-status ───────────────────────────────────────────────────────────────

@app.command(name="sync-status", help="Firestore ↔ lokal Sync-Status + Klienten-Registry")
def cmd_sync_status() -> None:
    header("Firestore ↔ Lokal Sync")
    info = sync_info()

    state_c = "green" if info["state"] == "active" else "red"
    print(f"\n  {c('muted', 'Service:')}  {c(state_c, info['state'] + ' (' + info['sub'] + ')')}")
    print(f"  {c('muted', 'Letzter Run:')} {c('white', info['last_run'])}")

    print(f"\n  {c('muted', 'Sessions-Pfad:')} {c('white', info['sdir'])}")
    print(f"  {c('muted', 'JSON-Dateien:')}  {c('accent', str(info['json_count']))}")
    print(
        f"  {c('muted', 'SQLite Sets:')}   {c('accent', str(info['sqlite_n']))}"
        f"  {c('dim', '(latest: ' + str(info['sqlite_latest']) + ')')}"
    )

    newest = info["newest"]
    age    = info["newest_age"]
    if newest and newest != "?":
        age_c = "green" if isinstance(age, int) and age < 2 \
            else "yellow" if isinstance(age, int) and age < 7 else "red"
        print(
            f"  {c('muted', 'Neueste Session:')} {c(age_c, newest)}"
            f"  {c('dim', str(age) + ' Tage alt')}"
        )

    if info["daemon_active"]:
        print(f"\n  {c('green', '● Mirror-Daemon läuft')}")
    else:
        print(f"\n  {c('yellow', '○ Mirror-Daemon nicht aktiv')}  {c('dim', '(boot-only one-shot)')}")

    print(f"\n  {c('dim', '→ fitness sync  zum manuellen Pull/Push')}")

    # ── Klienten-Registry ─────────────────────────────────────────────────────
    registry = load_client_registry()
    if registry:
        print(f"\n  {c('bold', 'Klienten-Registry')}  {c('muted', str(KLIENTEN_DIR))}")
        for uid, meta in registry.items():
            sdir = AOS_USERS / uid / "fitness" / "sessions"
            if sdir.exists():
                files  = list(sdir.glob("*.json"))
                n      = len({f.stem[:10] for f in files if len(f.stem) >= 10})
                dates  = sorted((f.stem[:10] for f in files if len(f.stem) >= 10), reverse=True)
                newest = dates[0] if dates else "—"
                try:
                    from datetime import date as _date
                    age   = (_date.today() - _date.fromisoformat(newest)).days
                    age_c = "green" if age < 3 else "yellow" if age < 7 else "red"
                    age_s = c(age_c, newest) + c("dim", f" ({age}d)")
                except Exception:
                    age_s = c("muted", newest)
                sync_s = c("green", f"✓ {n} Sessions") + "  " + age_s
            else:
                sync_s = c("yellow", "○ kein lokaler Sync")
            name_col = c("white", f"{meta['name']:<18}")
            print(
                f"  {name_col}"
                f" {c('muted', uid[:12] + '…')}  {sync_s}"
            )
    print()


# ── clients ───────────────────────────────────────────────────────────────────

import re as _re

_JOURNAL_BLOCK_RE = _re.compile(r"<!--\s*(\w+):([^>]*?)\s*-->\s*(.*?)(?=<!--|\Z)", _re.DOTALL)
_JOURNAL_HABIT_MARKERS = {"fshr", "fshid"}  # alles Habit-bezogene -- gehoert nicht ins Journal, auch mit Freitext nicht


def _parse_journal_blocks(text: str) -> list[tuple[str, str]]:
    blocks = []
    for m in _JOURNAL_BLOCK_RE.finditer(text):
        marker, _id, content = m.group(1), m.group(2), m.group(3).strip()
        if content:
            blocks.append((marker, content))
    if not blocks and text.strip():
        blocks.append(("?", text.strip()))
    return blocks


def _journal_preview(text: str, width: int = 90) -> str:
    """Preview-Text fuer eine Journal-Zeile; nur echter Freitext, Habit-Sync-Zeilen werden nie gezeigt."""
    blocks = _parse_journal_blocks(text)
    content_blocks = [content for marker, content in blocks if marker not in _JOURNAL_HABIT_MARKERS]
    if not content_blocks:
        return ""
    preview = " / ".join(content_blocks).replace("\n", " ")
    if len(preview) > width:
        preview = preview[:width] + "…"
    return preview


def _firestore_journal_texts(uid: str, cutoff: str) -> dict[str, list[str]]:
    """Live-Query gegen fitness/{uid}/journal in Firestore -- unabhaengig vom
    fitness-firestore-daemon.service, der nur EINEN UID (den eigenen) live
    beobachtet. Klienten-Journal-Eintraege, die noch nie lokal gepullt wurden
    (kein `fitness sync pull-uid` gelaufen), tauchen sonst nirgends auf.
    Habits werden hier nie erfasst, da die Firestore-Collection "journal"
    (fsid-Marker) von "habitJournals" (fshid-Marker) getrennt ist.
    """
    try:
        from fitness.firestore._db import get_db
    except Exception:
        return {}
    try:
        db = get_db()
        from google.cloud.firestore_v1.base_query import FieldFilter
        docs = db.collection("fitness").document(uid).collection("journal").where(filter=FieldFilter("date", ">=", cutoff)).stream()
    except Exception:
        return {}

    out: dict[str, list[str]] = {}
    for doc in docs:
        data = doc.to_dict() or {}
        d = str(data.get("date") or "")
        text = str(data.get("text") or "").strip()
        if not d or not text:
            continue
        out.setdefault(d, []).append(text)
    return out


def _journal_dirs_for_uid(uid: str) -> list[Path]:
    """Alle Ordner namens 'journal' unter ~/.aos/users/<uid>/ -- egal aus welcher Domain.

    Rekursion manuell statt Path.glob("**/...", recurse_symlinks=True): dieser
    Kwarg gibt es erst ab Python 3.13, das installierte fitness-agent uv-tool
    laeuft aber auf 3.11 -- os.walk(followlinks=True) ist versionsunabhaengig
    und loest ~/.aos/users/<uid>/fitness (ein Symlink) trotzdem auf.
    """
    import os

    user_root = AOS_USERS / uid
    if not user_root.exists():
        return []
    found: list[Path] = []
    for root, dirnames, _files in os.walk(user_root, followlinks=True):
        if Path(root).name == "journal":
            found.append(Path(root))
    return found


@app.command(name="clients", help="Alle Klienten-Sessions chronologisch ausgeben")
def cmd_clients(
    name_filter: Optional[str] = typer.Argument(
        None, help="Nur dieser Klient (Name oder Slug, z.B. matthias-mayer) — case-insensitive Teilstring"
    ),
    days: int  = typer.Option(90,  "--days", "-d", help="Fenster in Tagen (0 = alle)"),
    all_: bool = typer.Option(False, "--all", "-a",  help="Gesamtes Archiv (ignoriert --days)"),
    journal: bool = typer.Option(False, "--journal", "-j", help="Journal-Freitext passend zum Datum mit einsortieren (keine Habits); fragt zusaetzlich live Firestore ab, falls noch nicht lokal gepullt"),
    block_filter: Optional[str] = typer.Option(None, "--block", "-b", help="Nur Sessions mit diesem Block (z.B. Push/Pull/Legs) — case-insensitive"),
    min_rest: Optional[int] = typer.Option(None, "--min-rest", help="Nur Sessions zeigen, bei denen seit dem letzten Block gleicher Art mindestens N Tage vergangen sind"),
    cardio_only: bool = typer.Option(False, "--cardio-only", help="Nur Cardio/Aktivitäts-Einträge zeigen, keine Kraft-Sessions"),
    strength_only: bool = typer.Option(False, "--strength-only", help="Nur Kraft-Sessions zeigen, keine Cardio/Aktivitäts-Einträge"),
) -> None:
    registry = load_client_registry()
    if not registry:
        print(c("yellow", "  Keine Klienten in ~/Klienten/ gefunden."))
        raise typer.Exit()

    n_days = 9999 if all_ else days
    cutoff = (date.today() - timedelta(days=n_days)).isoformat() if n_days < 9999 else "0000-00-00"

    needle = name_filter.strip().lower() if name_filter else None

    # deduplizieren: pro Client (slug) einmal ausgeben
    seen_slugs: set[str] = set()
    matched_any = False
    for meta in registry.values():
        slug = meta["slug"]
        if slug in seen_slugs:
            continue
        seen_slugs.add(slug)

        if needle and needle not in slug.lower() and needle not in meta["name"].lower():
            continue
        matched_any = True

        name = meta["name"]
        uids = meta.get("uids") or [meta["uid"]]

        # Alle JSON-Files aus allen UIDs sammeln
        all_files: list[Path] = []
        for uid in uids:
            sdir = AOS_USERS / uid / "fitness" / "sessions"
            if sdir.exists():
                all_files.extend(sdir.glob("*.json"))

        uid_str = "  ".join(c("muted", u[:12] + "…") for u in uids)
        print(f"\n{c('bold', '── ' + name + ' ' + '─' * max(0, 40 - len(name)))}")
        print(f"   {uid_str}")

        if not all_files:
            print(f"   {c('yellow', '○ Kein lokaler Sync — Firestore-Pull nötig')}")
            continue

        raw_sessions = []
        for f in all_files:
            d = f.stem[:10]
            if len(d) < 10 or d < cutoff:
                continue
            try:
                s = json.loads(f.read_text())
            except Exception:
                continue
            s.setdefault("date", d)
            s["_stem"] = f.stem
            raw_sessions.append(s)
        sessions = rollup_training_days(raw_sessions)
        session_by_date = {s.get("date", ""): s for s in sessions}

        journal_by_date: dict[str, str] = {}
        if journal:
            for uid in uids:
                for jdir in _journal_dirs_for_uid(uid):
                    for f in jdir.glob("*.md"):
                        d = f.stem[:10]
                        if len(d) != 10 or d < cutoff:
                            continue
                        preview = _journal_preview(f.read_text(encoding="utf-8"))
                        if preview:
                            journal_by_date[d] = preview

            for uid in uids:
                for d, texts in _firestore_journal_texts(uid, cutoff).items():
                    existing = journal_by_date.get(d, "")
                    for text in texts:
                        if text not in existing:
                            existing = f"{existing} / {text}" if existing else text
                    if existing:
                        journal_by_date[d] = existing

        all_dates = sorted(set(session_by_date) | set(journal_by_date), reverse=True)

        # Rest-Days seit letztem Block gleicher Art (Push/Pull/Legs/...) —
        # chronologisch (aufsteigend) einmal durchlaufen, pro Block den
        # jeweils letzten Vorkommen-Tag merken.
        rest_days_by_date: dict[str, int] = {}
        last_seen_by_block: dict[str, date] = {}
        for d in sorted(session_by_date):
            s_chrono = session_by_date[d]
            if classify(s_chrono) == "cardio":
                continue
            block_chrono = (s_chrono.get("block") or "").strip()
            if not block_chrono:
                continue
            try:
                d_date = datetime.strptime(d, "%Y-%m-%d").date()
            except ValueError:
                continue
            prev = last_seen_by_block.get(block_chrono)
            if prev is not None:
                rest_days_by_date[d] = (d_date - prev).days
            last_seen_by_block[block_chrono] = d_date

        shown = 0
        for d in all_dates:
            try:
                date_s = c("dim", datetime.strptime(d, "%Y-%m-%d").strftime("%a %d.%m.%y"))
            except ValueError:
                date_s = c("dim", d)

            s = session_by_date.get(d)
            if s is not None:
                kind  = classify(s)
                acts  = session_activities(s)
                act   = acts[0] if acts else (s.get("activity") or {})
                exs   = performed_exercises(s)
                block = s.get("block", "")
                eff   = s.get("effort")
                gap   = rest_days_by_date.get(d)

                if cardio_only and kind != "cardio":
                    s = None
                elif strength_only and kind == "cardio":
                    s = None
                elif block_filter and (block or "").strip().lower() != block_filter.strip().lower():
                    s = None
                elif min_rest is not None and (kind == "cardio" or gap is None or gap < min_rest):
                    s = None

            if s is not None:
                if kind == "cardio":
                    atype = act.get("type", "?")
                    adur  = activity_minutes(s)
                    label = " + ".join(
                        f"{ACTIVITY_EMOJI.get(a.get('type', '?'), '🏃')} {ACTIVITY_LABEL.get(a.get('type', '?'), a.get('type', '?'))}"
                        for a in acts or [act]
                    ) or ACTIVITY_LABEL.get(atype, atype)
                    dur_s = c("dim", f"{adur}min") if adur else ""
                    print(f"   {date_s}   {c('orange', label)}  {dur_s}")
                else:
                    bc    = block_ansi_color(block)
                    ex_names = ", ".join(e.get("name", "?") for e in exs[:4])
                    ell   = "…" if len(exs) > 4 else ""
                    eff_s = c("yellow", f"RPE {eff}") if eff else ""
                    addon = ""
                    if kind == "strength+addon":
                        adur  = activity_minutes(s)
                        icons = "".join(ACTIVITY_EMOJI.get(a.get("type", "?"), "⚡") for a in acts)
                        addon = f"  {icons or '⚡'}{c('dim', '+' + str(adur) + 'min') if adur else ''}"
                    gap_s = ""
                    if gap is not None:
                        gap_color = "red" if gap >= 10 else ("yellow" if gap >= 7 else "dim")
                        gap_s = f"  {c(gap_color, f'({gap}d rest)')}"
                    print(f"   {date_s}   {c(bc, '[' + (block or '?') + ']')}  "
                          f"{c('dim', ex_names + ell)}  {eff_s}{addon}{gap_s}")
                shown += 1

            preview = journal_by_date.get(d)
            if preview:
                if s is None:
                    print(f"   {date_s}   {c('cyan', '📓')} {c('white', preview)}")
                else:
                    print(f"      {c('dim', '↳ 📓')} {c('dim', preview)}")
                    shown += 1

        if shown == 0:
            window = f"letzten {n_days}d" if n_days < 9999 else "gesamt"
            print(f"   {c('dim', 'Keine Sessions im Fenster (' + window + ')')}")

    if needle and not matched_any:
        print(c("red", f"  Kein Klient gefunden fuer '{name_filter}'."))
        raise typer.Exit(1)

    print()


# ── console ───────────────────────────────────────────────────────────────────
# Live-TUI: alle Klienten-Sessions/Journal-Eintraege in Echtzeit + Zwei-KI-
# Analyse (Trainingsluecken-Kontext-Check, Auto-Feedback-Entwuerfe). Implementierung
# als eigenes Subpackage: fitness/log/console/ (Watcher/Gap-Check/Rich-UI
# getrennt, siehe console/__init__.py).

@app.command(name="console", help="Live-TUI: Klienten-Logs in Echtzeit + Zwei-KI-Analyse (Trainingsluecken, Auto-Feedback)")
def cmd_console(
    gap_check_interval: int = typer.Option(1800, "--gap-interval", help="Sekunden zwischen Trainingsluecken-Checks"),
    daemon: bool = typer.Option(True, "--daemon/--no-daemon", help="fitness-firestore-daemon mit der Console starten/stoppen (stoppt nur, wenn die Console ihn gestartet hat)"),
    classic: bool = typer.Option(False, "--classic", help="Alte Ein-Panel-Console (Rich) statt des Textual-Dashboards"),
) -> None:
    from .console.daemon import firestore_daemon
    with firestore_daemon(daemon):
        if classic:
            from .console import run
            run(gap_check_interval)
        else:
            from .console.tui import run_tui
            run_tui(gap_check_interval)


# ── drafts ────────────────────────────────────────────────────────────────────
# Persistierte KI-Ausgaben aus der Live-Console (console/drafts.py) ausserhalb
# der laufenden Session einsehen — Schritt 1 im console-Ausbau.

@app.command(name="drafts", help="Persistierte KI-Entwuerfe aus der Live-Console anzeigen (Gap-Erklaerungen, Feedback)")
def cmd_drafts(
    client: str = typer.Option(None, "--client", help="Nur Entwuerfe fuer diesen Klienten (Name-Substring)"),
    limit: int = typer.Option(20, "--limit", help="Max. Anzahl Entwuerfe"),
) -> None:
    from .console.drafts import list_drafts

    entries = list_drafts()
    if client:
        needle = client.lower()
        entries = [e for e in entries if needle in e.get("name", "").lower()]
    entries = entries[:limit]

    if not entries:
        print(c("yellow", "  Keine Entwuerfe gefunden."))
        return

    for e in entries:
        kind_label = "Gap" if e.get("kind") == "gap" else "Feedback"
        kind_color = "red" if e.get("kind") == "gap" else "green"
        print(f"{c('dim', e.get('created_at', '?'))}  {c('accent', e.get('name', '?'))}  {c(kind_color, kind_label)}  {e.get('text', '')}")


@app.command(name="add", help="Übung (Sätze/Reps/Gewicht) zur Kraft-Session des Tages hinzufügen — merged, überschreibt nicht")
def cmd_add(
    exercise: str = typer.Argument(..., help="Übungsname (Freitext, Fuzzy-Match gegen Katalog)"),
    sets: int = typer.Option(1, "--sets", "-s", min=1, help="Anzahl Sätze (Default 1 — z.B. für HIT/ein Satz bis zum Muskelversagen)"),
    reps: str = typer.Option("", "--reps", "-r", help="Wiederholungen — eine Zahl (für alle Sätze) oder kommagetrennt pro Satz. Leer lassen wenn nicht getrackt (z.B. HIT)"),
    weight: str = typer.Option("", "--weight", "-w", help="Gewicht (kg) — eine Zahl oder kommagetrennt pro Satz. Leer lassen wenn kein Zusatzgewicht (z.B. Bodyweight)"),
    block: str = typer.Option(None, "--block", "-b", help="Trainingsblock (z.B. Push/Pull/Legs) — nur gesetzt wenn angegeben"),
    notes: str = typer.Option(None, "--notes", "-n", help="Notiz an die Übung"),
    effort: int = typer.Option(None, "--effort", "--rpe", "-e", help="RPE/Effort der Session (1-10) — strukturiertes Session-Feld, NICHT in notes packen"),
    location: str = typer.Option(None, "--location", "-l", help="Trainingsort der Session (z.B. Studio-Name) — strukturiertes Session-Feld, NICHT in notes packen"),
    duration: int = typer.Option(None, "--duration", help="Dauer der Session in Minuten — strukturiertes Session-Feld, NICHT in notes packen"),
    day: str = typer.Option(None, "--date", help="YYYY-MM-DD (Default heute)"),
    session_id: str = typer.Option(None, "--session-id", help="An eine bestehende Zusatz-Session anhängen"),
    uid_override: str = typer.Option(None, "--uid"),
    dry_run: bool = typer.Option(False, "--dry-run"),
) -> None:
    from .strength import add_exercise

    add_exercise(
        exercise, sets=sets, reps=reps, weight=weight, block=block, notes=notes,
        effort=effort, location=location, duration=duration,
        day=day, session_id=session_id, uid_override=uid_override, dry_run=dry_run,
    )


@app.command(name="wizard", help="Interaktiver Dialog: Block wählen, Übungen + Sätze eintippen, bis Abbruch")
def cmd_wizard(
    day: str = typer.Option(None, "--date", help="YYYY-MM-DD (Default heute)"),
    uid_override: str = typer.Option(None, "--uid"),
) -> None:
    from .strength import run_wizard

    run_wizard(day=day, uid_override=uid_override)


# ── Entry-Point ───────────────────────────────────────────────────────────────

def main() -> None:
    app()


if __name__ == "__main__":
    main()
