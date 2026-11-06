"""fitness-sync — KB-Sync + Firestore-Sync, an einem Ort statt in cli.py verstreut.

  fitness-sync kb          [--dry-run]  Katalog (Exercises/Anatomy/Muscles/Yuhonas) → Firestore
  fitness-sync pull [UID]                Firestore → lokal (Sessions/Journal/Inbox/Habits + Fuel)
                                          für einen gezielten User oder den Operator-UID
  fitness-sync pull-uid  <REF>           Daten eines EINZELNEN Users ← Firestore, via die
                                          laufende Python-API; REF darf firebase_uid,
                                          client slug/id oder crm_id sein
  fitness-sync push  [UID]               Lokal → Firestore (Sessions + Fuel)
  fitness-sync watch [UID]               Fuel-Watchdog (blockierend, Ctrl+C zum Beenden)
  fitness-sync all   [--dry-run]         kb + pull + push nacheinander
  fitness-sync add-client <UID> <SLUG>   Neuen Klienten registrieren: client.json anlegen
                                          + Sessions sofort aus Firestore pullen

Vorher lag das als ein einziger, unauffindbarer "sync"-Befehl in fitness/cli.py,
der KB-Sync und Firestore-Sync über einen Subprocess-Aufruf eines separat
installierten Binaries zusammenklebte — mit falschem Kommentar, ohne Zugriff
auf pull/watch, und mit verschluckten Fehlern. Hier ruft jeder Unterbefehl die
zugrundeliegende Funktion direkt auf (kein Subprocess, keine verschluckten
Exceptions), analog zu fitness-mail/fitness-activity/fitness-tui.
"""
from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path
from typing import Optional

import typer
import yaml
from loguru import logger

app = typer.Typer(add_completion=False, no_args_is_help=True)

DEV_PORT = int(os.environ.get("FITNESS_PORT", 9100))
PYTHON_PORT = int(os.environ.get("FITNESS_PYTHON_PORT", os.environ.get("FITNESS_PORT", 9150)))


@app.command("kb")
def sync_kb(
    dry_run: bool = typer.Option(False, "--dry-run", help="Nicht wirklich schreiben"),
    force: bool = typer.Option(False, "--force", help="Ausserhalb von Prod-Kontext (FITNESS_ENV=prod) trotzdem pushen"),
) -> None:
    """Katalog (Exercises/Anatomy/Muscles/Yuhonas) → Firestore. Standardmäßig nur im Prod-Kontext (FITNESS_ENV=prod)."""
    from fitness.catalog.api.firestore_push import run_kb_sync
    run_kb_sync(dry_run=dry_run, force=force)


@app.command("pull")
def sync_pull(
    uid: Optional[str] = typer.Argument(None, help="Firestore UID (leer = alle Fitness-User, Fuel fuer Operator-UID)"),
) -> None:
    """Firestore → lokal: Sessions, Journal, Inbox, Habits + Fuel-Nutrition/Supplements."""
    from fitness.firestore.sync import pull
    from fitness.firestore.fuel import pull_fuel
    from fitness.firestore._db import UID

    r = pull(uid=uid)
    fuel_uid = uid or UID
    rf = pull_fuel(fuel_uid)
    logger.success(
        f"pull — fitness uid={uid or 'all'} sessions {r['sessions']} · journal {r['journal']} · inbox {r['inbox']} "
        f"| fuel uid={fuel_uid} nutrition {rf['nutrition']} · supplements {rf['supplements']}"
    )


