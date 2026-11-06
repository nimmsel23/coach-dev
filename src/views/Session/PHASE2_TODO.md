# Session-Tab Rebuild — Phase 2: Mittel, semi-isoliert

Quelle: Haiku-Doppel-Audit 2026-09-05. Voraussetzung: [[PHASE1_TODO]]
abgeschlossen (oder zumindest nicht blockierend).

## Stücke

- [x] **ActivityAddon.jsx + ActivitySection.jsx — NICHT zusammenlegen.**
      Ursprüngliche Diagnose (Audit 2026-09-05): beide sind im Kern
      ähnliche Activity-Picker-UI, aber mit divergenten Defaults
      (Activity-Type-Reihenfolge, Muscle-Target/Swim-Style-Sichtbarkeit
      nur bei bestimmten Typen im Cardio-Mode).
      - **Versuch 2026-09-05 (Sonnet-Agent):** strukturell zu einer
        gemeinsamen `ActivityPicker.jsx` mit Mode-Prop zusammengelegt,
        Verhalten dabei 1:1 reproduziert (keine fachliche Änderung).
        Dabei auch festgestellt: die "9 vs 10 Activity-Types"-Diagnose war
        **stale** — beide Listen enthielten zu dem Zeitpunkt bereits
        identische 10 Werte, nur die Anzeige-Reihenfolge unterscheidet sich.
      - **Nutzer-Korrektur 2026-09-05, grundsätzlich (siehe
        `feedback_never_unify_divergent_implementations` in der globalen
        Memory):** "GAR NICHTS ANGLEICHEN IN DER APP UND NICHTS
        VEREINHEITLICHEN — das ist ja das Problem hier in erster Linie!!
        Dadurch wird die App konsequent kastriert. Toter Code ist fast NIE
        tot sondern wurde abgehackt." Der Merge selbst — auch verhaltens-
        erhaltend über einen Mode-Prop — war bereits der falsche Schritt,
        nicht nur eine mögliche spätere Angleichung der Details.
      - **Revert 2026-09-05:** `ActivityPicker.jsx` wieder gelöscht,
        `ActivityAddon.jsx`/`ActivitySection.jsx` auf den Stand vor dem
        Merge zurückgesetzt (zwei eigenständige, unabhängig entwickelbare
        Komponenten). Die Divergenzen (Reihenfolge, Sichtbarkeits-Regeln)
        bleiben bestehen — gelten jetzt als bewusst, nicht als Bug/Drift,
        bis jemand explizit etwas an EINER der beiden Stellen erweitern
        will (nicht angleichen).
      - **Für künftige Agenten in diesem Repo:** ähnliche Fälle (zwei
        Komponenten/Funktionen die fast dasselbe tun, aber leicht anders)
        NICHT als Duplikat behandeln, das bereinigt gehört. Erst fragen,
        eher in Richtung "erweitern" statt "vereinheitlichen" denken.

- [x] **SessionHeader.jsx entwirren** (~200 Z., 4 Verantwortlichkeiten in
      einer Datei). Erledigt 2026-09-05: reines Aufsplitten, kein
      Verhaltensunterschied.
      - Titel-Zeile + Datumslabel + Day-Strip + Hint-Banner bleiben direkt
        in `SessionHeader.jsx` (Composer-Rolle).
      - Portal-Overflow-Menü ("Mehr" → Session-Details/Übungsquellen) nach
        `SessionHeaderMenu.jsx` extrahiert — 1:1-Kopie inkl. `createPortal`,
        eigener lokaler `moreOpen`-State. Vorbereitung für Phase 4
        (zentrales Modal-Layer), hier nur der Portal-Call isoliert, kein
        neues Modal-System gebaut.
      - Session-Pills (Multi-Session-Switcher, +/Löschen) + Kraft/Ausdauer-
        Mode-Switch nach `SessionModeAndPills.jsx` extrahiert.
      - Mehrfach-Datum-Parsing (`new Date(d + 'T12:00:00')` unabhängig in
        `SessionHeader.jsx` und `useDayStrip.js`) auf `parseLocalDate()` in
        `utils.js` reduziert, beide Stellen nutzen jetzt den Helper.

## Definition of Done pro Stück

1. Verhalten vorher/nachher identisch (Screenshot-Vergleich reicht,
   kein Snapshot-Test-Setup vorhanden).
2. Bei ActivityPicker-Merge: beide bisherigen Nutzungsstellen
   (Kraft-Finisher + Cardio-Mode) gegen den echten Session-JSON-Format
   getestet (`activity`-Objekt-Shape bleibt gleich).
3. Kein neues Duplicate-State eingeführt.

## Nicht in dieser Phase

ExerciseCard/ExerciseList/SessionSlots/useSession.js — siehe [[PHASE3_TODO]].
Modal-Zentralisierung komplett — siehe [[PHASE4_TODO]].
