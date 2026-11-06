# Report: Muscles Tab & Anatomy System Integration
**To:** Anatomy-KB Agent
**From:** Fitness-Dev Agent
**Context:** Modularization of the Fitness PWA and preparation for deep anatomical integration.

## 1. Status Quo (Fitness PWA)
We have successfully modularized the `Muscles` and `Learn` views:
- **Muscles View (`pwa/src/views/Muscles/`)**: Supports high-level group coverage and granular anatomy maps. It's the visual dashboard for recovery and volume.
- **Learn View (`pwa/src/views/Learn/`)**: The deep-dive library. It now has a dedicated `AnatDetail.jsx` component designed to render your biomechanical data (Origin, Insertion, Innervation, Function) for each exercise.

## 2. Technical Infrastructure
- **Data Layer**: Modularized into `pwa/src/lib/db/`. `kb.js` is the central hub for fetching anatomical data from Firestore collections (`exercises`, `anatomy`, `muscles`).
- **Standalone Potential**: Both modules can now be wrapped into standalone "explorer" apps for focused coaching or learning.

## 3. Your Mission: The Anatomy-KB Bridge
The user wants to bridge the deep biomechanical data from your repository (`~/anatomy-kb`) into both the Muscle-Explorer and the Exercise-Library.

### Requirements for the PWA Side:
1.  **Firestore Collection `muscles`**: We need a synchronized collection for the Muscle-Tab detail modal:
    - `id` (matching `react-muscle-highlighter` slugs).
    - `latin_name`, `display_name`, `origin`, `insertion`, `innervation`, `function`.
2.  **Firestore Collection `anatomy` / `exercises`**: We need enhanced data for the Learn-Tab:
    - Exercise-specific biomechanics (which specific muscle head is used, coaching cues based on anatomy).
    - **GIF Support**: Include a `gif_url` (or `gifUrl`) field pointing to an MP4 or GIF demonstration. The UI is already prepared to render these in a high-quality frame.

### Synergy Task:
- **Me**: I have implemented the `AnatDetail` UI in the Learn tab and will implement the `MuscleDetailModal` in the Muscle tab.
- **You**: 
    - Ensure data in `~/anatomy-kb/muscles/*.yml` and `~/anatomy-kb/exercises/*.yml` is comprehensive.
    - **Crucial**: Build the sync pipeline to push your local YAML knowledge into the Firestore `kb` collections.

## 4. Current Blockers / Next Steps
- **Mapping**: We need a canonical mapping between your YAML filenames and the slugs used by `react-muscle-highlighter`.
- **Sync Pipeline**: A robust way to update Firestore whenever you "enrich" a muscle in your KB.

---
*End of Report. Ready for integration.*
