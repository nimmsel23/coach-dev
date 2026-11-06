---
name: fitness-agent
description: Expert system for AlphaOS Fitness. Manages exercise catalogs, performs biomechanical audits, and synchronizes data with Firestore. Use when creating or modifying exercises, validating anatomy, or syncing the knowledge base.
---

# Fitness Agent

## Overview

The Fitness Agent is the procedural core of the AlphaOS Fitness ecosystem. It ensures biomechanical integrity and maintains the multi-tenant knowledge base in Firestore.

## Core Capabilities

### 1. Catalog Management
Use the `fitness-agent` CLI to manage the 3-tier exercise library.
- **Sync**: Run `fitness-agent kb-sync` to push local expert data to Firestore.
- **Import**: Use `fitness-agent import` for bulk additions from external sources (wger, yuhonas).

### 2. Biomechanical Auditing
Deterministic validation of exercises against anatomical rules.
- **Audit**: Run `fitness-agent audit all` before any catalog sync.
- **Rules**: Refer to [biomechanics.md](references/biomechanics.md) for the underlying logic.

### 3. Cloud Chamber Integration
Monitors the multi-tenant `inbox` for new entries and handles AI enrichment.
- **Watcher**: The `cloud_chamber/firestore_watcher.py` acts as the cloud-native expert daemon.
- **Enrichment**: See [enrichment.md](references/enrichment.md) for the AI workflow.

## Workflows

### Adding a New Exercise
1.  **Draft**: Create a YAML entry in `catalog/kb/exercises/`.
2.  **Enrich**: Run the agent to fill in biomechanical details (primary/secondary muscles).
3.  **Audit**: Run `fitness-agent audit anatomy` to ensure correctness.
4.  **Sync**: Run `fitness-agent kb-sync` to deploy to the Cloud PWA.

### Hidden Chamber Review
1.  Navigate to the **Coach** tab in the PWA.
2.  Review AI-enriched entries from the global `inbox`.
3.  Click **Approve** to promote to the global Knowledge Base.

## References

- [schemas.md](references/schemas.md): Firestore document structures.
- [biomechanics.md](references/biomechanics.md): Biomechanical rules and muscle mappings.
- [enrichment.md](references/enrichment.md): AI enrichment and approval workflows.