@app.command("pull-uid")
def sync_pull_uid(
    uid: Optional[str] = typer.Argument(None, help="firebase_uid, client slug/id oder crm_id (auto-detect wenn leer)"),
) -> None:
    """Daten eines einzelnen Users ← Firestore, via die laufende Python-API.

    Anders als "pull" (SDK-Direktzugriff, standardmäßig alle UIDs) ruft das den
    /firestore/pull-Endpoint der Python-API auf. Der Endpoint löst REF
    universell über ~/Klienten/*/client.json auf, daher funktionieren hier
    firebase_uid, client slug/id und crm_id. Braucht einen laufenden
    Python-Server (dev meist :9150, prod typischerweise :6100).
    """
    if not uid:
        uid = os.getenv("FITNESS_UID")
    if not uid:
        base = Path.home() / ".aos" / "fitness" / "users"
        best, best_n = None, -1
        for d in base.glob("*/sessions/"):
            name = d.parent.name
            if name in ("default", "kb"):
                continue
            n = len(list(d.glob("*.json")))
            if n > best_n:
                best, best_n = name, n
        uid = best
    if not uid:
        logger.error("Keine uid — FITNESS_UID setzen oder als Argument übergeben")
        raise typer.Exit(1)

    logger.info(f"Pull ← Firestore (ref={uid})...")
    out = Path("/tmp/fitness-pull.json")
    r = subprocess.run([
        "curl", "-fsS", "--max-time", "30", "-X", "POST",
        f"http://127.0.0.1:{PYTHON_PORT}/firestore/pull",
        "-H", f"X-User-UID: {uid}", "-o", str(out),
    ])
    if r.returncode != 0:
        logger.error("Pull request fehlgeschlagen")
        raise typer.Exit(1)
    result = json.loads(out.read_text())
    if not result.get("ok"):
        logger.error(result.get("error", "unknown"))
        raise typer.Exit(1)
    resolved_uid = result.get("uid") or uid
    logger.success(
        "pulled "
        f"uid={resolved_uid} · "
        f"{result['pulled']} sessions · "
        f"{result.get('journal_pulled', 0)} journal · "
        f"{result.get('habit_journal_pulled', 0)} habit-journal · "
        f"{result.get('habit_record_pulled', 0)} habit-record · "
        f"skipped {result['skipped']} · conflicts {result['conflicts']}"
    )
    if result.get("conflict_dates"):
        logger.warning(f"Konflikte: {', '.join(result['conflict_dates'])}")


@app.command("push")
def sync_push(
    uid: Optional[str] = typer.Argument(None, help="Firestore UID (leer = alle lokalen Runtime-User)"),
    force: bool = typer.Option(False, "--force", help="Remote sessions auch dann überschreiben, wenn Firestore saved_at neuer/gleich ist"),
    dry_run: bool = typer.Option(False, "--dry-run", help="Nur zählen, nicht schreiben"),
) -> None:
    """Lokal → Firestore: Sessions + Fuel."""
    from fitness.firestore.sync import push
    from fitness.firestore.fuel import push_fuel
    from fitness.firestore._db import UID

    r = push(uid=uid, force=force, dry_run=dry_run)
    fuel_uid = uid or UID
    rf = {"written": 0, "skipped": 0}
    if not dry_run:
        rf = push_fuel(fuel_uid)
    mode = "force " if force else ""
    dry = "dry-run " if dry_run else ""
    logger.success(f"push — {dry}{mode}sessions {r['sessions']} · skipped {r['sessions_skipped']} | fuel uid={fuel_uid} {rf.get('written', 0)} writes · {rf.get('skipped', 0)} skipped")
    if rf.get("error"):
        logger.warning(f"push fuel error: {rf['error']}")


@app.command("prune-activity-sidecars")
def sync_prune_activity_sidecars(
    uid: Optional[str] = typer.Argument(None, help="Firestore UID (leer = alle lokalen Runtime-User)"),
    apply: bool = typer.Option(False, "--apply", help="Remote date__id Activity-Sidecars wirklich löschen. Default ist dry-run."),
) -> None:
    """Löscht remote reine Cardio-Sidecars, wenn ein kanonisches Tagesdokument existiert."""
    from fitness.firestore.sync import prune_activity_sidecars

    result = prune_activity_sidecars(uid=uid, dry_run=not apply)
    print(yaml.safe_dump(result, sort_keys=False, allow_unicode=True).rstrip())


@app.command("watch")
def sync_watch(uid: Optional[str] = typer.Argument(None, help="Firestore UID (Default: firestore._db.UID)")) -> None:
    """Fuel-Watchdog: lokale Nutrition/Supplements-Änderungen → Firestore (blockierend)."""
    from fitness.firestore.sync_cli import _watch_fuel
    _watch_fuel(uid)


@app.command("all")
def sync_all(
    uid: Optional[str] = typer.Argument(None, help="Firestore UID fuer Runtime/Fuel (leer = Defaultverhalten der Teilkommandos)"),
    dry_run: bool = typer.Option(False, "--dry-run", help="KB-Sync nicht wirklich schreiben"),
) -> None:
    """KB-Sync + Firestore Pull + Push nacheinander."""
    sync_kb(dry_run=dry_run)
    sync_pull(uid)
    sync_push(uid)


