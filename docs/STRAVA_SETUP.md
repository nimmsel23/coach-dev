# Strava-Live-Import einrichten (Radtouren-Tab)

Voraussetzung, damit der "Strava"-Button im Radtouren-Tab (`Touren →
Tour importieren → Live-Verbindung`) tatsächlich verbindet statt den
"Nicht konfiguriert"-Hinweis zu zeigen.

## 1. Strava-API-App anlegen (einmalig, im Browser)

**Wichtig seit 1. Juni 2026:** Strava hat sein Developer Program umgebaut
(zwei Tiers, "Standard" und "Extended Access"). Für den Standard Tier — das
ist unser Fall, keine große Partner-App wie Garmin/Apple — braucht der
Account, unter dem die App registriert wird, eine **bezahlte Strava-
Mitgliedschaft** (regulärer Membership-Tarif, ~11,99 $/Monat, keine
separate Dev-Gebühr). Betrifft nur den einmaligen App-Registrierungsschritt
unten — ändert nichts an der Multi-User-Fähigkeit der Implementierung
selbst (jeder spätere Nutzer verbindet sich per OAuth mit seinem eigenen,
normalen Strava-Account, unabhängig vom Tarif). Quelle:
https://www.strava.com/legal/api_policy

1. Bei Strava einloggen, dann zu https://www.strava.com/settings/api
2. Neue App anlegen:
   - **Application Name**: z.B. "fitness-dev" (beliebig, nur intern sichtbar)
   - **Category**: "Other" reicht
   - **Website**: `http://localhost` (Pflichtfeld, wird nicht geprüft)
   - **Authorization Callback Domain**: **nur der Host, ohne Port/Pfad/https**
     - Für lokale Entwicklung: `localhost`
     - Für den Prod-Server (falls dort später auch genutzt): die jeweilige
       Domain/IP, unter der `server.mjs` erreichbar ist
3. Nach dem Anlegen zeigt Strava **Client ID** und **Client Secret** an.

## 2. Credentials lokal ablegen

```bash
mkdir -p ~/.env
cat > ~/.env/strava.json <<'EOF'
{
  "client_id": "DEINE_CLIENT_ID",
  "client_secret": "DEIN_CLIENT_SECRET"
}
EOF
chmod 600 ~/.env/strava.json
```

Kein Server-Neustart-Zwang, aber `npm run dev` (bzw. der laufende
`server.mjs`-Prozess) muss die Datei nach dem Start einmal neu lesen — bei
laufendem Dev-Server also kurz neu starten.

## 3. Verbinden

1. Im Radtouren-Tab auf den **Strava**-Button unter "Live-Verbindung"
   klicken → Redirect zu Strava → dort die App autorisieren
   (Scope: `activity:read_all`, nur Lesezugriff).
2. Strava leitet zurück zu `/tours/strava/callback` → `server.mjs` tauscht
   den Code serverseitig gegen Access-/Refresh-Token, speichert sie unter
   `~/.aos/users/<uid>/fitness/integrations/strava.json` (pro Nutzer,
   `client_secret` verlässt nie den Browser).
3. Zurück im Radtouren-Tab zeigt der Strava-Button jetzt "Verbunden — Touren
   holen" — erneuter Klick importiert die letzten 30 Rad-Aktivitäten
   (Ride/GravelRide/MountainBikeRide/EBikeRide/VirtualRide, alles andere wird
   rausgefiltert).

Token-Refresh läuft automatisch im Hintergrund (`strava-integration.mjs`,
`refreshIfNeeded()`) — kein erneutes manuelles Verbinden nötig, solange der
Refresh-Token gültig bleibt.

## Prod/Firebase (Simon nutzt diesen Weg, nicht den Dev-Server)

Die **Firebase-PWA** (`fitness-aos.web.app`) hat keinen Node-Backend-
Unterbau — `@db` zeigt dort auf `db.firestore.js` (direkter Firestore-SDK-
Zugriff, kein Server dazwischen). Der obige `server.mjs`-Flow greift dort
nicht. Seit Commit `07cf5f3` gibt es dafür ein eigenes Cloud-Functions-
Pendant (`functions/strava.js` + fünf Exports in `functions/index.js`:
`stravaAuthorizeUrl`, `stravaCallback`, `stravaStatus`, `stravaActivities`,
`stravaDisconnect`) — Tokens landen dort pro Nutzer in Firestore
(`fitness/{uid}/integrations/strava`) statt in einer lokalen Datei, `state`-
Parameter (10 Min TTL, `fitness/{uid}/integrations/stravaPendingState`)
bindet den OAuth-Callback zurück an die richtige uid.

