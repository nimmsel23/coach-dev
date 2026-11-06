# Audit: Fokus

## Zweck
Verdichtete Fokus-Ansicht, die die befüllten `Hit`-Blöcke aus der Anamnese als eigentliche Focus Map darstellt und daraus in eine verschachtelte Freedom-Ansicht weiterführt.

## Komponenten

| Datei | Zweck | Zeilen |
|-------|-------|--------|
| `index.jsx` | Liest Hit-State aus `useUser()`, filtert leere Hits, rendert Focus Map plus Reflection und enthält den verschachtelten Freedom-Layer | 1 |
| `ARCHITECTURE.md` | Kurzüberblick über Datenquelle und View-Zweck | 1 |
| `AUDIT.md` | Audit-Notiz für den View | 1 |

## Datenfluss

- `useUser()` liefert Hit-, Reflection- und Freedom-Inhalte.
- `hits` wird lokal in `index.jsx` aus `hit1..hit4` gefiltert.
- `updateUserProfile()` speichert Freedom-Felder in `fitness/{uid}/profile/metadata` bzw. lokal im Fallback.

## Auffälligkeiten

- `Fokus` bleibt für die Hit-Bearbeitung weiterhin abgeleitet; geändert wird das eigentliche Hit-Material in `Anamnese`.
- `Freedom` ist hier bereits schreibend, aber noch klar als Zwischenschicht gedacht; der spätere Übergang zu `Frame` ist noch nicht implementiert.
