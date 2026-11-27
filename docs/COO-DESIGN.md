# COO: Klientenarbeit

Der Arbeitsplatz dient der konkreten Gesprächsvorbereitung und Trainingsauswertung.
Eine Person auswählen, ihre belegten Unterlagen prüfen, eine Vorbereitung erstellen,
den Entwurf lesen und bearbeiten und anschließend bewusst freigeben.

## Gestaltung

- Mineralgrau `#EEF2F4`: Arbeitsfläche. Weiß `#FFFFFF`: Quellen und Dokumente.
- Petrol `#173D48`: Personenauswahl und Navigation. Tinte `#182B34`: Text.
- Pflaume `#744765`: primäre Vorbereitung und Freigabe. Sekundärtext `#566771`.
- IBM Plex Sans für Bedienung und Daten, Source Serif 4 für die Leseansicht.
- Links Personenliste mit Suche; rechts die ausgewählte Akte, optionale Terminwahl,
  drei konkrete Aktionen, kompakte Quellen und einzeln aufklappbare Ergebnisse.
- Mobil wird die Personenliste horizontal, die Akte und Dokumente bleiben einspaltig.
- Modellwahl und freie Aufträge bleiben erreichbar, aber eingeklappt.

Die Personenliste erhält als einzige größere Fläche eine dunkle Farbe. Die übrige
Gestaltung bleibt ruhig; keine gleich großen Dashboard-Karten oder dekorativen
Kennzahlen. Lange Quellen werden auszugsweise gezeigt und lassen sich vollständig
öffnen. Dokumente bekommen eine größere Leseschrift und eine begrenzte Zeilenlänge.

## Verhalten

Die Auswahl bleibt innerhalb des Browser-Tabs erhalten. Bearbeitungen und geöffnete
Dokumente überleben Statusaktualisierungen; Entwurfstexte auch den Personenwechsel.
Neue Personen werden aus der vorhandenen Registry geladen, ohne Rollenfilter.
Erfolg und Fehler sind oberhalb der Arbeitsfläche sichtbar. Die Auftragskonsole ist
kein notwendiger Weg zu diesen Rückmeldungen.

Freigabe bleibt der bestehende serverseitige Commit-Vorgang. Das Design erzeugt
keine Termine, versendet keine Nachrichten und gibt keine Dokumente automatisch frei.