@app.command("add-client")
def sync_add_client(
    uid: str = typer.Argument(..., help="Firebase UID des neuen Klienten"),
    slug: str = typer.Argument(..., help="Slug für ~/Klienten/<slug>/ (z.B. 'max-mustermann')"),
    name: Optional[str] = typer.Option(None, "--name", "-n", help="Anzeigename (Default: aus Slug ableiten)"),
    pull: bool = typer.Option(False, "--pull/--no-pull", help="Sessions aus Firestore pullen (Default: nein — erst registrieren, dann manuell entscheiden)"),
) -> None:
    """Neuen Klienten registrieren: ~/Klienten/<slug>/client.json anlegen + Firestore-Pull.

    Beispiel:
      fitness-sync add-client AbC123XyZ new-client-name --name "Max Mustermann"

    Nach diesem Befehl:
      - ~/Klienten/<slug>/client.json existiert mit firebase_uid gesetzt
      - ~/.aos/users/<uid>/fitness/sessions/ ist befüllt (wenn --pull aktiv)
      - Die TUI zeigt den Klienten unter "Clients" und im User-Switch-Modal
    """
    import re
    from datetime import datetime, timezone

    klienten_dir = Path.home() / "Klienten"
    client_dir   = klienten_dir / slug

    # ── Slug validieren ───────────────────────────────────────────────────────
    if not re.match(r'^[a-z0-9][a-z0-9-]*$', slug):
        logger.error(f"Ungültiger Slug '{slug}' — nur Kleinbuchstaben, Ziffern und Bindestriche")
        raise typer.Exit(1)

    # ── Name ableiten falls nicht angegeben ───────────────────────────────────
    display_name = name or " ".join(p.capitalize() for p in slug.replace("-", " ").split())

    # ── Klienten-Dir anlegen ──────────────────────────────────────────────────
    client_dir.mkdir(parents=True, exist_ok=True)
    cfg_path = client_dir / "client.json"

    if cfg_path.exists():
        existing = json.loads(cfg_path.read_text())
        existing_uids = list(existing.get("firebase_uids") or [])
        primary = existing.get("firebase_uid")
        if primary and primary not in existing_uids:
            existing_uids.insert(0, primary)
        if uid in existing_uids:
            logger.warning(f"UID {uid} ist bereits in {cfg_path} eingetragen")
        else:
            existing_uids.append(uid)
            existing["firebase_uids"] = existing_uids
            if not existing.get("firebase_uid"):
                existing["firebase_uid"] = uid
            existing["updated_at"] = datetime.now(timezone.utc).isoformat()
            cfg_path.write_text(json.dumps(existing, indent=2, ensure_ascii=False))
            logger.success(f"UID {uid} zu {cfg_path} hinzugefügt")
    else:
        now = datetime.now(timezone.utc).isoformat()
        client_data = {
            "id":            slug,
            "name":          display_name,
            "status":        "aktiv",
            "firebase_uid":  uid,
            "firebase_uids": [uid],
            "created_at":    now,
            "updated_at":    now,
        }
        cfg_path.write_text(json.dumps(client_data, indent=2, ensure_ascii=False))
        logger.success(f"Klient angelegt: {cfg_path}")

    # ── Lokales Sessions-Verzeichnis vorbereiten ──────────────────────────────
    # ~/.aos/fitness/users/<uid>/ ist die physische Quelle (Node-API +
    # Python-Watcher schreiben dorthin) — ~/.aos/users/<uid>/fitness muss ein
    # Symlink darauf sein, sonst driften Node- und Python-Reads auseinander
    # (siehe fitness/catalog/api/watcher.py:25).
    from fitness.catalog.core.paths import runtime_root

    real_dir = runtime_root() / "users" / uid
    (real_dir / "sessions").mkdir(parents=True, exist_ok=True)

    link_path = Path.home() / ".aos" / "users" / uid / "fitness"
    link_path.parent.mkdir(parents=True, exist_ok=True)
    if link_path.is_symlink():
        if link_path.resolve() != real_dir.resolve():
            logger.warning(f"{link_path} zeigt auf falsches Ziel — bitte manuell prüfen")
    elif link_path.exists():
        logger.warning(f"{link_path} existiert bereits als echtes Verzeichnis (kein Symlink) — bitte manuell mergen")
    else:
        link_path.symlink_to(real_dir, target_is_directory=True)
        logger.info(f"Symlink angelegt: {link_path} -> {real_dir}")

    sess_dir = real_dir / "sessions"
    logger.info(f"Sessions-Dir: {sess_dir}")

    # ── Firestore Pull ────────────────────────────────────────────────────────
    if pull:
        logger.info(f"Starte Firestore-Pull für uid={uid} via Node-API (:{ DEV_PORT})...")
        out = Path("/tmp/fitness-add-client-pull.json")
        r = subprocess.run([
            "curl", "-fsS", "--max-time", "60", "-X", "POST",
            f"http://127.0.0.1:{DEV_PORT}/firestore/pull",
            "-H", f"X-User-UID: {uid}",
            "-o", str(out),
        ])
        if r.returncode != 0:
            logger.warning(
                "Node-API nicht erreichbar — Sessions wurden NICHT gepullt.\n"
                f"  Manuell nachholen: fitness-sync pull-uid {uid}"
            )
        else:
            try:
                result = json.loads(out.read_text())
                if result.get("ok"):
                    logger.success(
                        f"Pull fertig — {result['pulled']} gezogen · "
                        f"{result['skipped']} übersprungen · "
                        f"{result['conflicts']} Konflikte"
                    )
                    if result.get("conflict_dates"):
                        logger.warning(f"Konflikte: {', '.join(result['conflict_dates'])}")
                else:
                    logger.warning(f"Pull-Fehler: {result.get('error')}")
            except Exception as e:
                logger.warning(f"Pull-Antwort konnte nicht gelesen werden: {e}")
    else:
        logger.info(f"Pull übersprungen. Nachholen mit: fitness-sync pull-uid {uid}")

    logger.success(
        f"\n  Klient '{display_name}' ({uid[:12]}…) ist jetzt registriert.\n"
        "  Die TUI zeigt ihn unter 'Clients' und im User-Switch-Modal (u)."
    )


