Ja. **`fitness-agent doctor` ist der perfekte erste echte Schritt.**

Warum?

Weil bevor irgendein Generator, wger-Sync oder Anatomy-Layer kommt, muss der Agent prüfen können:

```text
Existiert meine Struktur?
Sind die YAMLs da?
Kann ich sie parsen?
Gibt es Aliases?
Gibt es Program Rules?
Ist wger erreichbar?
Ist Obsidian Exportpfad vorhanden?
Ist die externe DB optional verfügbar?
```

Also zuerst kein fancy AI-Kram, sondern:

```bash
fitness-agent doctor
```

Der sollte dann etwa sowas ausgeben:

```text
Fitness Agent Doctor

[OK] ~/.fitness-agent exists
[OK] exercises/chest.yml found
[OK] exercises/back.yml found
[OK] rules/program_rules.yml found
[OK] maps/aliases.yml found
[OK] muscles/muscles.yml found
[WARN] wger API not configured
[WARN] yuhonas/free-exercise-db not found
[OK] exports/obsidian exists

Status: usable local YAML mode
```

Damit hast du den ersten stabilen Checkpoint.

Danach Reihenfolge:

```text
1. doctor
2. yaml loader
3. alias resolver
4. exercise lookup
5. coverage calculator
6. obsidian export
7. wger bridge
8. anatomy teaching layer
```

Also ja: **Doctor zuerst.**
Das ist der Root-Check für das ganze Vitaltrainer-Lernsystem.
