# Prompt: Enrich one VitalOS inbox exercise

You are enriching YAML in the public KB repo https://github.com/nimmsel23/fitness
(repo root = former `catalog/kb`).

## Rules

1. Read `llms.txt` and `AGENTS.md` first.
2. Only edit files under `inbox/`. Never move/approve into `exercises/`.
3. Preserve `exercise_id`, `wger_id`, `yuhonas_id`, `external_ids`, `origin`.
4. `german` and `english` are both mandatory; `display_name` mirrors `german`.
5. `category` ∈ `push | pull | squat | lunge | gait | twist | carry` (not body regions).
6. Muscles: prefer fine IDs from `muscle_index.yml`; coarse buckets only if ambiguous.
7. `coaching_notes` and `common_errors` = flat German string arrays.
8. Set `enriched_at` to UTC ISO-8601; add tag `ci_enrichment` if tags exist.
9. Open a PR; do not push straight to `main` unless explicitly asked.

## Steps

1. Pick an inbox file (`scripts/enrich_inbox.py --list` or browse `inbox/`).
2. Read the full YAML + relevant muscle IDs.
3. Enrich in place (same filename).
4. PR title: `chore(inbox): enrich <filename>`
5. PR body: what changed + anything needing coach review.

## Automation

GitHub Action: `.github/workflows/enrich-inbox.yml`  
(`workflow_dispatch` or `repository_dispatch` type `enrich-inbox`).
