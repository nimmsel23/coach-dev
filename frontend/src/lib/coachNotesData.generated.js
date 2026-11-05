// AUTO-GENERATED — nicht manuell editieren.
// Quelle: fitness/catalog/kb/coaching_notes/ (SSOT).
// Neu erzeugen: npm run build:coaching-notes (läuft automatisch vor dev/build).

export const COACHING_NOTES = [
  {
    "id": "hit_vs_5x5_vs_hiit",
    "title": "HIT vs. 5x5 vs. HIIT — was mache ich da eigentlich?",
    "tags": [
      "training_method",
      "intensity",
      "hit",
      "recovery"
    ],
    "applies_to": {
      "activity_types": [
        "hiit"
      ],
      "topics": [
        "intensity_technique",
        "program_design"
      ]
    },
    "source": "whatsapp_coaching_matthias_2026-08-22",
    "summary": "Drei unterschiedliche Trainingsformen, die oft verwechselt werden — 5x5 (reines Krafttraining), HIT (High Intensity Training bis zum Muskelversagen mit Kurzhanteln/Maschinen) und HIIT (Intervall-Cardio, z.B. die Core-Finisher). Alle drei brauchen unterschiedliche Gewichtswahl, Pausenlänge und Zielpulsbereich.\n",
    "body": "## 5x5 — reines Krafttraining\n5 Wiederholungen, 5 Sätze, 3–5 Minuten Pause dazwischen. Orientierung: Wenn\ndu bei diesem Gewicht mehr als 5 Wiederholungen schaffst, warst du zu\nschwach belastet für reines Krafttraining — du rutschst dann eher in\nRichtung Hypertrophie (Muskelaufbau, typisch 3x 8–12 Wiederholungen).\n\n## HIT — High Intensity Training (Kurzhanteln/Maschinen)\nEin Gewicht, das du gerade noch halten kannst. Ziel: schnell schwach\nwerden, dabei mit allem dagegenhalten was du hast. Die paar Sekunden\nPause zwischen den Teil-Sätzen sind nur zum Luftholen — kein Reset.\n\n- Nur EIN Satz pro Übung/Muskel, dafür bis zum Muskelversagen.\n- Ziel-Gesamtbelastungsdauer: ~90 Sekunden Time-under-Tension, Pausen\n  zählen dabei nicht mit.\n- Ablauf: Warm-up (sehr leichtes Gewicht, hohe Wiederholungszahl) → 1 Min.\n  Pause → 90 Sekunden Vollgas mit Arbeitsgewicht.\n- Geht's trotz 15–20 Sekunden Pause nicht mehr weiter: Gewicht sofort\n  droppen (Drop-Set), dabei möglichst keine Pause beim Wechsel.\n- Puls darf nicht zu weit runterfallen — bei korrekter Ausführung ersetzt\n  HIT klassisches Cardio, weil der Puls durchgehend oben bleibt.\n- Effektiv: 3x 8–12 Wiederholungen (36+) in einem einzigen\n  Hochintensitätssatz sind für den Muskelpump mindestens gleichwertig zu\n  klassischem Hypertrophietraining, oft sogar effektiver.\n\n## HIIT — Intervall-Cardio (z.B. Core-Finisher)\nKlingt gleich wie HIT, ist aber etwas anderes: mehr Ausdauer-/\nIntervall-Charakter (Belastung/Erholung im Wechsel), z.B. die 5-Minuten\nCore-Workout-Finisher nach dem Krafttraining. Bewusst so konzipiert, dass\nsie 5x/Woche möglich sind — das ist kein Overtraining, sondern Programm-\nDesign (siehe Recovery-Fenster für `activity.type === 'hiit'` in\n`superkompensation.js`, deutlich kürzer als normales Cardio).\n\n## Faustregel: wann ist welche Intensität sinnvoll?\nSchweiß wie beim Laufband-Training = du bist im richtigen Bereich für\nHIT/HIIT-artige Belastung. Bei reinem Krafttraining (5x5) schwitzt du\ndeutlich weniger, dafür ist die Belastung pro Satz kurz und die Pause lang.\n",
    "follow_up": [
      {
        "question": "Woran erkenne ich, ob ich zu viel Gewicht genommen habe?",
        "answer": "Wenn die Wiederholungszahl von Satz zu Satz stark einbricht (z.B. 5 → 2 → 0) statt sich langsam der Erschöpfung anzunähern, war das Startgewicht meist zu hoch für die Zielintensität — bei HIT ist das okay (Drop-Set-Logik), bei 5x5 ist das ein Zeichen, das Gewicht zu reduzieren.\n"
      },
      {
        "question": "Ist ein 5-Minuten Core-Finisher jeden Tag Overtraining?",
        "answer": "Nein, wenn es wirklich ein kurzer HIIT-Finisher ist (nicht Krafttraining) — dafür konzipiert, hohe Frequenz zu vertragen.\n"
      }
    ],
    "created": "2026-08-22",
    "product_signals": [
      {
        "signal": "Klient trägt Sessions verzögert/gesammelt nach (\"noch nicht eingetragen\", \"trag dann beides ein\") statt direkt beim Training — wiederkehrendes Muster, nicht Einzelfall.\n",
        "hypothesis": "Logging-Hürde im Moment des Trainings zu hoch (App nicht griffbereit / zu viele Schritte) — Nachtragen aus dem Gedächtnis ist fehleranfälliger und reduziert die Motivation, überhaupt zu loggen.\n",
        "status": "open"
      },
      {
        "signal": "Klient weiß nicht, wie/ob der Coach seine Logs sieht (\"Wie genau schaust du das an?\") — die einzige Einsicht läuft über ein Coach-only-Terminal-Tool (`fitness log clients <slug>`), der Klient selbst hat keine vergleichbare Rückmeldeansicht.\n",
        "hypothesis": "Fehlende Transparenz/Feedback-Loop im Client-facing Teil der App — ein \"das sieht dein Coach\"-Hinweis oder eine einfache Fortschritts-Rückmeldung direkt in der App könnte die wahrgenommene Hürde senken (Motivation: sichtbar, dass geloggt wird).\n",
        "status": "open"
      },
      {
        "signal": "Klient beantwortet eine Split-/Rotationsfrage (Push/Legs/Pull um Wanderurlaub herum) sich selbst, ohne App-Unterstützung.\n",
        "hypothesis": "Mögliche Opportunity für eine einfache In-App-Split-Vorschlagslogik bei anstehenden Pausentagen/Reisen — niedrige Priorität, kein akuter Schmerzpunkt (Klient kam allein drauf).\n",
        "status": "open"
      }
    ]
  }
];
