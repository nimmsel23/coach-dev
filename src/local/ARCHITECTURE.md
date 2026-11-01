# Local Coach workspace

LocalCoachApp is a separate entry without auth/Firestore imports. It lists the
existing client registry via the local-only API, injects a pure catalog search
and local persistence into the pinned PlanEditor, and owns selection/navigation.
The Python HTTP boundary delegates storage to modules/plan/runtime/local_plans.py.
Released snapshots and working drafts stay separate. Explicit delivery delegates
to Plan's transactional publisher using the existing Coach credential loader.

Plan ansehen opens the shared PlanDocument from the pinned Plan source, separate
from form editing. It shows responsive exercise tables/cards and A4 sheets; long
source notes are disclosures. No plan data changes when opening or printing.

## ClientForge Planstudio (2026-11-01)

`/clientforge/` führt zum gebauten `coach/clientforge.html`-Einstieg.
`client` wählt einen vorhandenen Klienten, `embed=1` bindet denselben
Planungsplatz ohne zweite Registry-Navigation im ClientForge-Tab ein.
PlanEditor und PlanDocument kommen weiter ausschließlich aus dem geprüften
Plan-Pin; Workout- und Übungs-Muskelansichten lesen dessen Katalogmetadaten.
Lokale Entwürfe/Freigabe/Versand bleiben getrennte Aktionen.

## Lokale Freigabe und veraltete Browser-Caches

Lokale GET-Aufrufe sind mit individuellen URLs und `no-store` gegen alte
Cache-first-Service-Worker geschützt. Der obsolete Root-Worker `/sw.js` wird
gezielt durch einen stillgelegten Worker ersetzt; offene Editorfenster werden
nicht neu geladen. Nur alte lokale Plan-API-Cacheeinträge werden entfernt.
Vor Freigabe wird der Plan frisch gelesen; abweichende Revisionen verlangen
eine erneute Prüfung. Offene Übungen erscheinen namentlich auf der Plankarte
mit direktem Zugang zu „Vorgaben ergänzen“. Freigeben bleibt vom Versand getrennt.
