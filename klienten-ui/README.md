# Klienten-Oberflächen für Coach :9150

| Ordner | Produkt | Route | Fokus |
|---|---|---|---|
| `schmiede/` (+ `schmiede-src/`) | ClientForge | `/schmiede/`, `/k/<id>/` | Yuhonas, Trainingsplan, Ernährung |
| `konsole/` (+ `konsole-src/`) | Konsole | `/konsole/` | CRM, Buchhaltung, Praxis |

Coach-Firebase-App unter `/coach/` und `dist-coach` ist getrennt von ClientForge.

Env: `KLIENTEN_UI_ROOT` zeigt auf diesen Ordner (Default).

```bash
# ClientForge bauen
cd schmiede-src && npm install && npm run build

# Konsole bauen
cd ../konsole-src && npm install && npm run build
```

Agenten: siehe `AGENTS.md`.
