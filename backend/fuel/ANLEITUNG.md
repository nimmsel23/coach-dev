# Nutrition Protocol Generator — Anleitung

Automatische Generierung von **7-Tage** (Ernährungstrainer B-Lizenz) oder **14-Tage** (Fitnesstrainer) Nahrungsaufnahmeprotokollen mit berechneten Nährwerten.

---

## Voraussetzungen

1. **wger-Docker muss laufen:**
   ```bash
   cd ~/docker-apps/docker
   docker compose up -d
   ```
   Erreichbar: `http://localhost:8000`

2. **Python 3 + requests-Library:**
   ```bash
   python3 -c "import requests" # sollte ohne Fehler laufen
   ```

---

## Schnellstart

### 7-Tage Protokoll (Ernährungstrainer)
```bash
nutrition-protocol-generator --days 7 --output ~/my-protocol-7.md
```

### 14-Tage Protokoll (Fitnesstrainer)
```bash
nutrition-protocol-generator --days 14 --output ~/my-protocol-14.md
```

### Vorschau (vor Export)
```bash
nutrition-protocol-generator --days 7 --preview
```
Zeigt Protokoll auf stdout, speichert nicht.

---

## Output-Format

Das generierte Protokoll hat folgendes Format:

```
# 7-Tage Nahrungsaufnahmeprotokoll

## Montag, 16. Mai 2026

### Vormittag (00:00 - 12:00 Uhr)
- 250ml Cappuccino Mandelmilch
- 60g Vollkorn-Brötchen
- 30g Käse (Gouda)

**Kalorien Vormittag: 541 kcal**

### Nachmittag (12:00 - 18:00 Uhr)
- 250g Thunfisch-Gemüse-Salat
- 60g Vollkornbrot

**Kalorien Nachmittag: 191 kcal**

### Abend (18:00 - 24:00 Uhr)
- 120g Rührei (2 Eier)
- 150g Reis (gekocht)
- 150g Brokkoli (gedämpft)

**Kalorien Abend: 429 kcal**

**Kalorien gesamt: 1161 kcal**
**Kohlenhydrate: 30% | Eiweiß: 25% | Fette: 46%**

---

## Wochensumme

**Gesamt-Kalorien: 8127 kcal** (7 Tage)
**Durchschnitt pro Tag: 1161 kcal**

**Makros Gesamtwoche:**
- Kohlenhydrate: 30%
- Eiweiß: 25%
- Fette: 46%
```

---

## Parameter

| Parameter | Beschreibung | Beispiel |
|-----------|--------------|----------|
| `--days` | Anzahl Tage (default: 7) | `--days 14` |
| `--output` | Ausgabedatei (default: `~/Nutrition/logs/protocol-YYYY-MM-DD.md`) | `--output ~/my-protocol.md` |
| `--preview` | Zeige Vorschau statt zu speichern | `--preview` |

---

## Mahlzeiten-Struktur

Das Script generiert täglich:

**Vormittag (00:00 - 12:00 Uhr):**
- Cappuccino mit Mandelmilch
- Vollkorn-Brötchen
- Käse

**Nachmittag (12:00 - 18:00 Uhr):**
- Thunfisch-Gemüse-Salat
- Vollkornbrot

**Abend (18:00 - 24:00 Uhr):**
- Protein-Variation (Hähnchen, Lachs, Eier)
- Kohlenhydrat-Variation (Reis, Kartoffeln, Süßkartoffeln)
- Gemüse-Variation (Brokkoli, Spinat, Salat)

Die Kombinationen variieren täglich für Realismus.

---

## Nährwerte-Quelle

Alle Kalorien + Makros (Protein, Kohlenhydrate, Fette) kommen aus der **wger-Datenbank** (`http://localhost:8000`).

Falls wger nicht erreichbar, fehlschlagende Anfragen werden übersprungen (Script läuft trotzdem weiter).

---

## Für die Ausbildungs-Abgabe

1. Generiere das Protokoll:
   ```bash
   nutrition-protocol-generator --days 7 --output ~/Ernährungstrainer-Protokoll.md
   ```

2. Öffne die Datei + überprüfe Plausibilität:
   ```bash
   cat ~/Ernährungstrainer-Protokoll.md
   ```

3. Konvertiere zu PDF (falls verlangt):
   ```bash
   # Mit pandoc oder online-Tool (z.B. markdowntopdf.com)
   pandoc ~/Ernährungstrainer-Protokoll.md -o ~/Ernährungstrainer-Protokoll.pdf
   ```

4. Reiche ein.

---

## Architektur

- **Nicht destruktiv:** `wger-food`, `wger-generate`, `fuel-log` bleiben unverändert
- **Standalone:** Das Script läuft unabhängig von fuel-dev
- **Deterministic:** Mahlzeiten-Variationen sind seed-based (reproduzierbar)

---

## Probleme

**Problem:** "connection refused" oder wger-Fehler
```
⚠ wger Fehler für 'Cappuccino Mandelmilch': ...
```

**Lösung:** Docker-Stack checken:
```bash
docker compose -f ~/docker-apps/docker/docker-compose.yml ps
# Sollte alle Container als "Up" zeigen
```

---

## Beispiel-Workflow

```bash
# 7-Tage Protokoll für Ernährungstrainer generieren
nutrition-protocol-generator --days 7 --preview  # Vorschau

# Wenn ok, abspeichern
nutrition-protocol-generator --days 7 --output ~/mein-protokoll.md

# 14-Tage Protokoll für Fitnesstrainer
nutrition-protocol-generator --days 14 --output ~/mein-protokoll-14.md

# Beide Aufgaben fertig!
```

---

## Kontakt / Fragen

Das Script ist in `~/Nutrition/bin/nutrition-protocol-generator`.
