"""
fitness.log.sessions — Persönliche Session-Befehle (ls, show, week, history, stats).
"""
from __future__ import annotations

import json
from datetime import date, datetime, timedelta
from typing import Optional

import typer

from ..constants import ACTIVITY_EMOJI, ACTIVITY_LABEL, block_ansi_color
from ..data import (
    activity_minutes,
    classify,
    load_training_day_for_date,
    load_training_days,
    performed_exercises,
    session_activities,
    sqlite_exercise_history,
)
from ..muscles import muscle_group_label, muscle_to_group
from ..paths import sessions_dir, sqlite_db
from ..render import c, gum_table, header, one_line, render_detail


# ── ls ────────────────────────────────────────────────────────────────────────

def cmd_ls(
    days: int = typer.Option(14, "--days", "-d", help="Anzahl Tage"),
    all_: bool = typer.Option(False, "--all", "-a", help="Alle gespeicherten Sessions"),
    block: Optional[str] = typer.Option(None, "--block", "-b", help="Nur Sessions dieses Blocks"),
    type_: Optional[str] = typer.Option(None, "--type", "-t", help="Filter: strength oder cardio"),
    json_output: bool = typer.Option(False, "--json", help="Ausgabe als JSON"),
) -> None:
    """Sessions der letzten N Tage auflisten."""
    n = 9999 if all_ else days
    sessions = load_training_days(n)
    if not sessions:
        if json_output:
            print("[]")
            return
        print(c("muted", "  Keine Sessions gefunden."))
        raise typer.Exit()

    # Filter anwenden
    filtered = []
    for s in sessions:
        kind = classify(s)
        bl = (s.get("block") or "").strip().lower()
        if type_ and type_.lower() == "strength" and kind == "cardio":
            continue
        if type_ and type_.lower() == "cardio" and kind != "cardio":
            continue
        if block and bl != block.strip().lower():
            continue
        filtered.append(s)

    if json_output:
        print(json.dumps(filtered, default=str, indent=2, ensure_ascii=False))
        return

    sdir = sessions_dir()
    header(f"Trainingstage — {'alle' if all_ else f'letzte {n} Tage'}  ({len(filtered)} Tage)")
    print(c("dim", f"  Quelle: {sdir}\n"))
    for s in filtered:
        print(one_line(s))
    print()


# ── show ──────────────────────────────────────────────────────────────────────

def cmd_show(
    date_arg: Optional[str] = typer.Argument(
        None, help="YYYY-MM-DD | heute | gestern"
    ),
    json_output: bool = typer.Option(False, "--json", help="Ausgabe als JSON"),
) -> None:
    """Detail-Ansicht einer Session."""
    today_s = date.today().isoformat()
    yest_s = (date.today() - timedelta(days=1)).isoformat()

    if not date_arg or date_arg in ("heute", "today"):
        target = today_s
    elif date_arg in ("gestern", "yesterday"):
        target = yest_s
    else:
        target = date_arg

    sessions = load_training_day_for_date(target)
    if not sessions:
        if json_output:
            print("null")
            raise typer.Exit(1)
        print(c("red", f"  Keine Session für {target} gefunden."))
        raise typer.Exit(1)

    if json_output:
        print(json.dumps(sessions, default=str, indent=2, ensure_ascii=False))
        return

    if len(sessions) > 1:
        print(c("accent", f"  {len(sessions)} Trainingstage am {target}:\n"))
    for s in sessions:
        render_detail(s)


# ── week ──────────────────────────────────────────────────────────────────────

