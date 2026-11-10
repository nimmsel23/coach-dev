# Exercise Inbox = GitHub PRs (Zielbild)

Stand 2026-11-09. Primärpfad Laptop-`coach-sync` + Firestore bleibt vorerst
lesbar; **Source of Truth für Drafts wandert auf Git.**

## Modell

| Aktion | GitHub |
|--------|--------|
| Neuer Draft | Branch + PR: `inbox/<id>.yml` (noch nicht in `exercises/`) |
| Anreichern | CI `Enrich Inbox` oder LLM-Prompt → neuer Commit auf dem PR-Branch |
| Review | PR Conversation / Checks |
| Freigabe | separater Approve-Schritt: Datei nach `exercises/` (eigener Commit/PR oder Label+Action) — **Merge allein ≠ Expert-Approve** |
| Verwerfen | PR schließen |

Firestore `coachInbox` / `fitness/*/inbox` wird Cache/Spiegel, nicht Gate.

Bulk-Rohstoff (zwei Quellen):

| Quelle | In der KB |
|--------|-----------|
| **yuhonas** | Submodul `vendor/free-exercise-db` (`yuhonas.ref`) → `dist/exercises.json` (kein Dump mehr) |
| **wger** | Dump `exercises/unreviewed_wger.yml` (Import von lokalem wger-API; kein paralleles Git-Upstream) |

Inbox-Drafts tragen `wger_id` / `yuhonas_id`. Expert-Truth erst nach Gate in
`exercises/<id>.yml` (nicht die `unreviewed_*` Bulks).

## CI

- Workflow: `.github/workflows/enrich-inbox.yml`
- Prompt: `.github/prompts/enrich-inbox.md`
- Skript: `scripts/enrich_inbox.py`
- Liste offener Inbox-PRs: `scripts/list_inbox_prs.py`

## Coach-UI (Übergang)

1. **Jetzt:** Firestore-Inbox + optional PR-Liste (read-only) aus public API.
2. **Als Nächstes:** Coach-Inbox-Tab zeigt offene PRs (`inbox/**`); Aktionen
   triggern `repository_dispatch` / PR-Comments statt `coachCommands`.
3. **Später:** Firestore-Inbox-Writes abschalten; Mirror nur noch aus Git.
