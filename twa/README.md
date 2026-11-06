# Fitness Centre als Android-App (TWA, ohne Play Store)

Ausführliche Doku: `docs/TWA-APK.md`.

Die klassische App `https://fitness-aos.web.app` als Trusted Web Activity (Bubblewrap). Die App lädt die Live-Seite,
Inhalte aktualisieren sich also mit jedem Web-Deploy, nur die Hülle braucht eine neue APK.

## Bestandteile
- `twa-manifest.json` — Bubblewrap-Konfiguration (Package `app.vitalos.fitnesscentre`, Host `fitness-aos.web.app`).
- `public/.well-known/assetlinks.json` — Digital Asset Links mit dem SHA-256 des Signaturschlüssels. Ohne diese Datei
  (erreichbar unter `https://fitness-aos.web.app/.well-known/assetlinks.json`) zeigt die App eine Browser-Leiste.
- Signaturschlüssel: `~/.android/fitness-aos-twa.jks` (Alias `fitness-twa`), Passwort in `~/.env/fitness-twa.env`.
  **Nie ins Repo.** `twa/android.keystore` ist nur ein ignorierter Symlink darauf. Schlüssel verloren = App kann nicht
  mehr aktualisiert werden (Fingerabdruck in `assetlinks.json` würde nicht mehr passen).

## Bauen
1. Web-Deploy mit der `assetlinks.json` (`.well-known/` muss auf der Site liegen, `firebase.json` ignoriert sie nicht mehr).
2. Bauen und signieren: siehe `docs/TWA-APK.md`, Abschnitt „Bauen“ (Bubblewrap `update`, dann `./gradlew assembleRelease`, `zipalign`, `apksigner`).
   `bubblewrap build` selbst scheitert hier an der SDK-Prüfung (`cmdline-tools` fehlt).
3. Ergebnis: `twa/app-release-signed.apk`. Installieren: `adb install twa/app-release-signed.apk`
   oder die Datei aufs Handy kopieren (Installation aus unbekannten Quellen erlauben).

Version erhöhen: `appVersionCode` und `appVersion` in `twa-manifest.json` bei jeder neuen APK.
