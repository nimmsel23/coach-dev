# Project: anatomy-kb

## Overview

`anatomy-kb` serves as the Anatomy Knowledge Layer for the `fitness-dev` ecosystem. Its primary purpose is to populate a muscle catalog with detailed anatomical information (origin, insertion, innervation) and didactic content, distilled from Obsidian Vault notes and structured using the Gemini API.

## Architecture

**Data Flow:**
1.  **Source Data:** Obsidian Vault notes (Markdown files).
2.  **Ingestion & Enrichment:** Processes notes using Gemini API to extract `muscle_anatomy` and `common_errors_explained`.
3.  **Muscle Data Storage:** YAML files under `muscles/{muscle_id}.yml`.
4.  **Teaching Layer Generation:** Muscle data pushed to `fitness-dev/catalog/kb/anatomy_teaching/{exercise_id}.yml`.
5.  **Synchronization:** Synchronized with Firestore for the PWA.

## CLI Usage (`anatomy` / `anatomy-agent`)

- `anatomy ingest <note_path>`: Extract data from Markdown notes.
- `anatomy enrich <exercise_id>`: Gemini-powered muscle enrichment.
- `anatomy teach <exercise_id>`: Display teaching content.
- `anatomy errors <exercise_id>`: Display common errors.
- `anatomy audit`: Completeness check.
- `anatomy firestore sync`: Deploy to Cloud.
