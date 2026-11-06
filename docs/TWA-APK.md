# TWA-APK: Fitness Centre als Android-App (ohne Play Store)

Stand 2026-11-04. **Gebaut und signiert** (`twa/app-release-signed.apk`, ~1 MB, Package `app.vitalos.fitnesscentre`, Version 1.0.0). Auf einem Gerät noch nicht installiert und geprüft (siehe „Offen“).

## Zweck
Die klassische App `https://fitness-aos.web.app` (Fitness Centre, Build `build:firebase`, Hosting-Target `client`) soll sich als
APK auf Android installieren lassen, ohne Play Store. Gewählt ist eine **Trusted Web Activity (TWA)** über Bubblewrap:
die App ist ein dünner Android-Rahmen, der die Live-Seite im Vollbild lädt.

- Inhalte aktualisieren sich mit jedem Web-Deploy, eine neue APK braucht nur die Hülle (Name, Icon, Package, Version).
- Es sind keine Web-Assets in der APK (anders als bei Capacitor). Offline-Verhalten kommt vom Service Worker der Seite.
- Die Mini-Apps (`vos-training`, `vos-atlas`, … aus `scripts/miniapps.json`) sind **nicht** Teil dieser APK. Jede wäre eine
  eigene TWA mit eigener Package-ID und eigener `assetlinks.json` auf ihrer Site.
- Die Premium-/Store-Schiene (`~/vitalos-prod`, eigenes Firebase-Projekt) ist davon getrennt und wurde nicht berührt.

## Dateien

| Datei | Inhalt |
|---|---|
| `twa/twa-manifest.json` | Bubblewrap-Konfiguration: Package `app.vitalos.fitnesscentre`, Host `fitness-aos.web.app`, Farben, Version, Signatur |
| `public/.well-known/assetlinks.json` | Digital Asset Links, verknüpft Seite und APK über den SHA-256 des Signaturschlüssels |
| `firebase.json` (Target `client`) | `ignore` enthält `**/.*` nicht mehr, sonst würde `.well-known/` beim Deploy weggelassen |
| `twa/android.keystore` | **ignorierter Symlink** auf den Schlüssel (siehe unten) |
| `.gitignore` | ignoriert `twa/*.apk`, `*.aab`, den Keystore-Symlink und die von Bubblewrap erzeugten Android-Projektordner |
| `twa/README.md` | Kurzfassung dieser Anleitung |

Die Package-ID `app.vitalos.fitnesscentre` ist eine eigene Wahl. Der Prod-Fork wurde nicht gelesen, eine Kollision ist daher nicht
ausgeschlossen. Ändern geht problemlos, solange keine APK verteilt ist (dann auch `package_name` in `assetlinks.json` anpassen).

## Signaturschlüssel
- Keystore: `~/.android/fitness-aos-twa.jks`, Alias `fitness-twa`, RSA 2048, 10000 Tage gültig, Modus 600.
- Passwort: `~/.env/fitness-twa.env` (`FITNESS_TWA_KEYSTORE`, `FITNESS_TWA_ALIAS`, `FITNESS_TWA_PASSWORD`), Modus 600.
- SHA-256-Fingerabdruck (steht in `assetlinks.json`):
  `8B:6F:4E:86:5C:6A:A2:B4:48:19:19:FC:97:6B:97:84:53:B9:CF:05:7D:9A:98:71:31:AB:A9:1E:8D:06:58:0D`
- Fingerabdruck erneut lesen: `keytool -list -v -keystore ~/.android/fitness-aos-twa.jks -alias fitness-twa | grep SHA256`
- **Nie ins Repo.** Den Schlüssel zusätzlich sichern (z. B. verschlüsselte Kopie). Geht er verloren, passt der Fingerabdruck
  nicht mehr zu einer neuen APK: bestehende Installationen lassen sich dann nicht mehr aktualisieren, es hilft nur eine
  neue Package-ID oder eine Deinstallation.

