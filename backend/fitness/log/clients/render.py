"""
fitness.log.clients.render — Terminal- und Format-Ausgabe für Klienten-Logs.
"""
from __future__ import annotations

import json
from datetime import datetime
from typing import Any, Optional

from ...constants import ACTIVITY_EMOJI, ACTIVITY_LABEL, block_ansi_color
from ...paths import AOS_USERS
from ...render import c, header
from .models import ClientMeta, ClientSessionItem, ClientStats, TimelineEntry


def render_client_header(meta: ClientMeta) -> None:
    """Gibt den Klienten-Kopfbereich mit Name und UIDs aus."""
    name = meta.name
    uid_str = "  ".join(c("muted", u[:12] + "…") for u in meta.uids)
    print(f"\n{c('bold', '── ' + name + ' ' + '─' * max(0, 40 - len(name)))}")
    print(f"   {uid_str}")


def render_timeline(
    meta: ClientMeta,
    timeline: list[TimelineEntry],
    detail: bool = False,
    window_desc: str = "",
) -> None:
    """Rendert die chronologische Timeline der Trainingstage eines Klienten."""
    render_client_header(meta)

    if not timeline:
        desc = window_desc or "ausgewählten Zeitraum"
        print(f"   {c('dim', f'Keine Sessions im Fenster ({desc})')}")
        return

    for entry in timeline:
        d = entry.date
        try:
            date_s = c("dim", datetime.strptime(d, "%Y-%m-%d").strftime("%a %d.%m.%y"))
        except ValueError:
            date_s = c("dim", d)

        s = entry.session
        if s is not None:
            if s.kind == "cardio":
                acts = s.activities
                if not acts and isinstance(s.raw.get("activity"), dict):
                    acts = [s.raw["activity"]]
                act = acts[0] if acts else {}
                label = " + ".join(
                    f"{ACTIVITY_EMOJI.get(a.get('type', '?'), '🏃')} {ACTIVITY_LABEL.get(a.get('type', '?'), a.get('type', '?'))}"
                    for a in acts if a.get("type")
                ) or f"{ACTIVITY_EMOJI.get(act.get('type', '?'), '🏃')} {ACTIVITY_LABEL.get(act.get('type', '?'), act.get('type', '?'))}"
                dur_s = c("dim", f"{s.total_minutes}min") if s.total_minutes else ""
                print(f"   {date_s}   {c('orange', label)}  {dur_s}")
            else:
                bc = block_ansi_color(s.block)
                exs = s.exercises
                ex_names = ", ".join(e.get("name", "?") for e in exs[:4])
                ell = "…" if len(exs) > 4 else ""
                eff_s = c("yellow", f"RPE {s.effort}") if s.effort is not None else ""

                addon = ""
                if s.kind == "strength+addon":
                    dur = s.total_minutes
                    icons = "".join(ACTIVITY_EMOJI.get(a.get("type", "?"), "⚡") for a in s.activities)
                    addon = f"  {icons or '⚡'}{c('dim', '+' + str(dur) + 'min') if dur else ''}"

                gap_s = ""
                if entry.rest_days is not None:
                    gap = entry.rest_days
                    gap_color = "red" if gap >= 10 else ("yellow" if gap >= 7 else "dim")
                    gap_s = f"  {c(gap_color, f'({gap}d rest)')}"

                print(
                    f"   {date_s}   {c(bc, '[' + (s.block or '?') + ']')}  "
                    f"{c('dim', ex_names + ell)}  {eff_s}{addon}{gap_s}"
                )

                if detail and exs:
                    for ex in exs:
                        ex_name = ex.get("name", "Übung")
                        sets_info = _format_exercise_sets(ex)
                        ex_note = f" · {c('dim', ex['notes'])}" if ex.get("notes") else ""
                        print(f"       {c('dim', '•')} {c('white', ex_name)}: {sets_info}{ex_note}")

        for note in entry.journal_notes:
            if s is None:
                print(f"   {date_s}   {c('cyan', '📓')} {c('white', note)}")
            else:
                print(f"      {c('dim', '↳ 📓')} {c('dim', note)}")


