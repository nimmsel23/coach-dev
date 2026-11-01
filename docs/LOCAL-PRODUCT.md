# Lokales Fitness-Produkt

`~/dev/fitness-dev` ist die Buildquelle. `deploy.sh staging --build-yes`
baut dort; `deploy.sh prod` übernimmt das fertige Staging-Produkt nach
`/opt/fitness`. `--dry-run` zeigt ausschließlich die geplanten Dateiänderungen,
ohne Build, Datenmigration, Installation oder Neustart.

Das Produkt enthält `dist/`, die optionale fertige Catalog-UI, Python-Code aus
`fitness`, `backend`, `db`, `anatomy_kb`, nötige Konfiguration und den
Katalog-Buildhelfer. Seine Python-Bibliotheken werden in `.venv` installiert.
Kein Node, Vite, Frontendquellcode, Git-Checkout, Archiv oder Nachbarrepo gehört
ins Ziel. Staging ist ebenfalls ein Runtime-Produkt, kein Build-Checkout.

Nutzerdaten gehören nach `~/.aos/fitness`; KB und Agentzustand liegen dort
unter `kb/` und `agent-state/`. Die Produktlinks zeigen ausschließlich auf diese
lokalen Daten, nie ins Dev-Repo. Beim ersten Deploy werden fehlende KB-Dateien
aus der Quelle ergänzt, vorhandene Dateien niemals überschrieben. Ein echtes
bestehendes Datenverzeichnis anstelle der KB-/State-Links wird nicht gelöscht;
es muss vor dem Deploy in die zentrale Datenablage übernommen werden.

Cloud-Sync, KI und Wger bleiben optionale Integrationen. Lokaler Datenbesitz
bedeutet keine Garantie, dass jede bestehende Appfunktion offline implementiert
ist. Firebase-Release und lokales Deployment sind getrennt.

Prüfung: `python tests/test_deploy_runtime.py`. Ein Testlauf am 2026-10-31 ergab
5.95 MB App-Dateien ohne Python-Bibliotheken und persönliche Daten. Keine
Änderung an Ports oder Dienstnamen.