## Voraussetzungen zum Bauen
- **JDK 17** (`/usr/lib/jvm/java-17-openjdk`, installiert 2026-11-04). JDK 27 ist für Gradle zu neu.
- **Android-SDK** unter `~/Android/Sdk` (build-tools 35/36, platforms android-36/37). `ANDROID_HOME` der Shell zeigt auf `/opt/android-sdk`
  (dort nur `emulator`), beim Bauen deshalb `ANDROID_HOME=/home/alpha/Android/Sdk` setzen.
- `~/.bubblewrap/config.json`: `{"jdkPath":"/usr/lib/jvm/java-17-openjdk","androidSdkPath":"/home/alpha/Android/Sdk"}`.
- `https://fitness-aos.web.app/.well-known/assetlinks.json` ist live (geprüft: 200, `application/json`, Package und SHA-256 stimmen mit der APK überein).
- `minSdkVersion` ist **24** (nicht 21): die Bibliothek `androidbrowserhelper` 2.7.4 verlangt mindestens 24, sonst scheitert der Manifest-Merge.

## Bauen
`bubblewrap build` bricht hier mit „The provided androidSdk isn't correct“ ab: es erwartet ein SDK mit `cmdline-tools`, das vorhandene SDK hat
keines. Der funktionierende Weg ist deshalb: Projekt von Bubblewrap erzeugen lassen und mit Gradle und den SDK-Werkzeugen selbst bauen und signieren.
```bash
set -a; . ~/.env/fitness-twa.env; set +a            # exportiert FITNESS_TWA_* (nötig für apksigner env:)
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk ANDROID_HOME=/home/alpha/Android/Sdk
cd ~/dev/fitness-dev/twa
ln -sf ~/.android/fitness-aos-twa.jks android.keystore                  # ignorierter Symlink, nur einmal
npx @bubblewrap/cli update --skipVersionUpgrade                         # erzeugt/aktualisiert das Android-Projekt aus twa-manifest.json
./gradlew --no-daemon assembleRelease                                   # -> app/build/outputs/apk/release/app-release-unsigned.apk
BT=$ANDROID_HOME/build-tools/36.0.0
$BT/zipalign -f -p 4 app/build/outputs/apk/release/app-release-unsigned.apk app-release-aligned.apk
$BT/apksigner sign --ks "$FITNESS_TWA_KEYSTORE" --ks-key-alias "$FITNESS_TWA_ALIAS" \
  --ks-pass env:FITNESS_TWA_PASSWORD --key-pass env:FITNESS_TWA_PASSWORD --out app-release-signed.apk app-release-aligned.apk
rm app-release-aligned.apk
$BT/apksigner verify --print-certs app-release-signed.apk               # SHA-256 muss dem Wert in assetlinks.json entsprechen
```
Der erste Gradle-Lauf dauert einige Minuten (lädt Gradle 8.11.1 und die Abhängigkeiten), spätere etwa eine. Gradle erzeugt nur eine APK.
Für einen Play-Store-Bundle (`.aab`) wäre `./gradlew bundleRelease` und `jarsigner` nötig; das wurde nicht gebaut.
`twa/build.gradle`, `settings.gradle`, `gradle.properties`, `manifest-checksum.txt`, `store_icon.png`, `app/`, `gradle/` und `gradlew*` erzeugt Bubblewrap und sind ignoriert.

## Installieren
- Per USB: `~/Android/Sdk/platform-tools/adb install twa/app-release-signed.apk` (adb ist hier nicht im Pfad; Entwickleroptionen und USB-Debugging am Gerät aktivieren).
- Oder die APK aufs Handy kopieren und die Installation aus unbekannten Quellen erlauben. Play Protect kann bei unbekannten
  Apps warnen.
- Für den inneren Kreis genügt alternativ die PWA-Installation (Chrome → „Zur Startseite hinzufügen“), ganz ohne APK.

