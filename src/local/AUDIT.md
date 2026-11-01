# Local Coach audit

No live-client fixture is used by tests. Local editing and releasing must cause
no Firebase browser requests. Legacy ClientForge files are read-only sources.
Client changes cannot retarget an open editor. Stale saves/releases fail rather
than overwriting. The API rejects non-loopback clients and foreign write origins.
Delivery is explicitly confirmed and uses the selected released version.

The primary plan-list action is now Plan ansehen. Imported source text must not
replace the actual exercise layout. Screen and print use Plan's shared renderer;
unknown prescriptions and original pause ranges remain visible.

## ClientForge Planstudio (2026-11-01)

`/clientforge/` führt zum gebauten `coach/clientforge.html`-Einstieg.
`client` wählt einen vorhandenen Klienten, `embed=1` bindet denselben
Planungsplatz ohne zweite Registry-Navigation im ClientForge-Tab ein.
PlanEditor und PlanDocument kommen weiter ausschließlich aus dem geprüften
Plan-Pin; Workout- und Übungs-Muskelansichten lesen dessen Katalogmetadaten.
Lokale Entwürfe/Freigabe/Versand bleiben getrennte Aktionen.
