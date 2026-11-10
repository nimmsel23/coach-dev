# fitness — KB-Daten-Repo (`catalog/kb`)

VitalOS Exercise Knowledge Base. **Nur YAML-Daten, kein App-Code.**

Repo: https://github.com/nimmsel23/fitness  
Lokal: `~/dev/fitness` · in `coach-dev` als Submodul `fitness/catalog/kb`

## LLM-Webapps (ChatGPT / Claude / Grok / …)

1. Repo **`nimmsel23/fitness`** öffnen (public — Lesen ohne Auth).
2. Zuerst [`llms.txt`](./llms.txt), dann [`AGENTS.md`](./AGENTS.md).
3. Inbox-Enrichment-Prompt: [`.github/prompts/enrich-inbox.md`](./.github/prompts/enrich-inbox.md).

## CI-Enrichment (Cloud-Fallback)

Laptop-`coach-sync` bleibt Primärpfad. Offline/Cloud:

```bash
gh workflow run "Enrich Inbox" -R nimmsel23/fitness -f limit=1
# oder:
gh api repos/nimmsel23/fitness/dispatches -f event_type=enrich-inbox \
  -f client_payload='{"limit":"1"}'
```

Skript: [`scripts/enrich_inbox.py`](./scripts/enrich_inbox.py) · Workflow: `.github/workflows/enrich-inbox.yml`  
Ergebnis = PR auf `inbox/` (kein Auto-Approve nach `exercises/`).

Zielbild Inbox = GitHub-PRs: [`INBOX.md`](./INBOX.md).

## Layout

| Pfad | Inhalt |
|------|--------|
| `exercises/` | freigegebene Expert-Übungen |
| `inbox/` | Drafts vor Coach-Freigabe |
| `muscles/` | Muskeln + Regions-Buckets |
| `anatomy_teaching/` | Teaching-Layer |
| `coaching_notes/` | kurze Coaching-Notes |
| `rules/` | Katalog-Regeln |
| `registry/` | wger/yuhonas-Lookups |
| `vendor/free-exercise-db/` | gepinntes Submodul [yuhonas/free-exercise-db](https://github.com/yuhonas/free-exercise-db) (Bulk/Bilder); SHA in `yuhonas.ref` |
| `vendor/fma/` | gepinntes Submodul [uw-sig/FMA](https://github.com/uw-sig/FMA) **5.1.0**; SHA in `fma.ref` — Konzept-Ontology (`fma_id` in `muscles/`) |
| `registry/fma_kb_map.yml` | Katalog-Muskel ↔ FMA-IRI (52 Links); Voll-OWL optional via `scripts/fetch_fma_owl.sh` (Git LFS) |
| `exercises/unreviewed_wger.yml` | **Wger-Bulk-Quelle** in der KB — Snapshot aus lokalem wger-API-Import (kein Git-Upstream wie yuhonas) |

## Konsumenten

- `coach-dev` — Submodul unter `fitness/catalog/kb`
- Catalog-Python/CLI — `~/dev/coach-dev/fitness/catalog/` (`coach catalog`)
- Ownership: `~/dev/coach-dev/docs/OWNERSHIP-MAP.md`
