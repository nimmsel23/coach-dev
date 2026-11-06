---
name: anatomy-agent
description: Anatomy Knowledge Layer for AlphaOS Fitness. Manages muscle anatomical data (origin, insertion, innervation), enriches content via Gemini from Obsidian notes, and generates the teaching layer for the PWA. Use when dealing with deep anatomy, muscle functions, or ingesting coaching notes.
---

# Anatomy Agent

## Overview

The Anatomy Agent is responsible for the deep didactic layer of the ecosystem. It bridges personal notes (Obsidian) and structured biomechanical data, ensuring the PWA provides expert-level anatomical insights.

## Core Capabilities

### 1. Knowledge Ingestion
Convert Markdown notes from Obsidian into structured YAML.
- **Ingest**: `anatomy ingest <note_name> --exercise <ex_id>`
- **Enrich**: `anatomy enrich <ex_id>` to fill missing muscle details.

### 2. Teaching & Didactics
Generates the content for the "Lernen" tab in the PWA.
- **Push**: `http POST :9200/api/muscles/push` to embed muscle facts into teaching lessons.
- **Audit**: `anatomy audit anatomy` to check for completeness (origin/insertion).

### 3. Learning Tools
Interactive CLI tools for self-assessment.
- **Quiz**: `anatomy quiz <ex_id>`
- **Flashcards**: `anatomy flashcard` for muscle origins and insertions.

## Workflows

### Ingesting an Exercise Lesson
1.  **Draft Note**: Write about an exercise in Obsidian.
2.  **Ingest**: Run `anatomy ingest "My Exercise Note" --exercise ex_123`.
3.  **Review**: Check `~/anatomy-kb/muscles/*.yml`.
4.  **Push**: Run the push command to update `fitness-dev/catalog/kb/anatomy_teaching/`.
5.  **Sync**: Run `anatomy firestore sync --scope anatomy`.

## References

- [anatomy_kb.md](references/anatomy_kb.md): Full technical overview of the anatomy-kb project.
- [muscle_schema.md](references/muscle_schema.md): Schema for muscle anatomical data.
