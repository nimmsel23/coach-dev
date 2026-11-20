## Wo das Repo steht
- dev und master sind deckungsgleich auf `f88361d4` (evidence.json, branches); letzte Läufe Check (Coach), Deploy Coach und Auto-Promote sind grün (Runs 44721873238, 44721872772, 44721977725).
- Aktivität: 20.11. wieder 13 Commits, davor 17.–19.11. fast Stillstand (1/0/0). Heute: Aufräumen (`27650757`), cli.py-Auslagerung (`de0ed798`), pnpm→npm (`5acb9d67`, `4bb30a19`), GitHub-Issues als Inbox-Quelle (`f88361d4`, `src/lib/db/firestore/githubInbox.js:32`).
- Keine offenen Issues oder PRs (evidence.json).
- Deploy: Push auf dev geht nur in einen 24h-Preview-Channel; Produktion nur per manuellem `workflow_dispatch` mit `production=true` (`.github/workflows/deploy-coach.yml:136-155`).

## Risiken
- Die Hälfte der Live-Verifikation steht aus: Taskwarrior-Anzeige nach API-Reload, echter `tractionDaily`-Event (Abfrage ergab 0 Events), Coach Sheet gegen Inbox-Records (`NEXT.md:4,5,14`). Code ist fertig, Wirkung für Nutzer unbelegt.
- Der KB-Ordner ist ein vendored Tree, obwohl `.gitmodules` ihn als Submodul `nimmsel23/fitness` führt (`.gitmodules`, `git ls-files -s backend/fitness/catalog/kb` → 100644-Dateien; `TODO.md:63-69`). Exercises und Inbox divergieren bidirektional. Gefahr von Datenverlust bei blindem Sync.
- Submodul `website`: lokal ungepushter SHA `71f101a` darf nicht gepinnt werden, sonst brechen CI und Dependabot (`NEXT.md:12`, `TODO.md:82`). Der Pfad `website` löst den Deploy aus (`deploy-coach.yml`, paths).
- Die Gemini-Reparaturkette ist nie an einem echten roten Lauf getestet (`NEXT.md:40,42`). Die WhatsApp-Zusammenfassung für Jakob ist laut Gemini-Review ungetestet (`NEXT.md:45`).
- Der Revert `d03ca3e5` und danach `f88361d4` am selben Tag zeigen Inbox-Code im Fluss; das ist ein Regressionsrisiko im Coach-Inbox-Pfad.

## Widersprüche Doku ↔ Code
- `README.md:35,92-105` nennt pnpm 11 und Vite 6. Tatsächlich gilt npm 12.2.2 mit `package-lock.json` (kein `pnpm-lock.yaml`; `check.yml:80-81`) und `"vite": "8.3.6"` (`package.json:89`). `AGENTS.md` und mehrere `docs/*.md` nennen ebenfalls noch pnpm.
- `NEXT.md:10` sagt „Link statt Fake-Approve“ für `github_pr`. Der Code lehnt das Löschen ab (`src/lib/db/firestore/inbox.js:376`). Der PR-Zweig wurde zurückgesetzt (`d03ca3e5`) und ist jetzt zu Issues erweitert, `NEXT.md` kennt Issues nicht.
- `NEXT.md:1` (durchgestrichener Vite-8-Punkt) steht vor der Überschrift und ist ohne Kontext.
- `docs/ROADMAP.md:1` heißt „fitness-dev Roadmap“ und beschreibt Phasen eines älteren Produkts. Mit Coach-Dev hat es kaum Bezug; kein ROADMAP.md im Repo-Root.
- `NEXT.md` und `TODO.md` führen den KB-Gitlink doppelt (`NEXT.md:16`, `TODO.md:63`).

## Empfehlung für diese Woche
1. Verifizieren: einen echten Fitness-App-Aufruf mit `tractionDaily`-Event und die Taskwarrior-Anzeige live prüfen (`NEXT.md:4-5`).
2. Klären: KB-Gitlink-Frage (Coach-only `inbox_jefferson_curl_pipeline.yml` übernehmen oder verwerfen), dann Gitlink wiederherstellen (`TODO.md:63`).
3. Aktualisieren: README/AGENTS/docs auf npm und Vite 8 umstellen, `NEXT.md` um Issues-Inbox ergänzen.