@app.command("list-users")
def sync_list_users(
    unregistered_only: bool = typer.Option(False, "--new", "-n", help="Nur UIDs anzeigen die noch NICHT in ~/Klienten sind"),
) -> None:
    """Alle Firebase-Auth-User anzeigen (UID, Email, Name, letzter Login).

    Markiert mit [✓] wenn die UID bereits in ~/Klienten/*/client.json registriert ist,
    und mit [NEU] wenn noch keine lokale Registrierung existiert.

    Neue UIDs direkt übernehmen:
      fitness-sync add-client <UID> <slug> --name "Vorname Name"
    """
    from rich.console import Console
    from rich.table import Table
    from rich import box

    console = Console()

    # ── Firebase Auth initialisieren (nutzt selbes Cred wie firestore._db) ───
    try:
        import firebase_admin
        from firebase_admin import auth, credentials
        cred_path = Path.home() / ".env" / "firebase-fitness.json"
        if not cred_path.exists():
            logger.error(f"Service-Account fehlt: {cred_path}")
            raise typer.Exit(1)
        if not firebase_admin._apps:
            firebase_admin.initialize_app(credentials.Certificate(str(cred_path)))
    except ImportError:
        logger.error("firebase-admin nicht installiert")
        raise typer.Exit(1)

    # ── Bekannte UIDs aus ~/Klienten laden ───────────────────────────────────
    klienten_dir = Path.home() / "Klienten"
    known: dict[str, str] = {}  # uid → klienten-slug
    if klienten_dir.exists():
        for slug_dir in klienten_dir.iterdir():
            cfg = slug_dir / "client.json"
            if not cfg.exists():
                continue
            try:
                data = json.loads(cfg.read_text())
                uids = list(data.get("firebase_uids") or [])
                primary = data.get("firebase_uid")
                if primary and primary not in uids:
                    uids.insert(0, primary)
                for uid in uids:
                    if uid:
                        known[uid] = slug_dir.name
            except Exception:
                continue

    # ── Auth-User abrufen ────────────────────────────────────────────────────
    table = Table(box=box.SIMPLE, show_header=True, header_style="bold cyan")
    table.add_column("", width=5)
    table.add_column("UID", style="dim", no_wrap=True)
    table.add_column("Email")
    table.add_column("Name")
    table.add_column("Letzter Login", style="dim")
    table.add_column("Slug / Hinweis", style="dim")

    count = 0
    page = auth.list_users()
    while page:
        for u in page.users:
            is_known = u.uid in known
            if unregistered_only and is_known:
                continue

            status     = "[green]✓[/]" if is_known else "[yellow]NEU[/]"
            slug_hint  = known[u.uid] if is_known else f"fitness-sync add-client {u.uid} <slug>"
            last_login = ""
            if u.user_metadata and u.user_metadata.last_sign_in_timestamp:
                from datetime import datetime, timezone
                ts = u.user_metadata.last_sign_in_timestamp / 1000
                last_login = datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%d %H:%M")

            table.add_row(
                status,
                u.uid,
                u.email or "—",
                u.display_name or "—",
                last_login,
                slug_hint,
            )
            count += 1
        page = page.get_next_page()

    console.print(table)
    console.print(f"[dim]{count} User total · {len(known)} registriert · {count - len(known)} neu[/]")


def main() -> None:
    app()


if __name__ == "__main__":
    main()
