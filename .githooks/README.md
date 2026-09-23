# Git Hooks

Versionierte Git Hooks für dieses Repo. Nach einem frischen Clone aktivieren:

```bash
git config core.hooksPath .githooks
```

## Hooks

### pre-commit
Ein Teil, non-blocking (kein Commit wird verhindert):

1. **View-Docs-Reminder** (branch-unabhängig): warnt, wenn `src/views/<View>/*.jsx`
   staged ist ohne begleitendes `ARCHITECTURE.md`/`AUDIT.md`-Update. Siehe
   `src/views/AGENTS.md`. War bis 2026-07-12 ein loser, nicht-versionierter
   Hook direkt in `.git/hooks/` — jetzt hier mitversioniert.

**SW/Manifest-Bump entfernt (2026-07-22):** Bumpte früher automatisch
`public/sw.js` + `public/manifest.json` `version`-Feld bei jedem Commit auf
`master` mit Frontend-Änderungen — erzeugte Merge-Rauschen zwischen dev/master
für reine Versionszahlen. Ersetzt durch `scripts/stamp-sw.mjs`, das die
Cache-Version per Zeitstempel **post-build** direkt in `dist-firebase/`
stempelt (analog zu fuel-dev). `public/sw.js` (`fitness-v0`-Platzhalter) und
`public/manifest.json` (`version: "0"`) bleiben dauerhaft unverändert in der
getrackten Quelle.

### post-commit
**Retired (2026-07-12), jetzt No-Op.** Deployte früher bei jedem Commit auf
`master` — das war zu früh für mehrstufige lokale Arbeit. Deploy-Trigger ist
jetzt `pre-push` (s.u.). Datei bleibt als Stub liegen statt gelöscht zu werden,
damit ein aktives `core.hooksPath` nicht versehentlich die alte
Doppel-Deploy-Logik reaktiviert.

### pre-push
Baut + deployt die Coach-App zu Firebase, wenn ein Push auf `dev` Änderungen
unter `src/` enthält.

- Trigger nur auf `dev`, prüft alle gepushten Refs von stdin
- Vergleicht `remote_sha..local_sha` (bzw. den ganzen Branch bei neuem Remote-Ref)
- Nur `src/` triggert den Auto-Deploy; Rules/Docs/Build-Hilfsänderungen werden
  committet und gepusht, ohne Firebase Hosting automatisch neu zu deployen
- Deploy-Befehl: `npm run build:firebase:coach` gefolgt von
  `firebase deploy --only hosting:coach --project fitness-aos`
- Firestore Rules werden hier nie deployed; gemeinsames Ruleset bleibt
  `~/vitalos/firestore.rules`
- Schlägt der Build/Deploy fehl, wird der Push abgebrochen — Override mit
  `git push --no-verify`