def _format_exercise_sets(ex: dict[str, Any]) -> str:
    """Formatiert Sätze/Reps/Gewichte einer Übung übersichtlich."""
    sets = ex.get("sets") or []
    if isinstance(sets, list) and sets and isinstance(sets[0], dict):
        parts = []
        for st in sets:
            r = st.get("reps")
            w = st.get("weight")
            item = f"{r}x" if r is not None else ""
            if w:
                item += f"{w}kg"
            if item:
                parts.append(item)
        if parts:
            return f"{len(sets)} Sätze ({', '.join(parts)})"

    # Fallback bei flachen Feldern
    n_sets = ex.get("sets") or 1
    reps = ex.get("reps")
    weight = ex.get("weight")
    parts = []
    if reps:
        parts.append(f"{reps} Wdh")
    if weight:
        parts.append(f"{weight}kg")
    details = f" · {', '.join(parts)}" if parts else ""
    return f"{n_sets} Sätze{details}"


def render_clients_table(clients: list[ClientMeta]) -> None:
    """Gibt eine strukturierte Übersichtstabelle aller Klienten aus."""
    header("Klienten-Übersicht")
    print()
    hdr = f"{'Name':<20} {'Slug':<18} {'Status':<12} {'Sessions':<16} {'Letzte Session'}"
    print(f"  {c('bold', hdr)}")
    print(f"  {c('dim', '─' * 78)}")

    for meta in clients:
        # Lokale Sessions zählen
        all_dates: set[str] = set()
        for uid in meta.uids:
            sdir = AOS_USERS / uid / "fitness" / "sessions"
            if sdir.exists():
                all_dates |= {f.stem[:10] for f in sdir.glob("*.json") if len(f.stem) >= 10}

        sorted_dates = sorted(all_dates, reverse=True)
        total_s = len(sorted_dates)
        latest = sorted_dates[0] if sorted_dates else "—"

        if latest != "—":
            try:
                from datetime import date as _date
                age = (_date.today() - _date.fromisoformat(latest)).days
                age_c = "green" if age < 3 else "yellow" if age < 7 else "red"
                latest_s = f"{c(age_c, latest)} {c('dim', f'({age}d)')}"
            except Exception:
                latest_s = c("muted", latest)
        else:
            latest_s = c("dim", "—")

        raw_sync = f"{total_s} Sessions" if total_s > 0 else "keine lokalen"
        sync_colored = c("green", raw_sync) if total_s > 0 else c("yellow", raw_sync)
        sync_padded = sync_colored + " " * max(0, 16 - len(raw_sync))
        status_label = meta.status or "aktiv"

        print(
            f"  {c('white', f'{meta.name:<20}')} "
            f"{c('dim', f'{meta.slug:<18}')} "
            f"{c('muted', f'{status_label:<12}')} "
            f"{sync_padded} "
            f"{latest_s}"
        )
    print()


def render_client_stats(stats: ClientStats) -> None:
    """Rendert die aggregierten Kennzahlen eines Klienten."""
    header(f"Statistiken — {stats.client_name}")
    print()
    print(f"  {c('bold', 'Aktivität')}")
    print(
        f"  Gesamt-Sessions: {c('accent', str(stats.total_sessions))}  ·  "
        f"Frequenz: {c('white', f'{stats.sessions_per_week}/Woche')}"
    )
    print(
        f"  Kraft-Einheiten: {c('accent', str(stats.strength_sessions))}  ·  "
        f"Übungen: {c('muted', str(stats.total_exercises))}"
    )
    print(f"  Ausdauer-Tage:   {c('orange', str(stats.cardio_sessions))}")

    if stats.avg_rpe is not None:
        print(f"  Durchschnitts-RPE: {c('yellow', str(stats.avg_rpe))}")
    if stats.avg_rest_days is not None:
        print(f"  Ø Rest-Days (Block): {c('muted', f'{stats.avg_rest_days}d')}")
    if stats.first_date and stats.last_date:
        print(f"  Zeitraum: {c('dim', f'{stats.first_date} bis {stats.last_date}')}")

    if stats.block_counts:
        print(f"\n  {c('bold', 'Split-Verteilung')}")
        mx = max(stats.block_counts.values())
        for bl, cnt in sorted(stats.block_counts.items(), key=lambda x: -x[1]):
            bc = block_ansi_color(bl)
            filled = round(cnt / mx * 14)
            bar = c(bc, "━" * filled) + c("dim", "╌" * (14 - filled))
            print(f"  {c(bc, f'{bl:<12}')}  {bar}  {c('muted', str(cnt) + 'x')}")
    print()


def render_json(data: Any) -> None:
    """Gibt strukturierte JSON-Daten auf stdout aus."""
    print(json.dumps(data, default=str, indent=2, ensure_ascii=False))