### 1. Credentials für Cloud Functions setzen (einmalig, eigener Schritt — dieselbe Strava-App wie oben, oder eine zweite mit Callback-Domain der Functions-URL)

```bash
firebase functions:config:set \
  strava.client_id="DEINE_CLIENT_ID" \
  strava.client_secret="DEIN_CLIENT_SECRET" \
  --project fitness-aos
```

**Wichtig:** Die Strava-App braucht dafür eine zweite Callback-Domain (oder
eine zweite Strava-App) mit **Authorization Callback Domain** =
`europe-west1-fitness-aos.cloudfunctions.net` (die exakte Function-URL,
siehe `REDIRECT_URI` in `functions/strava.js`) — die lokale `localhost`-App
von oben reicht dafür nicht.

### 2. Deploy (braucht explizite Freigabe, nicht automatisch ausgeführt)

```bash
cd ~/fitness-dev/functions
firebase deploy --project fitness-aos --only \
  functions:stravaAuthorizeUrl,functions:stravaCallback,functions:stravaStatus,functions:stravaActivities,functions:stravaDisconnect
```

Kein `firebase deploy --only functions` ohne Filter — das würde auch
`scheduledPushReminders`/`onCoachFeedback` neu deployen, unnötiges Risiko
für unveränderten Code.

### 3. Danach

Simon (oder jeder andere Firebase-Auth-Nutzer) sieht im Radtouren-Tab
denselben Strava-Button wie im Dev-Modus — `@tours-strava` lädt dort
automatisch `strava.firestore.js` statt `strava.js` (Vite-Alias, Build-
Modus-abhängig), kein Unterschied für den Nutzer.

**Noch offen:** Deploy wurde bisher NICHT ausgeführt (siehe Schritt 2) —
bis dahin bleibt für Prod-Nutzer der Datei-Export-Weg (GPX/TCX/FIT
hochladen) der einzige tatsächlich funktionierende Import. Zusätzlich
braucht Schritt 1 jetzt eine bezahlte Strava-Mitgliedschaft für den
App-registrierenden Account (siehe Hinweis oben) — geplant ist, dass
Simon diese App selbst anlegt und Client-ID/-Secret sicher weiterreicht,
statt dass wir einen eigenen kostenpflichtigen Account dafür anlegen.

**Update 2026-09-24:** Deploy (Schritt 2) wurde inzwischen erfolgreich
ausgeführt — alle fünf Functions (`stravaAuthorizeUrl`, `stravaCallback`,
`stravaStatus`, `stravaActivities`, `stravaDisconnect`) laufen aktiv in
`europe-west1` auf `fitness-aos` (`Deploy complete!`, Function-URL
`https://europe-west1-fitness-aos.cloudfunctions.net/stravaCallback`).
Der obige "Noch offen"-Absatz zu Schritt 2 ist damit überholt — offen
bleibt weiterhin nur Schritt 1 (bezahlte Strava-Mitgliedschaft für die
App-Registrierung, Simon soll sie selbst anlegen).


## Lokale Mehrnutzer-Routen (2026-10-13)

Der Hono-Router liegt in `server/routes/strava.mjs`, gemountet unter `/tours/strava`.
Status, Authorize, Activities und Disconnect benötigen `?uid=<uid>` oder
`X-User-UID`. Der lokale Adapter übergibt die UID des DB-Adapters; Vite leitet
an Node weiter. Tokens liegen getrennt unter
`~/.aos/users/<uid>/fitness/integrations/strava.json`.

Authorize erzeugt einen kurzlebigen zufälligen OAuth-State, serverseitig an
UID und ein HttpOnly/SameSite-Cookie gebunden. Der Callback akzeptiert nur
passende, unbenutzte States und übernimmt niemals eine Callback-Query-UID.
Nach Server-Neustart oder zehn Minuten muss die Verbindung neu gestartet
werden. Der lokale Server setzt ein vertrauenswürdiges Zugangsnetz voraus:
UID-Auswahl ersetzt keine Authentifizierung. Die Firebase-Variante verwendet
weiterhin ihre bestehenden authentifizierten Cloud Functions.

Regressionstest ohne echte Tokens/Netzwerk: `node scripts/test-strava-routes.mjs`.
