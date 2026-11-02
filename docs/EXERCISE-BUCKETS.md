# Exercise Buckets: Katalog-Deduplikation und Varianten

## Ziel

Der Expert Catalog soll eine breite Übungswissensdatenbank aus wger, yuhonas
und kuratierten Einträgen bereitstellen. Ähnliche Einträge sollen fachlich
zusammengehören und gemeinsam auffindbar sein, ohne unterschiedliche Übungen
zu einer Übung umzudeuten oder Quellen und Anleitungen zu verlieren.

## Datenmodell-Idee

- **Exercise** bleibt eine konkrete Variante mit stabiler eigener ID, Namen,
  Equipment, Ausführung, Quellen-IDs und Muskelrollen.
- **Bucket** gruppiert fachlich verwandte Varianten, etwa Rudern oder
  Seitheben. Eine konkrete Übung erhält optional `bucket_id`; Varianten bleiben
  einzeln auswählbar und protokollierbar.
- **Modifier** beschreiben Unterschiede wie Körperposition, Griff,
  einarmig/beidarmig und Equipment. Bis fachlich geprüft, gruppiert der Bucket
  Varianten ohne ihre Namen oder IDs zu normalisieren.
- **Anatomie-Brücke** verbindet konkrete Varianten (und bei Bedarf den Bucket)
  mit standardisierten Muskel-IDs und Regionen. Primär-, Sekundär- und
  Stabilisationsrollen bleiben getrennt.
- **Quellenbelege** bleiben an der konkreten Übung erhalten. Ein Bucket ersetzt
  keine wger-/yuhonas-ID und verschmilzt keine Anleitungen.

## Kritische Abgrenzungen

- „Dips“ bzw. Barren-Dips, brustbetonte Dips, trizepsbetonte Dips und
  Bank-Dips/Bench-Dips sind verwandt, aber nicht automatisch dieselbe Übung.
  Der Fokus kann als Coaching-/Ausführungsvariante erfasst werden; Bank-Dips
  bleiben eine eigene konkrete Variante.
- „Seitheben am Kabelzug“ und „Seitheben am Seilzug“ können über einen
  geprüften Alias oder Bucket gemeinsam auffindbar werden. Maschinelles
  Seitheben gehört in den verwandten Seitheben-Bucket, bleibt aber eine eigene
  Variante.
- Akzente oder Nicht-ASCII-Zeichen sind kein verlässlicher Sprachdetektor.
  Fremdsprachige Quellen nur anhand expliziter Sprachmetadaten oder geprüfter
  Zuordnung ausblenden; Originaleinträge und IDs dabei erhalten.
- Namensähnlichkeit allein darf weder IDs mergen noch Varianten entfernen.
  Unsichere Kandidaten werden als Vorschläge mit Begründung geführt und
  fachlich bestätigt.

## Umsetzung in kleinen Schritten

1. Vorhandene wger- und yuhonas-Daten unverändert als Quellenbestand behalten;
   für diese Modellidee ist kein Neuimport erforderlich.
2. Eine kleine, geprüfte Kandidatenliste für offensichtliche Synonyme und
   mögliche Dubletten erstellen. Namen, Equipment, Anleitung, Bewegung und
   Muskelzuordnung vergleichen; echte Duplikate von Varianten trennen.
3. Schema und Ablageort für Buckets festlegen. Für den ersten Durchgang reichen
   wenige manuell geprüfte Buckets, etwa Rudern, Seitheben und Dips.
4. Bucket-Zuordnung als additive Metadaten ergänzen. Die Suche berücksichtigt
   Buckets und geprüfte Aliase, gibt aber konkrete Varianten zurück.
5. Sprachfilter getrennt umsetzen, sobald Quellen verlässliche Sprachdaten
   bereitstellen. Unbekannte Sprache bleibt sichtbar und wird nicht geraten.
6. Muskel-/Regionszuordnungen vervollständigen und Fokusunterschiede bei Dips
   oder anderen Übungen explizit modellieren.

## Erste Bucket-Klassen

- Rudern (horizontales Ziehen): sitzend, vorgebeugt, Maschine, Kabel, einarmig
- Vertikales Ziehen: Klimmzug, Latzug und geprüfte Varianten
- Drücken horizontal: Bankdrücken, Schrägbank, Maschine, Liegestütz
- Drücken vertikal: Schulterdrücken und Varianten
- Dips: Barren-Dips mit Fokusvarianten; Bank-Dips als eigene Variante
- Seitheben: Kurzhantel, Kabel/Seilzug, Maschine, einarmig
- Kniebeuge/Kniestreckung: Kniebeugen und Hack Squat getrennt von Beinpresse,
  sofern die konkrete Bewegung es verlangt
- Hüftstreckung: Kreuzheben, rumänisches Kreuzheben und Good Morning
- Armbeugung und Armstreckung: Curls und Trizepsvarianten

## Nicht Teil des ersten Schritts

Kein automatisches Zusammenführen anhand normalisierter Namen, kein Löschen
fremdsprachiger Rohdaten und keine blinde Muskelvererbung vom Bucket auf jede
Variante. Erst Kandidaten und Schema fachlich prüfen, dann Suche und Import
gezielt darauf umstellen.
