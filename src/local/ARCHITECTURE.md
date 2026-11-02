# Local Coach workspace

LocalCoachApp is a separate entry without auth/Firestore imports. It lists the
existing client registry via the local-only API, injects a pure catalog search
and local persistence into the pinned PlanEditor, and owns selection/navigation.
The Python HTTP boundary delegates storage to modules/plan/runtime/local_plans.py.
Released snapshots and working drafts stay separate. Explicit delivery delegates
to Plan's transactional publisher using the existing Coach credential loader.

When no client is selected, the workspace shows a local office overview. It
loads each client's plan count from the local Plan store and reads completed
workouts from the existing local Fitness runtime mirror by the UID in
`client.json`. It also reads existing workout Tasks from each client's
`tw-data` database and highlights pending, overdue occurrences. A missing or
unreadable Taskwarrior response is shown separately from zero overdue tasks.
The API returns `available: false` when the UID or Fitness mirror file is
missing, so the overview does not present unavailable data as zero training.
Workout records stay in Fitness runtime and are not copied to the client
workspace or Firestore.

The `Premium-Tracking` tab mirrors scheduled local plan occurrences into the
client workspace's existing `tw-data` Taskwarrior database. Completion is
currently explicit in Coach or Taskwarrior; synchronization does not infer
completion from Firestore or write workout data there.

The client workspace also exposes private coaching notes through the existing
client-scoped `coaching-notes` API. Notes stay in klienten-python's client
workspace, one dated entry per client per day; the Coach UI only reads and
writes them through that local API. Replacing an existing daily entry requires
confirmation.

The local roster manager reads Firebase Auth users and maps them to
`~/.local/Klienten/*/client.json`. `coach_visible: false` hides an existing
contact/client without deleting its workspace. Adding a Firebase user as a
friend calls klienten-python's contact-aware workspace creator, which creates
the local workspace without a Praxis client row; selecting a paying client
uses the normal workspace creator. Both actions are local and loopback-only.
Coach/admin accounts are not selectable (profile role, Firebase claims,
`nimmsel23` and `nimmdaniel`); local workspaces with a non-client role are
omitted from the client roster.

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