## Updates und Versionen
- Web-Änderungen kommen ohne neue APK an (Web-Deploy genügt).
- Neue APK nötig bei Änderungen an Name, Icon, Farben, Package oder Berechtigungen. Dann in `twa-manifest.json`
  `appVersionCode` (ganzzahlig, muss steigen) und `appVersion` erhöhen und neu bauen.
- Updates auf dem Handy laufen von Hand (neue APK drüberinstallieren), solange die APK nicht aus einem Store kommt. Dieselbe
  Signatur ist Pflicht.

## Prüfen, ob die Verknüpfung stimmt
- `https://fitness-aos.web.app/.well-known/assetlinks.json` muss mit `Content-Type: application/json` und dem richtigen
  Fingerabdruck antworten.
- Google-Prüfer: `https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://fitness-aos.web.app&relation=delegate_permission/common.handle_all_urls`
- Auf dem Gerät: Zeigt die App oben eine Browser-Leiste, ist die Verknüpfung nicht verifiziert (Fingerabdruck, Package oder
  Datei stimmen nicht, oder Chrome hat sie noch gecached: App deinstallieren, neu installieren).

## Fehlerbild → Ursache
| Fehlerbild | Ursache |
|---|---|
| Browser-Leiste in der App | `assetlinks.json` nicht erreichbar, falscher Fingerabdruck oder falsche `package_name` |
| `assetlinks.json` liefert 404 | Firebase-`ignore` blendet Dotdateien aus (Target `client`), Datei fehlt in `dist-firebase/.well-known/` |
| Build bricht mit Gradle-/Java-Fehler ab | JDK 27 statt 17 |
| Manifest-Merger: `minSdkVersion 21 cannot be smaller than 24` | `minSdkVersion` in `twa-manifest.json` auf 24 setzen und `bubblewrap update` erneut |
| `bubblewrap build`: „androidSdk isn't correct“ | SDK ohne `cmdline-tools`; Weg über Gradle und `apksigner` (siehe Bauen) |
| `apksigner`: „environment variable null not specified“ | Passwort-Variablen nicht exportiert (`set -a` beim Einlesen) |
| Installation scheitert („App nicht installiert“) | andere Signatur als eine schon installierte Version, `appVersionCode` nicht erhöht |
| Login (Google) schlägt fehl | Anmeldedomain nicht in Firebase Auth „Autorisierte Domains“; für `fitness-aos.web.app` ist sie vorhanden |

## Grenzen
- Die TWA teilt Cache, IndexedDB und Login mit dem Chrome-Profil der Origin `fitness-aos.web.app`, nicht mit den Mini-Apps
  (eigene Origins).
- Ein Kaufpreis oder Bezahlmodell wird durch die TWA nicht erzwungen: die Seite bleibt öffentlich im Browser erreichbar.
  Dafür braucht es Login plus Entitlement oder Play Billing (Digital Goods API).
- Für den Play Store: eine Vielzahl nahezu identischer TWAs kann gegen die Spam-/Minimum-Functionality-Richtlinie
  verstoßen. Der Store-Weg gehört zur Premium-Schiene (`~/vitalos-prod`).

## Offen
- [x] JDK 17 installiert und `~/.bubblewrap/config.json` gefüllt.
- [x] `assetlinks.json` live, APK gebaut und signiert, Fingerabdruck stimmt überein.
- [ ] Auf einem Gerät installieren und prüfen: Vollbild ohne Browser-Leiste, Login, Push-Benachrichtigungen. Aktuell ist kein Gerät per adb verbunden.
- [ ] Package-ID gegen den Prod-Fork abgleichen.
- [ ] Schlüssel-Backup anlegen (`~/.android/fitness-aos-twa.jks` und `~/.env/fitness-twa.env`).
- [ ] Bei Bedarf `.aab` für den Play Store bauen.
