# TWA-APK: Fitness Centre als Android-App (ohne Play Store)

Stand 2026-11-04. **Vorbereitet, noch nicht gebaut** (siehe „Offen“).

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
- **JDK 17.** Auf diesem Rechner liegt nur JDK 27 (`/usr/lib/jvm/java-27-openjdk`), das ist für Gradle/Bubblewrap zu neu.
  Installieren (braucht sudo, macht der User): `sudo pacman -S jdk17-openjdk`. Alternativ lädt Bubblewrap beim ersten Lauf
  ein passendes JDK nach.
- **Android-SDK:** `~/Android/Sdk` (build-tools 35/36, platforms android-36/37). `ANDROID_HOME` zeigt aktuell auf
  `/opt/android-sdk`, dort liegt nur `emulator`. Für Bubblewrap `androidSdkPath` auf `~/Android/Sdk` setzen.
- **Bubblewrap-Konfiguration** `~/.bubblewrap/config.json` ist leer (`{"jdkPath":"","androidSdkPath":""}`). Eintragen:
  `{"jdkPath":"/usr/lib/jvm/java-17-openjdk","androidSdkPath":"/home/alpha/Android/Sdk"}`.
- Die Seite muss live sein **und** `https://fitness-aos.web.app/.well-known/assetlinks.json` ausliefern (Deploy von `dev` →
  `master` → `vitalos`, siehe `DEPLOY.md`). Bubblewrap liest außerdem `https://fitness-aos.web.app/manifest.json` und die
  Icons (`icon-512.png`).

## Bauen
```bash
. ~/.env/fitness-twa.env
cd ~/dev/fitness-dev/twa
npx @bubblewrap/cli init --manifest=https://fitness-aos.web.app/manifest.json   # nur falls twa-manifest.json neu erzeugt werden soll
npx @bubblewrap/cli build                                                       # fragt nach dem Keystore-Passwort
```
Ergebnis in `twa/`: `app-release-signed.apk` (Sideload) und `app-release-bundle.aab` (Play Store). Beim ersten `build` erzeugt
Bubblewrap den Android-Projektordner (`app/`, `gradle/`, …), diese Ordner sind ignoriert.

## Installieren
- Per USB: `adb install twa/app-release-signed.apk` (adb ist hier nicht im Pfad: `~/Android/Sdk/platform-tools/adb`).
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
- [ ] JDK 17 installieren und `~/.bubblewrap/config.json` füllen.
- [ ] `dev` pushen und releasen, damit `assetlinks.json` live ist.
- [ ] APK bauen, auf einem Gerät installieren, Verknüpfung prüfen (keine Browser-Leiste).
- [ ] Package-ID gegen den Prod-Fork abgleichen.
- [ ] Schlüssel-Backup anlegen.
