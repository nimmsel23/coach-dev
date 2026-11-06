# View Docs — Pflicht für Agenten

Dieses File ist die Quelle; in jeden View-Ordner (`Coach/`, `Dashboard/`, `Inbox/`,
`Muscles/`, `Session/`, `Settings/`, `WeeklyReview/`) symlinkt `AGENTS.md` hierher.

## Regel

Jeder View hat `ARCHITECTURE.md` (Struktur: Komponenten, Datenfluss, Kernfeatures)
und `AUDIT.md` (Zweck, Komponenten-Tabelle, Auffälligkeiten/Bugs).

**Wenn du Code in einem View-Ordner grob änderst** — neue/gelöschte/umbenannte
Datei, geänderter Datenfluss, neues Kernfeature, geänderter State-Owner —
**aktualisiere `ARCHITECTURE.md` und/oder `AUDIT.md` im selben Zug**, nicht als
Nachtrag später. Kleine Fixes (Styling, Typos, einzelne Zeilen ohne Struktur-
Änderung) brauchen keinen Doc-Update.

## Check vor dem Commit

`git diff --stat` für den View-Ordner ansehen: wenn `.jsx`/`.js`-Dateien dabei
sind aber weder `ARCHITECTURE.md` noch `AUDIT.md`, kurz prüfen ob die Änderung
strukturell war — falls ja, Doc nachziehen bevor committet wird.

Gilt für alle Agenten in diesem Repo (Claude Code, Antigravity/Gemini) — siehe
auch `~/fitness-dev/.agents/AGENTS.md` für allgemeine Repo-Regeln.
