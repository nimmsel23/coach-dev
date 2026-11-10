# Unit-Vorschläge (nicht aktiv)

Nichts davon ist installiert. Aktivieren ist eine bewusste Entscheidung (siehe unten).

## Reihenfolge der Umstellung

Zwei Prozesse dürfen nie parallel auf denselben Daten schreiben (die alte API/der alte Mirror und die neuen).

1. Alten Stand stoppen: `systemctl --user stop fitness-api.service fitness-firestore-daemon.service`
   (und optional `disable`, sonst starten sie beim nächsten Login wieder).
2. Units kopieren: `cp backend/deploy/*.service ~/.config/systemd/user/ && systemctl --user daemon-reload`
3. Erst nur beobachten: `python3 -m backend sync run --dry-run --duration 60` (aus `~/dev/coach-dev/fitness`), Logs unter
   `~/.aos/fitness/logs/fitsync.jsonl` bzw. `GET /api/sync/log`.
4. Aktivieren: `systemctl --user enable --now fitness-backend.service fitness-sync.service`
5. Prüfen: `systemctl --user status fitness-sync.service`, `curl -s :9150/api/sync/status`.

## Hinweise

- `fitness-sync.service` startet `sync run --notify` für alle Klienten (ohne Coach-UID). Ohne `--notify` nur Sync.
- `sync run` nimmt das Ein-Instanz-Lock; ein gleichzeitiges `sync pull`/`POST /api/sync/pull` wird mit 409/Exit 2 abgelehnt.
- Die API bindet auf 127.0.0.1 und hat KEINE Authentifizierung. Nicht ohne Auth über Tailscale-Funnel o.ä. veröffentlichen.
- Boot-Report: Port-/Dienständerungen auch in `~/.dotfiles/bin/boot-notify-enhanced` nachziehen (laut CLAUDE.md).