def cmd_week(
    offset: int = typer.Option(0, "--offset", help="Wochen in die Vergangenheit versetzen (0 = aktuelle Woche)"),
    json_output: bool = typer.Option(False, "--json", help="Ausgabe als JSON"),
) -> None:
    """Wochenübersicht der letzten 7 Tage."""
    days_to_load = 7 * (offset + 1)
    all_sessions = load_training_days(days_to_load)
    by_date: dict[str, list[dict]] = {}
    for s in all_sessions:
        by_date.setdefault(s["date"], []).append(s)

    today = date.today() - timedelta(days=7 * offset)
    start_day = today - timedelta(days=6)

    if json_output:
        week_payload = []
        for i in range(6, -1, -1):
            d = (today - timedelta(days=i)).isoformat()
            week_payload.append({"date": d, "sessions": by_date.get(d, [])})
        print(json.dumps(week_payload, default=str, indent=2, ensure_ascii=False))
        return

    offset_desc = f" (vor {offset} Wochen)" if offset > 0 else ""
    header(f"Woche — {start_day.strftime('%d.%m')} bis {today.strftime('%d.%m')}{offset_desc}")
    strength_count = cardio_count = total_ex = cardio_min = 0

    for i in range(6, -1, -1):
        d = (today - timedelta(days=i)).isoformat()
        weekday = datetime.strptime(d, "%Y-%m-%d").strftime("%a %d.%m")
        day_s = by_date.get(d, [])

        if not day_s:
            print(f"  {c('muted', weekday)}  {c('dim', '·  Ruhetag')}")
            continue

        parts = []
        for s in day_s:
            kind = classify(s)
            acts = session_activities(s)
            act = acts[0] if acts else (s.get("activity") or {})
            exs = performed_exercises(s)
            block = s.get("block", "")

            if kind == "cardio":
                atype = act.get("type", "?")
                emoji = ACTIVITY_EMOJI.get(atype, "🏃")
                label = ACTIVITY_LABEL.get(atype, atype)
                adur = activity_minutes(s)
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
                exnames = ", ".join(e.get("name", "?") for e in exs[:3])
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

def cmd_history(
    exercise: str = typer.Argument(..., help="Name oder ID (Substring-Suche)"),
    limit: int = typer.Option(10, "--limit", "-n", help="Max. Einträge"),
    json_output: bool = typer.Option(False, "--json", help="Ausgabe als JSON"),
) -> None:
    """Übungs-Verlauf aus SQLite."""
    if not sqlite_db().exists():
        print(c("red", "  training_history.sqlite nicht gefunden."))
        raise typer.Exit(1)

    rows = sqlite_exercise_history(exercise, limit)
    if not rows:
        if json_output:
            print("[]")
            return
        print(c("muted", f"  Keine Daten für '{exercise}'."))
        raise typer.Exit()

    if json_output:
        print(json.dumps(rows, default=str, indent=2, ensure_ascii=False))
        return

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

def cmd_stats(
    days: int = typer.Option(28, "--days", "-d", help="Zeitraum in Tagen"),
    all_: bool = typer.Option(False, "--all", "-a", help="Gesamter Verlauf"),
    json_output: bool = typer.Option(False, "--json", help="Ausgabe als JSON"),
) -> None:
    """Aggregate-Statistiken (Split, Cardio, Muskel-Coverage)."""
    n = 9999 if all_ else days
    sessions = load_training_days(n)
    if not sessions:
        if json_output:
            print("{}")
            return
        print(c("muted", "  Keine Sessions."))
        raise typer.Exit()

    strength = [s for s in sessions if classify(s) != "cardio"]
    cardio = [s for s in sessions if classify(s) == "cardio"]
    total_ex = sum(len(performed_exercises(s)) for s in strength)
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

    if json_output:
        payload = {
            "period_days": n,
            "total_days": len(sessions),
            "strength_count": len(strength),
            "total_exercises": total_ex,
            "cardio_count": len(cardio),
            "cardio_minutes": cardio_min,
            "block_distribution": block_dist,
            "cardio_distribution": cardio_dist,
            "muscle_frequency": muscle_freq,
        }
        print(json.dumps(payload, default=str, indent=2, ensure_ascii=False))
        return

    desc = "gesamt" if all_ else f"letzte {days} Tage"
    header(f"Stats — {desc}  ({len(sessions)} Trainingstage)")

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
            bc = block_ansi_color(bl)
            filled = round(cnt / mx * 12)
            bar = c(bc, "━" * filled) + c("dim", "╌" * (12 - filled))
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
        mx = max(muscle_freq.values())
        for m, cnt in sorted(muscle_freq.items(), key=lambda x: -x[1])[:8]:
            label = muscle_group_label(m)
            pct = round(cnt / total * 100)
            filled = round(cnt / mx * 14)
            bar = c("accent", "━" * filled) + c("dim", "╌" * (14 - filled))
            print(f"  {c('white', f'{label:<14}')}  {bar}  {c('muted', str(pct) + '%')}")
    print()
