# View Architecture: Fokus

## Purpose
Focus map derived from the `Hit` outputs of the Anamnese flow, with a nested Freedom layer for the next planning step.

## Features
- Shows only the filled `Hit` outputs as the actual focus map.
- Keeps `Insights` and `Lessons Learned` as a reflection block below the hits.
- Offers nested layers for returning to `Anamnese` and progressing to `Freedom Map`.
- `Freedom Map` has its own persisted fields (`Horizon`, `Foundation`, `First Miles`, `Additions`, `Eliminations`).

## Logic
- Reads hit and reflection data from `useUser()` in `src/contexts/UserContext.jsx`.
- Filters out empty hits before rendering.
- Uses local component state `layer` to switch between `focus`, `anamnese`, and `freedom`.
- Saves Freedom fields through `updateUserProfile()` into the same profile metadata document used by Anamnese.
